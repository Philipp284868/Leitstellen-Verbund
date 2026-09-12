import { spawn, fork } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { context } from "esbuild";
import { serverBuildOptions } from "./server-build-options.mjs";
const frontend = Number(process.env.DEV_PORT || 5173),
  backend = Number(process.env.DEV_API_PORT || 4010);
if (process.env.LV_BUILD_WORLD && process.env.LV_BUILD_WORLD !== "germany-1")
  throw Error("Deutschland ist die einzige aktive Spielwelt.");
const world = "germany-1";
if (!process.env.GEODATA_DIR || !process.env.GRAPHHOPPER_URL)
  throw Error(
    "Deutschland-Entwicklung benötigt GEODATA_DIR und GRAPHHOPPER_URL mit vorhandenen lokalen Daten. Kein Import beim Entwicklungsstart.",
  );
// A dedicated development variable avoids accidentally opening a production DATA_DIR.
const dataDir = resolve(
  process.env.DEV_DATA_DIR ||
    `../leitstellen-verbund-${world}-development-data`,
);
mkdirSync(dataDir, { recursive: true });
const outdir = resolve(".tools/dev", world);
const env = {
  ...process.env,
  NODE_ENV: "development",
  LV_BUILD_WORLD: world,
  HOST: "127.0.0.1",
  PORT: String(backend),
  PUBLIC_URL: `http://127.0.0.1:${frontend}`,
  DATA_DIR: dataDir,
  ALLOW_HTTP: "true",
  TRUSTED_PROXIES: "",
  LV_DEV_BACKEND: `http://127.0.0.1:${backend}`,
  LV_DEV_MODULE: resolve(outdir, "dev-entry.js"),
};
let worker,
  exited,
  compiler,
  vite,
  closing = false,
  queue = Promise.resolve();
async function startBackend() {
  worker = fork(resolve("scripts/dev-server.mjs"), [], {
    env,
    stdio: ["inherit", "inherit", "inherit", "ipc"],
    windowsHide: true,
  });
  exited = new Promise((done, reject) => {
    worker.once("error", reject);
    worker.once("exit", done);
  });
  await Promise.race([
    new Promise((done) =>
      worker.once("message", (m) => m === "ready" && done()),
    ),
    exited.then(() => {
      throw Error(
        "Entwicklungsserver startet nicht; Ausgabe und Datenpfad prüfen.",
      );
    }),
  ]);
  console.log("Lokaler Multiplayer-Server bereit.");
  process.send?.({ type: "backend-ready", pid: worker.pid });
}
async function stopBackend() {
  if (!worker || worker.exitCode !== null) return;
  if (worker.connected) worker.send("stop");
  const code = await exited;
  if (code !== 0) throw Error("Entwicklungsserver wurde nicht sauber beendet.");
}
async function stop(code = 0) {
  if (closing) return;
  closing = true;
  try {
    await compiler?.dispose();
    await queue;
    await stopBackend();
  } catch (error) {
    console.error(error);
    code = 1;
  }
  if (vite && vite.exitCode === null) {
    const done = new Promise((resolve) => vite.once("exit", resolve));
    vite.kill("SIGTERM");
    await done;
  }
  process.exitCode = code;
  if (process.connected) process.disconnect();
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
process.on("disconnect", () => void stop());
process.on("message", (m) => {
  if (m === "stop") void stop();
});
try {
  const options = serverBuildOptions(outdir);
  let previousOutput;
  compiler = await context({
    ...options,
    entryPoints: ["src/server/dev-entry.ts"],
    plugins: [
      ...options.plugins,
      {
        name: "restart-after-success",
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length || closing) return;
            const output = readFileSync(resolve(outdir, "dev-entry.js"));
            if (!previousOutput) {
              previousOutput = output;
              return;
            }
            if (previousOutput.equals(output)) return;
            previousOutput = output;
            queue = queue.then(async () => {
              if (closing) return;
              await stopBackend();
              if (!closing) await startBackend();
            });
            void queue.catch((error) => {
              console.error(error);
              void stop(1);
            });
          });
        },
      },
    ],
  });
  await compiler.rebuild();
  await startBackend();
  await compiler.watch();
  vite = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      String(frontend),
      "--strictPort",
    ],
    { env, stdio: "inherit", windowsHide: true },
  );
  vite.once("error", (error) => {
    console.error(error);
    void stop(1);
  });
  vite.once("exit", (code) => {
    if (!closing) void stop(code || 0);
  });
  console.log(
    `Entwicklungsansicht: http://127.0.0.1:${frontend} (${world}; isolierte lokale Daten)`,
  );
} catch (error) {
  console.error(error);
  await stop(1);
}
