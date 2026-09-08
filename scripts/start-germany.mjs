import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { loadEnvFile } from "node:process";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";

const script = fileURLToPath(import.meta.url);
const inside = (parent, child) => {
  const path = relative(parent, child);
  return (
    path === "" ||
    !(path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path))
  );
};
function canonical(path) {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  if (parent === path) throw Error("Datenpfad kann nicht aufgelöst werden.");
  return resolve(canonical(parent), relative(parent, path));
}
async function occupied(url) {
  const address = new URL(url);
  return new Promise((done) => {
    const socket = createConnection({
      host: address.hostname,
      port: Number(address.port),
    });
    const finish = (value) => {
      socket.destroy();
      done(value);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(1000, () => finish(true));
  });
}

/** Separate application root and deadlines also allow isolated lifecycle tests. */
export async function runGermany({
  programRoot = resolve(dirname(script), ".."),
  routerUrl = "http://127.0.0.1:8989",
  startupTimeoutMs = 120000,
  shutdownTimeoutMs = 30000,
} = {}) {
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw Error("Node.js 24 erforderlich.");
  programRoot = realpathSync(programRoot);
  const env = resolve(programRoot, ".env");
  if (existsSync(env)) loadEnvFile(env);
  if (!process.env.DATA_DIR || !process.env.GEODATA_DIR)
    throw Error(
      "Deutschland benötigt DATA_DIR und GEODATA_DIR. Bestehende Rivermere-Daten bleiben unverändert.",
    );
  const data = canonical(resolve(programRoot, process.env.DATA_DIR));
  const geo = canonical(resolve(programRoot, process.env.GEODATA_DIR));
  if (inside(programRoot, data) || inside(programRoot, geo))
    throw Error(
      "Spiel- und Geodaten müssen außerhalb des Programmverzeichnisses liegen.",
    );
  if (inside(data, geo) || inside(geo, data))
    throw Error("Spieldaten und Geodaten benötigen getrennte Verzeichnisse.");
  if (
    (existsSync(data) && !statSync(data).isDirectory()) ||
    (existsSync(geo) && !statSync(geo).isDirectory())
  )
    throw Error("DATA_DIR und GEODATA_DIR müssen Verzeichnisse sein.");
  const manifestFile = resolve(geo, "manifest.json");
  if (!existsSync(manifestFile))
    throw Error(
      "Fertiges Deutschland-Datenpaket fehlt. Datenpipeline zuerst vollständig ausführen.",
    );
  if (!inside(geo, realpathSync(manifestFile)))
    throw Error("Geodatenmanifest liegt außerhalb seines Datenpakets.");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  if (
    manifest.schema !== 1 ||
    manifest.status !== "ready" ||
    manifest.worldId !== "germany-1" ||
    !/^[a-f0-9]{64}$/.test(manifest.dataset)
  )
    throw Error(
      "Deutschland-Datenpaket ist noch nicht vollständig freigegeben.",
    );
  if (!existsSync(resolve(programRoot, "dist/germany/server/index.js")))
    throw Error(
      "Deutschland-Serverbuild fehlt. Anwendung zuerst vollständig bauen.",
    );
  // Children and direct server configuration resolve the same absolute paths,
  // including when AMP launches this script from a different working directory.
  process.env.DATA_DIR = data;
  process.env.GEODATA_DIR = geo;

  const children = new Set();
  const startup = new AbortController();
  let stopping = false,
    finish;
  const ended = new Promise((done) => {
    finish = done;
  });
  const stop = async (code = 0) => {
    if (stopping) return ended;
    stopping = true;
    startup.abort();
    for (const child of children) {
      if (child.connected) {
        child.send({ type: "shutdown" }, (error) => {
          if (error && child.exitCode === null && child.signalCode === null)
            child.kill("SIGTERM");
        });
      } else child.kill("SIGTERM");
    }
    const deadline = Date.now() + shutdownTimeoutMs;
    while (children.size && Date.now() < deadline) await pause(25);
    if (children.size) {
      console.error(
        "Eigene Unterprozesse beenden sich nicht rechtzeitig; erzwinge deren Stopp. Daten bitte prüfen.",
      );
      code = 1;
      for (const child of children) child.kill("SIGKILL");
      const forcedDeadline = Date.now() + 5000;
      while (children.size && Date.now() < forcedDeadline) await pause(25);
    }
    process.removeListener("SIGINT", signal);
    process.removeListener("SIGTERM", signal);
    process.removeListener("message", ipc);
    process.removeListener("disconnect", signal);
    finish(code);
    return ended;
  };
  const signal = () => {
    void stop();
  };
  const ipc = (message) => {
    if (message?.type === "shutdown") void stop();
  };
  process.once("SIGINT", signal);
  process.once("SIGTERM", signal);
  process.on("message", ipc);
  if (process.connected) process.once("disconnect", signal);
  const spawnChild = (args, router = false) => {
    if (stopping) return undefined;
    const child = spawn(process.execPath, args, {
      cwd: programRoot,
      stdio: ["inherit", "inherit", "inherit", "ipc"],
      windowsHide: true,
      env: process.env,
    });
    children.add(child);
    child.once("error", (error) => {
      children.delete(child);
      console.error(error.message);
      void stop(1);
    });
    child.once("exit", (code, exitSignal) => {
      children.delete(child);
      if (!stopping) {
        if (router)
          console.error(`Routingdienst beendet (${exitSignal || code}).`);
        void stop(router ? 1 : (code ?? 1));
      }
    });
    return child;
  };
  try {
    if (!process.env.GRAPHHOPPER_URL) {
      if (await occupied(routerUrl))
        throw Error(
          "Routing-Port ist bereits belegt. Bestehenden Dienst prüfen und GRAPHHOPPER_URL ausdrücklich konfigurieren.",
        );
      if (stopping) return ended;
      spawnChild(["scripts/geodata/pipeline.mjs", "serve"], true);
      const deadline = Date.now() + startupTimeoutMs;
      while (!stopping) {
        try {
          const response = await fetch(routerUrl + "/info", {
            signal: AbortSignal.any([
              startup.signal,
              AbortSignal.timeout(1500),
            ]),
          });
          if (response.ok) break;
        } catch {
          /* bounded startup; shutdown cancels the active request */
        }
        if (stopping) return ended;
        if (Date.now() > deadline)
          throw Error("Routingdienst wurde nicht rechtzeitig bereit.");
        await pause(100);
      }
      process.env.GRAPHHOPPER_URL = routerUrl;
    }
    if (!stopping) spawnChild(["dist/germany/server/index.js"]);
  } catch (error) {
    if (!stopping) console.error(error.message);
    await stop(stopping ? 0 : 1);
  }
  return ended;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === script) {
  try {
    process.exit(await runGermany());
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
