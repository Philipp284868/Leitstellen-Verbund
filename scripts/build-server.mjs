import { build } from "esbuild";
await build({
  entryPoints: ["server/index.ts", "server/cli.ts"],
  outdir: "dist/server",
  define: {
    __LV_WORLD__: JSON.stringify("rivermere-1"),
  },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
  sourcemap: true,
});
