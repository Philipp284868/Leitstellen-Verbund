export function serverBuildOptions(outdir) {
  return {
    entryPoints: [
      "src/server/index.ts",
      "src/server/cli.ts",
      "src/server/lab-cli.ts",
    ],
    outdir,
    plugins: [],
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    packages: "external",
    sourcemap: true,
  };
}
