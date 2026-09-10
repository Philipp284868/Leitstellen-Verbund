import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

/** The small catalog travels with the reviewed Git revision; the multi-GB map package remains unchanged. */
export function installFacilityCatalog(
  programRoot,
  destination = resolve(programRoot, "dist/server/facilities.sqlite"),
) {
  const dir = resolve(programRoot, "data/facilities"),
    manifest = JSON.parse(readFileSync(resolve(dir, "manifest.json"), "utf8"));
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  if (
    manifest.schema !== 1 ||
    manifest.license !== "ODbL-1.0" ||
    manifest.bytes > 100_000_000
  )
    throw Error("Ungültiges Standortpaket.");
  if (
    existsSync(destination) &&
    hash(readFileSync(destination)) === manifest.sha256
  )
    return manifest;
  const compressed = readFileSync(resolve(dir, "catalog.sqlite.gz"));
  if (hash(compressed) !== manifest.compressedSha256)
    throw Error("Standortpaket-Prüfsumme falsch; bisheriger Katalog erhalten.");
  const data = gunzipSync(compressed, { maxOutputLength: manifest.bytes });
  if (data.length !== manifest.bytes || hash(data) !== manifest.sha256)
    throw Error(
      "Standortkatalog-Prüfsumme falsch; bisheriger Katalog erhalten.",
    );
  mkdirSync(dirname(destination), { recursive: true });
  const staged = destination + "." + crypto.randomUUID() + ".pending";
  writeFileSync(staged, data, { flag: "wx" });
  const db = new DatabaseSync(staged, { readOnly: true });
  try {
    if (
      db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" ||
      db.prepare("SELECT value FROM metadata WHERE key='dataset'").get()
        ?.value !== manifest.dataset
    )
      throw Error("Ungültiger Standortindex; bisheriger Katalog erhalten.");
  } finally {
    db.close();
  }
  renameSync(staged, destination);
  return manifest;
}
