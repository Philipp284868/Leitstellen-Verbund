import { build } from "esbuild";
import { resolve } from "node:path";
const germany = process.env.LV_BUILD_WORLD === "germany-1";
await build({
  entryPoints: ["server/index.ts", "server/cli.ts"],
  outdir: germany ? "dist/germany/server" : "dist/server",
  define: {
    __LV_WORLD__: JSON.stringify(germany ? "germany-1" : "rivermere-1"),
  },
  plugins: germany
    ? [
        {
          name: "germany-world",
          setup(build) {
            build.onResolve({ filter: /(?:^|\/)world$/ }, () => ({
              path: resolve("src/germany/world.ts"),
            }));
          },
        },
      ]
    : [],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
  sourcemap: true,
});
