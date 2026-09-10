import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { bootstrapPnpm } from "./pnpm-bootstrap.mjs";
if (Number(process.versions.node.split(".")[0]) !== 24)
  throw Error("AMP muss Node.js 24 verwenden.");
if (process.argv.slice(2).some((arg) => arg !== "--install-only"))
  throw Error("Unbekannte AMP-Setup-Option.");
const root = fileURLToPath(new URL("../", import.meta.url)),
  started = performance.now();
const manager = await bootstrapPnpm(root);
async function run(args) {
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, [manager.file, ...args], {
      cwd: root,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
      env: { ...process.env, NODE_ENV: "development", CI: "true" },
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? done()
        : reject(Error(`Setup-Schritt fehlgeschlagen (${code}).`)),
    );
  });
}
const bootstrapped = performance.now();
await run(["install", "--frozen-lockfile", "--prod=false"]);
const installed = performance.now();
const installOnly = process.argv.includes("--install-only");
if (!installOnly) await run(["build"]);
await mkdir(resolve(root, ".tools/test-runs"), { recursive: true });
await writeFile(
  resolve(root, ".tools/test-runs/setup.json"),
  JSON.stringify(
    {
      schema: 1,
      version: manager.version,
      downloaded: manager.downloaded,
      repaired: manager.repaired,
      bootstrapMs: bootstrapped - started,
      installMs: installed - bootstrapped,
      buildMs: performance.now() - installed,
      installOnly,
    },
    null,
    2,
  ),
);
console.log(
  installOnly
    ? "Projektabhängigkeiten geprüft und bereit."
    : "AMP-Setup erfolgreich. Deutschland: scripts/start-germany.mjs; Server: dist/server/index.js. Spiel- und Geodaten bleiben außerhalb des Programms; vorhandene Daten und .env wurden nicht verändert.",
);
