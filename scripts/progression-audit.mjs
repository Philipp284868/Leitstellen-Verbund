import { build } from "esbuild";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const dir = await mkdtemp(resolve(tmpdir(), "lv-progression-audit-"));
const file = resolve(dir, "audit.mjs");
await build({
  entryPoints: ["server/progression-audit.ts"],
  outfile: file,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
});
await import(pathToFileURL(file).href);
