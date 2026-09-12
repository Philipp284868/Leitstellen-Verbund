import { readFile, writeFile } from "node:fs/promises";
import { parseChangelog } from "../src/changelog.ts";
const items = parseChangelog(await readFile("CHANGELOG.md", "utf8"));
const { version } = JSON.parse(await readFile("package.json", "utf8"));
if (!items.some((x) => x.version === version))
  throw Error("Installierte Version fehlt in CHANGELOG.md");
await writeFile(
  "dist/client/changelog.json",
  JSON.stringify({ installed: version, items }) + "\n",
);
