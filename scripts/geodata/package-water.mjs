import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
const path = "data/water/germany-260907.ndjson.gz";
const input = createReadStream(path).pipe(createGunzip());
const lines = createInterface({ input, crlfDelay: Infinity });
let header,
  count = 0,
  rawBytes = 0;
const kinds = {};
for await (const line of lines) {
  rawBytes += Buffer.byteLength(line) + 1;
  const row = JSON.parse(line);
  if (!header) {
    header = row;
    continue;
  }
  if (
    !/^node:\d+$/.test(row.id) ||
    !["fire_hydrant", "suction_point"].includes(row.properties.emergency)
  )
    throw Error("Ungültige Entnahmestelle");
  kinds[row.properties.emergency] = (kinds[row.properties.emergency] ?? 0) + 1;
  count++;
}
const bytes = readFileSync(path);
const manifest = {
  ...header,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  bytes: bytes.length,
  rawBytes,
  total: count,
  kinds,
};
writeFileSync(
  "data/water/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(JSON.stringify(manifest));
