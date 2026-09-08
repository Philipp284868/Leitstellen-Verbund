import { build } from "esbuild";
await build({
  entryPoints: ["server/index.ts", "server/cli.ts"],
  outdir:
    process.env.LV_WORLD === "rivermere-1"
      ? "dist/worlds/rivermere/dist/server"
      : "dist/server",
  define: {
    __LV_WORLD__: JSON.stringify(process.env.LV_WORLD || "falkenried-2"),
  },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
  sourcemap: true,
});
