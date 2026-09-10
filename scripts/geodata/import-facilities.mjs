import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  normalizeFacilities,
  writeFacilityCatalog,
} from "./facility-catalog.mjs";

const [source, indexPath, output, supplementPath, previousPath] =
  process.argv.slice(2);
if (!source || !indexPath || !output)
  throw Error(
    "import-facilities extraction.ndjson index.sqlite output.sqlite [supplement.json] [previous.sqlite]",
  );
const index = new DatabaseSync(resolve(indexPath), { readOnly: true });
const metadata = Object.fromEntries(
  index
    .prepare("SELECT key,value FROM metadata")
    .all()
    .map((r) => [r.key, r.value]),
);
const previousDb = previousPath
  ? new DatabaseSync(resolve(previousPath), { readOnly: true })
  : undefined;
try {
  const previous =
    previousDb
      ?.prepare("SELECT data FROM facilities")
      .all()
      .map((r) => {
        const entry = JSON.parse(r.data);
        entry.sources = [
          ...new Set([
            ...entry.sources,
            ...previousDb
              .prepare("SELECT source FROM aliases WHERE facility_id=?")
              .all(entry.id)
              .map((a) => a.source),
          ]),
        ];
        return entry;
      }) || [];
  const records = readFileSync(source, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
  const supplemental = supplementPath
    ? JSON.parse(readFileSync(supplementPath, "utf8"))
    : [];
  const rows = normalizeFacilities(records, {
    snapshot: metadata.snapshot,
    previous,
    supplemental,
    reviews: JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL("../../data/facilities/reviews.json", import.meta.url),
        ),
        "utf8",
      ),
    ),
  });
  console.log(
    `Normalized ${records.length} candidates to ${rows.length} facilities; resolving bounded road access.`,
  );
  console.log(
    JSON.stringify(
      writeFacilityCatalog(resolve(output), rows, {
        dataset: metadata.source_sha256,
        snapshot: metadata.snapshot,
        index,
        previousPath,
      }),
      null,
      2,
    ),
  );
} finally {
  index.close();
  previousDb?.close();
}
