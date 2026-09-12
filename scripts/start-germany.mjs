import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { resolveConfiguration } from "./configuration.mjs";
import { inspectInstallation } from "./installation-storage.mjs";
import { assertPortFree } from "./network-check.mjs";

const script = fileURLToPath(import.meta.url);
function maintenanceCommand(args) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string"))
    throw Error("Ungültige Wartungsargumente.");
  const [command = "facilities-preview", ...flags] = args;
  if (!["facilities-preview", "facilities-migrate"].includes(command))
    throw Error(
      "Wartung erlaubt nur facilities-preview oder facilities-migrate.",
    );
  const seen = new Set();
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (seen.has(flag)) throw Error(`Doppeltes Wartungsargument: ${flag}`);
    seen.add(flag);
    if (flag === "--resolutions") {
      if (!flags[++i] || flags[i].startsWith("--"))
        throw Error(
          "--resolutions benötigt den Pfad der geprüften Zuordnungsdatei.",
        );
    } else if (flag !== "--confirm" || command !== "facilities-migrate")
      throw Error(`Unzulässiges Wartungsargument: ${flag}`);
  }
  if (command === "facilities-migrate" && !seen.has("--confirm"))
    throw Error(
      "Standortmigration erst nach geprüftem Trockenlauf mit --confirm ausführen.",
    );
  return [command, ...flags];
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
  maintenanceArgs,
  onReady,
} = {}) {
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw Error("Node.js 24 erforderlich.");
  programRoot = realpathSync(programRoot);
  const maintenance =
    maintenanceArgs === undefined
      ? undefined
      : maintenanceCommand(maintenanceArgs);
  const configuration = resolveConfiguration({ programRoot });
  const env = configuration.environment;
  inspectInstallation(configuration);
  const entry = maintenance ? "dist/server/cli.js" : "dist/server/index.js";
  if (!existsSync(resolve(programRoot, entry)))
    throw Error(
      `Deutschland-Serverbuild fehlt (${entry}). Setup: node scripts/install-germany.mjs`,
    );
  if (!maintenance) await assertPortFree(env.HOST, Number(env.PORT));
  console.log(
    maintenance
      ? `Standortwartung: ${maintenance[0]}. Vorhandene Spiel- und Geodaten werden verwendet. Routing wird geprüft.`
      : `Startprüfung erfolgreich. PORT ${env.PORT} (${configuration.sources.PORT}); PUBLIC_URL ${env.PUBLIC_URL} (${configuration.sources.PUBLIC_URL}). Routing wird geprüft.`,
  );
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
  const spawnChild = (args, { router = false, ipc = true } = {}) => {
    if (stopping) return undefined;
    const child = spawn(process.execPath, args, {
      cwd: programRoot,
      stdio: ipc ? ["inherit", "inherit", "inherit", "ipc"] : "inherit",
      windowsHide: true,
      env,
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
    if (!env.GRAPHHOPPER_URL) {
      if (await occupied(routerUrl))
        throw Error(
          "Routing-Port ist bereits belegt. Bestehenden Dienst prüfen und GRAPHHOPPER_URL ausdrücklich konfigurieren.",
        );
      if (stopping) return ended;
      spawnChild(["scripts/geodata/pipeline.mjs", "serve"], { router: true });
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
      env.GRAPHHOPPER_URL = routerUrl;
    }
    if (!stopping) {
      if (maintenance) {
        spawnChild([entry, ...maintenance], { ipc: false });
        return ended;
      }
      const child = spawnChild(["dist/server/index.js"]);
      const timer = setTimeout(() => {
        console.error(
          "Spielserver wurde nicht rechtzeitig bereit. Datenbank, Geodaten und Routing prüfen.",
        );
        void stop(1);
      }, startupTimeoutMs);
      child.once("exit", () => clearTimeout(timer));
      let expectedActivation;
      const announce = () => {
        clearTimeout(timer);
        console.log(
          `Spiel bereit: ${env.HOST}:${env.PORT}; Browseradresse: ${env.PUBLIC_URL}. Öffentliche HTTPS-Erreichbarkeit separat prüfen.`,
        );
      };
      child.on("message", async (message) => {
        if (
          expectedActivation &&
          message?.type === "activated" &&
          message.token === expectedActivation
        ) {
          expectedActivation = undefined;
          announce();
        }
        if (message?.type === "ready" && message.port === Number(env.PORT)) {
          try {
            if (onReady) await onReady(message);
            expectedActivation = message.token;
            child.send({ type: "activate", token: message.token });
            if (!message.token) announce();
          } catch (error) {
            console.error(error.message);
            await stop(1);
          }
        }
      });
    }
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
