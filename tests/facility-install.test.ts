import { it, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  normalizeFacilities,
  writeFacilityCatalog,
} from "../scripts/geodata/facility-catalog.mjs";
import { installFacilityCatalog } from "../scripts/geodata/install-facilities.mjs";

it("installiert nur den integritätsgeprüften Katalog und erhält bei einem unvollständigen Update das letzte gültige Paket", () => {
  const root = mkdtempSync(resolve(tmpdir(), "lv-catalog-install-")),
    folder = resolve(root, "data/facilities"),
    source = resolve(root, "candidate.sqlite"),
    destination = resolve(root, "dist/server/facilities.sqlite");
  try {
    mkdirSync(folder, { recursive: true });
    const records = normalizeFacilities(
      [
        {
          source: "node:1",
          tags: { amenity: "fire_station", name: "Technische Fixture" },
          lon: 13.4,
          lat: 52.5,
          state: "DE-BE",
          geometry: { type: "Point", coordinates: [13.4, 52.5] },
          entrances: [],
        },
      ],
      { snapshot: "fixture" },
    );
    const report = writeFacilityCatalog(source, records, {
      dataset: "a".repeat(64),
      snapshot: "fixture",
    });
    const raw = readFileSync(source),
      compressed = gzipSync(raw),
      hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
    const manifest = {
      ...report,
      license: "ODbL-1.0",
      compressedSha256: hash(compressed),
    };
    writeFileSync(resolve(folder, "catalog.sqlite.gz"), compressed);
    writeFileSync(resolve(folder, "manifest.json"), JSON.stringify(manifest));
    installFacilityCatalog(root);
    expect(readFileSync(destination)).toEqual(raw);
    // An update advertises a new target, but its download is truncated.
    writeFileSync(
      resolve(folder, "manifest.json"),
      JSON.stringify({ ...manifest, sha256: "b".repeat(64) }),
    );
    writeFileSync(
      resolve(folder, "catalog.sqlite.gz"),
      compressed.subarray(0, 50),
    );
    expect(() => installFacilityCatalog(root)).toThrow(/Prüfsumme/);
    expect(readFileSync(destination)).toEqual(raw);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
