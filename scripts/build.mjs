import { spawn } from "node:child_process";
// Dependency installation may use NODE_ENV=development. The shipped application must not.
for (const args of [
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  ["node_modules/vite/bin/vite.js", "build"],
  ["scripts/build-server.mjs"],
]) {
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
      windowsHide: true,
      env: { ...process.env, NODE_ENV: "production" },
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? done() : reject(Error(`Build fehlgeschlagen (${code}).`)),
    );
  });
}
