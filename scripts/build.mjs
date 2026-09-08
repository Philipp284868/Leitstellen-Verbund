import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync, existsSync, realpathSync } from "node:fs";
import { resolve, relative } from "node:path";
import { spawn } from "node:child_process";
// Remove only the obsolete generated secondary distribution, never world data.
const obsolete = resolve("dist/worlds");
if (relative(resolve("dist"), obsolete) !== "worlds")
  throw Error("Ungültiger Buildpfad.");
if (
  existsSync(resolve("dist")) &&
  relative(realpathSync("."), realpathSync("dist")) !== "dist"
)
  throw Error(
    "Das Buildverzeichnis darf nicht auf einen anderen Datenordner verweisen.",
  );
if (
  existsSync(obsolete) &&
  relative(realpathSync("dist"), realpathSync(obsolete)) !== "worlds"
)
  throw Error(
    "Veraltete Buildausgabe verweist auf einen anderen Datenordner; Abbruch ohne Löschung.",
  );
rmSync(obsolete, { recursive: true, force: true });
// Dependency installation may use NODE_ENV=development. The shipped application must not.
for (const args of [
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  ["node_modules/vite/bin/vite.js", "build"],
  ["scripts/build-server.mjs"],
  ["scripts/build-germany.mjs", "--skip-typecheck"],
  ["scripts/sync-project-news.mjs"],
]) {
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        NODE_ENV: "production",
        LV_BUILD_WORLD: "rivermere-1",
      },
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
