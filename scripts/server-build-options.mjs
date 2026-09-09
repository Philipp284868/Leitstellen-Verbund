import { resolve } from "node:path";
export function serverBuildOptions(world, outdir) {
  return {
    entryPoints: ["server/index.ts", "server/cli.ts"],
    outdir,
    define: { __LV_WORLD__: JSON.stringify(world) },
    plugins:
      world === "germany-1"
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
  };
}
