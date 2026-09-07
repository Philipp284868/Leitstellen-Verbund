import { build } from "esbuild";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
const dir = await mkdtemp(resolve(tmpdir(), "lv-developer-lab-"));
const file = resolve(dir, "lab.mjs");
await build({
  entryPoints: ["server/lab-cli.ts"],
  outfile: file,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
});
const child = spawn(process.execPath, [file, ...process.argv.slice(2)], {
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
