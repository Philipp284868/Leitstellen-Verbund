import { spawn } from "node:child_process";
import { resolve } from "node:path";
const children = [];
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
const run = (args) => {
  const p = spawn(process.execPath, args, {
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(p);
  return p;
};
await new Promise((ok, bad) =>
  run(["scripts/build-server.mjs"]).on("exit", (code) =>
    code === 0 ? ok() : bad(Error("Serverbuild fehlgeschlagen")),
  ),
);
run(["--watch", "dist/server/index.js"]);
run([
  "node_modules/vite/bin/vite.js",
  "--host",
  "127.0.0.1",
  "--port",
  String(frontend),
  "--strictPort",
]);
const stop = () => {
  for (const p of children) if (p.exitCode === null) p.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log(
  `Entwicklungsansicht: http://127.0.0.1:${frontend} (isolierte lokale Daten)`,
);
