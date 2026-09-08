import { spawn, fork } from "node:child_process";
import { watch } from "node:fs";
import { resolve } from "node:path";
const frontend = Number(process.env.DEV_PORT || 5173),
  backend = Number(process.env.DEV_API_PORT || 4010);
const env = {
  ...process.env,
  NODE_ENV: "development",
  HOST: "127.0.0.1",
  PORT: String(backend),
  PUBLIC_URL: `http://127.0.0.1:${frontend}`,
  DATA_DIR: resolve("../leitstellen-verbund-development-data"),
  ALLOW_HTTP: "true",
  TRUSTED_PROXIES: "",
  LV_DEV_BACKEND: `http://127.0.0.1:${backend}`,
};
await new Promise((done, reject) => {
  const build = spawn(process.execPath, ["scripts/build-server.mjs"], {
    stdio: "inherit",
    env,
    windowsHide: true,
  });
  build.once("error", reject);
  build.once("exit", (code) =>
    code === 0 ? done() : reject(Error("Serverbuild fehlgeschlagen")),
  );
});
let worker,
  exited,
  closing = false,
  debounce,
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
        "Entwicklungsserver startet nicht; Sperre und Ausgabe prüfen.",
      );
    }),
  ]);
  console.log("Lokaler Multiplayer-Server bereit.");
}
async function stopBackend() {
  if (!worker || worker.exitCode !== null) return;
  if (worker.connected) worker.send("stop");
  const code = await exited;
  if (code !== 0) throw Error("Entwicklungsserver wurde nicht sauber beendet.");
}
await startBackend();
const vite = spawn(
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
const watcher = watch(resolve("dist/server"), (_event, file) => {
  if (file !== "index.js" || closing) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    queue = queue
      .then(async () => {
        if (closing) return;
        await stopBackend();
        if (!closing) await startBackend();
      })
      .catch((error) => {
        console.error(error);
        void stop(1);
      });
  }, 150);
});
async function stop(code = 0) {
  if (closing) return;
  closing = true;
  clearTimeout(debounce);
  watcher.close();
  try {
    await stopBackend();
  } catch (error) {
    console.error(error);
    code = 1;
  }
  if (vite.exitCode === null) vite.kill("SIGTERM");
  process.exitCode = code;
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
process.on("message", (m) => {
  if (m === "stop") void stop();
});
vite.once("error", (error) => {
  console.error(error);
  void stop(1);
});
vite.once("exit", (code) => {
  if (!closing) void stop(code || 0);
});
console.log(
  `Entwicklungsansicht: http://127.0.0.1:${frontend} (isolierte lokale Daten)`,
);
