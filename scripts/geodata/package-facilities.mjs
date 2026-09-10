import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
const source = resolve(process.argv[2] || "");
if (!process.argv[2] || !process.argv.includes("--reviewed"))
  throw Error(
    "Geprüfter Kandidat erforderlich: package-facilities.mjs candidate.sqlite --reviewed. Ändert nur das lokale Git-Datenpaket.",
  );
const data = readFileSync(source),
  report = JSON.parse(readFileSync(source + ".json", "utf8"));
const hash = (b) => createHash("sha256").update(b).digest("hex");
if (data.length !== report.bytes || hash(data) !== report.sha256)
  throw Error("Kandidat passt nicht zum Importbericht.");
const candidate = new DatabaseSync(source, { readOnly: true });
try {
  if (
    candidate.prepare("PRAGMA integrity_check").get().integrity_check !== "ok"
  )
    throw Error("Katalog beschädigt.");
  const oldManifest = JSON.parse(
    readFileSync("data/facilities/manifest.json", "utf8"),
  );
  if (report.dataset !== oldManifest.dataset)
    throw Error(
      "Neuer PBF-Datensatz benötigt eine gemeinsame Karten-/Standortfreigabe.",
    );
  // Every old stable identity must remain, including retired records; a release cannot erase ownership references.
  const oldBytes = gunzipSync(
    readFileSync("data/facilities/catalog.sqlite.gz"),
  );
  // SQLite deserialize is not available in Node; inspect the installed, hash-verified prior catalog instead.
  const oldPath = resolve("dist/server/facilities.sqlite");
  if (hash(readFileSync(oldPath)) !== hash(oldBytes))
    throw Error(
      "Zuerst den bisherigen Git-Katalog bauen, dann den neuen Kandidaten prüfen.",
    );
  const old = new DatabaseSync(oldPath, { readOnly: true });
  try {
    for (const row of old.prepare("SELECT id FROM facilities").all())
      if (
        !candidate.prepare("SELECT id FROM facilities WHERE id=?").get(row.id)
      )
        throw Error(`Standortidentität fehlt im Update: ${row.id}`);
    for (const row of old
      .prepare("SELECT source,facility_id FROM aliases")
      .all())
      if (
        candidate
          .prepare("SELECT facility_id FROM aliases WHERE source=?")
          .get(row.source)?.facility_id !== row.facility_id
      )
        throw Error(`Quellreferenz würde umgebunden: ${row.source}`);
  } finally {
    old.close();
  }
} finally {
  candidate.close();
}
const compressed = gzipSync(data, { level: 9 });
writeFileSync("data/facilities/catalog.sqlite.gz", compressed);
writeFileSync(
  "data/facilities/manifest.json",
  JSON.stringify(
    {
      ...report,
      license: "ODbL-1.0",
      attribution: "© OpenStreetMap contributors",
      source: "https://download.geofabrik.de/europe/germany.html",
      compressedBytes: compressed.length,
      compressedSha256: hash(compressed),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Lokales Git-Standortpaket erstellt. Vor Veröffentlichung Tests und Diff prüfen; keine Spieldaten geändert.",
);
