import { build } from "esbuild";

// Historical migration/restore tests still exercise the original geography.
// These artifacts are never placed in dist or included in a runtime package.
export default async function setup() {
  await build({
    entryPoints: ["server/index.ts", "server/cli.ts"],
    outdir: ".tools/legacy-tests/server",
    define: { __LV_WORLD__: JSON.stringify("falkenried-2") },
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    packages: "external",
  });
}
