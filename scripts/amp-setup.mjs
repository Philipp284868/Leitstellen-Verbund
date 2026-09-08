import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Only Node built-ins: this file runs before node_modules exists.
if (Number(process.versions.node.split(".")[0]) !== 24)
  throw Error("AMP muss Node.js 24 verwenden.");
const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const version = /^pnpm@(\d+\.\d+\.\d+)$/.exec(pkg.packageManager)?.[1];
if (!version) throw Error("Exakt festgelegte pnpm-Version fehlt.");
const dir = resolve(root, ".tools", `pnpm-${version}`);
await mkdir(dir, { recursive: true });
async function fetchBytes(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw Error(`Download fehlgeschlagen: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
const metadata = JSON.parse(
  (await fetchBytes(`https://registry.npmjs.org/pnpm/${version}`)).toString(),
);
if (
  metadata.version !== version ||
  !metadata.dist?.integrity?.startsWith("sha512-")
)
  throw Error("Ungültige pnpm-Metadaten.");
const source = new URL(metadata.dist.tarball);
if (source.origin !== "https://registry.npmjs.org")
  throw Error("Unerwarteter Paketserver.");
const tar = await fetchBytes(source.href);
const digest = `sha512-${createHash("sha512").update(tar).digest("base64")}`;
if (digest !== metadata.dist.integrity)
  throw Error("pnpm-Paketintegrität fehlgeschlagen.");
// No global installation and no npm invocation or package-lock.json.
const archive = resolve(dir, "pnpm.tgz");
await writeFile(archive + ".part", tar);
await rename(archive + ".part", archive);
async function run(command, args, cwd = root, env = process.env) {
  await new Promise((done, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env,
      shell: false,
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? done()
        : reject(Error(`Setup-Schritt fehlgeschlagen (${code}).`)),
    );
  });
}
// The bundled pnpm tarball contains a self-contained CommonJS entry; extract with Node's zlib.
const { gunzipSync } = await import("node:zlib");
const data = gunzipSync(tar);
for (let offset = 0; offset + 512 <= data.length; ) {
  const header = data.subarray(offset, offset + 512);
  if (header.every((b) => b === 0)) break;
  const name = header.subarray(0, 100).toString().replace(/\0.*$/, "");
  const size =
    parseInt(
      header.subarray(124, 136).toString().replace(/\0.*$/, "").trim(),
      8,
    ) || 0;
  const type = header[156];
  if (name.startsWith("package/") && (type === 0 || type === 48)) {
    const relative = name.slice(8);
    if (
      relative.split("/").some((p) => p === "..") ||
      relative.startsWith("/") ||
      relative.includes("\\")
    )
      throw Error("Unsicherer Archivpfad.");
    const path = resolve(dir, relative);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, data.subarray(offset + 512, offset + 512 + size));
  }
  offset += 512 + Math.ceil(size / 512) * 512;
}
const pnpm = resolve(dir, "bin/pnpm.cjs");
await run(
  process.execPath,
  [pnpm, "install", "--frozen-lockfile", "--prod=false"],
  root,
  { ...process.env, NODE_ENV: "development", CI: "true" },
);
await run(process.execPath, [pnpm, "build"], root, {
  ...process.env,
  NODE_ENV: "development",
  CI: "true",
});
console.log(
  "AMP-Setup erfolgreich. Bestehender Server: dist/server/index.js; neuer Deutschland-Server: scripts/start-germany.mjs (benötigt eigene Spiel- und Geodaten). Daten und .env wurden nicht verändert.",
);
