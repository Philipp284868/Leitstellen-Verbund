import { spawn } from "node:child_process";
// Separate world binary: an application update must never reinterpret existing coordinates.
for (const args of [
  ...(process.argv.includes("--skip-typecheck")
    ? []
    : [["node_modules/typescript/bin/tsc", "--noEmit"]]),
  ["node_modules/vite/bin/vite.js", "build"],
  ["scripts/build-server.mjs"],
]) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        NODE_ENV: "production",
        LV_BUILD_WORLD: "germany-1",
      },
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(Error(`Deutschland-Build fehlgeschlagen (${code}).`)),
    );
  });
}
