import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fingerprint } from "./build-cache.mjs";
import { resolve } from "node:path";
const built = JSON.parse(readFileSync("dist/build-info.json", "utf8"));
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (
  built.schema !== 2 ||
  built.world !== "germany-1" ||
  built.commit !== head ||
  built.dirty ||
  execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    encoding: "utf8",
  }).trim() ||
  built.node !== process.version ||
  built.platform !== process.platform ||
  built.arch !== process.arch ||
  built.outputs !==
    (await fingerprint(resolve("."), ["dist/client", "dist/server"]))
)
  throw Error(
    "Buildartefakt gehört nicht zum sauberen Checkout und zur laufenden Node-Version.",
  );
console.log(`Buildherkunft bestätigt: ${head}, ${built.node}`);
