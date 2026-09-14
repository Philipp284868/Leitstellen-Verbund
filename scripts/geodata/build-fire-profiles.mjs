import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { classifyFireProfile } from "./fire-profile-classification.mjs";
const [input, output, snapshot] = process.argv.slice(2);
if (!input || !output || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot || ""))
  throw Error(
    "Erforderlich: Eingabe.ndjson Ausgabe.json Datenstand YYYY-MM-DD",
  );
const records = {},
  counts = {},
  byState = {};
let total = 0;
for await (const line of createInterface({ input: createReadStream(input) })) {
  const row = JSON.parse(line),
    tags = row.tags;
  if (tags?.amenity !== "fire_station") continue;
  total++;
  const p = classifyFireProfile(tags);
  counts[p.kind] = (counts[p.kind] || 0) + 1;
  const state = row.state || "unknown";
  byState[state] ??= {};
  byState[state][p.kind] = (byState[state][p.kind] || 0) + 1;
  if (p.kind !== "unknown")
    records[row.source] = {
      ...p,
      name: (tags.name || tags.operator || "Feuerwehr").slice(0, 160),
      state,
      tags: Object.fromEntries(
        ["name", "operator", "fire_station:type", "fire_station:team"]
          .filter((key) => tags[key])
          .map((key) => [key, tags[key]]),
      ),
    };
}
const hash = createHash("sha256");
for await (const chunk of createReadStream(input)) hash.update(chunk);
writeFileSync(
  output,
  JSON.stringify(
    {
      version: 1,
      snapshot,
      sha256: hash.digest("hex"),
      total,
      counts,
      byState,
      records,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ total, counts, byState }));
