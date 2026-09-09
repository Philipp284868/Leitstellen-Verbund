import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const built = JSON.parse(readFileSync("dist/build-info.json", "utf8"));
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (built.commit !== head || built.dirty || built.node !== process.version)
  throw Error(
    "Buildartefakt gehört nicht zum sauberen Checkout und zur laufenden Node-Version.",
  );
console.log(`Buildherkunft bestätigt: ${head}, ${built.node}`);
