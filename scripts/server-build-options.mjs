export function serverBuildOptions(outdir) {
  return {
    entryPoints: ["server/index.ts", "server/cli.ts", "server/lab-cli.ts"],
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
