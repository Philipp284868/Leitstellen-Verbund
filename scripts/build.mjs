import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
// Dependency installation may use NODE_ENV=development. The shipped application must not.
for (const args of [
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  ["node_modules/vite/bin/vite.js", "build"],
  ["scripts/build-server.mjs"],
  ["scripts/sync-project-news.mjs"],
  ["scripts/build-rivermere.mjs"],
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

// ZIP/AMP installations may have no Git executable or checkout. Ordinary builds remain supported.
let commit = null,
  dirty = true;
try {
  const options = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
  commit = execFileSync("git", ["rev-parse", "HEAD"], options).trim();
  dirty = Boolean(
    execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=normal"],
      options,
    ).trim(),
  );
} catch {
  /* Only release packaging requires verified Git provenance. */
}
writeFileSync(
  "dist/build-info.json",
  JSON.stringify({ commit, dirty, node: process.version }, null, 2) + "\n",
);
