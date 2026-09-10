import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export async function germanyRuntime() {
  await mkdir(".tools/node-runtime-fixture", { recursive: true });
  const outfile = ".tools/node-runtime-fixture/runtime.mjs";
  await build({
    entryPoints: ["tests/fixtures/germany/runtime.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
  });
  const { createGermanyRuntime } = await import(
    pathToFileURL(resolve(outfile)).href
  );
  return createGermanyRuntime();
}
