import { afterEach, beforeEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  writeFileSync,
  statSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import type { ServerResponse } from "node:http";
import { GermanyMaps } from "../server/germany/maps";

let dir: string;
const fingerprint = "a".repeat(64),
  demFingerprint = "d".repeat(64);
function dem(size = 16) {
  const db = new DatabaseSync(resolve(dir, "dem.mbtiles"));
  db.exec(
    "CREATE TABLE metadata(name TEXT PRIMARY KEY,value TEXT); CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB)",
  );
  for (const [name, value] of Object.entries({
    source_id: "dem-fixture",
    source_lock_sha256: "c".repeat(64),
    encoding: "terrarium",
    minzoom: "5",
    maxzoom: "11",
  }))
    db.prepare("INSERT INTO metadata VALUES(?,?)").run(name, value);
  db.prepare("INSERT INTO tiles VALUES(5,17,20,zeroblob(?))").run(size);
  db.close();
  const manifest = {
    status: "ready",
    source: "fixture",
    attribution: "Copernicus fixture",
    sha256: demFingerprint,
    bytes: statSync(resolve(dir, "dem.mbtiles")).size,
    sourceId: "dem-fixture",
    sourceLockSha256: "c".repeat(64),
    minzoom: 5,
    maxzoom: 11,
    tileSize: 256,
    encoding: "terrarium",
  };
  writeFileSync(resolve(dir, "dem-manifest.json"), JSON.stringify(manifest));
  return manifest;
}
beforeEach(() => {
  dir = mkdtempSync(resolve(tmpdir(), "lv-dem-store-"));
  writeFileSync(
    resolve(dir, "manifest.json"),
    JSON.stringify({
      schema: 1,
      worldId: "germany-1",
      status: "ready",
      snapshot: "2026-09-07",
      dataset: fingerprint,
    }),
  );
  const index = new DatabaseSync(resolve(dir, "index.sqlite"));
  index.exec("CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT)");
  index
    .prepare("INSERT INTO metadata VALUES('source_sha256',?)")
    .run(fingerprint);
  index.close();
  const tiles = new DatabaseSync(resolve(dir, "maps.mbtiles"));
  tiles.exec(
    "CREATE TABLE metadata(name TEXT PRIMARY KEY,value TEXT); CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB)",
  );
  tiles
    .prepare("INSERT INTO metadata VALUES('source_sha256',?)")
    .run(fingerprint);
  tiles.close();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it("weist übergroße DEM-Kacheln zurück und lässt normale Vektorkacheln verwendbar", () => {
  dem(4 * 1024 * 1024 + 1);
  const maps = new GermanyMaps(dir);
  try {
    expect(() => maps.tile(5, 17, 11, true)).toThrow("Größenbegrenzung");
    expect(maps.tile(5, 17, 11)).toBeNull();
  } finally {
    maps.close();
  }
});
it("liefert DEM mit passendem Fingerprint und eigenem MIME-Typ, sperrt alte Clients", () => {
  dem();
  const maps = new GermanyMaps(dir);
  const response = () => {
    const headers = new Map<string, unknown>();
    const result = {
      statusCode: 200,
      body: undefined as unknown,
      setHeader: (key: string, value: unknown) => headers.set(key, value),
      end: (body: unknown) => {
        result.body = body;
      },
    };
    return { result, headers };
  };
  try {
    const path = "/geo/dem/5/17/11.png",
      current = response();
    expect(
      maps.handle(
        path,
        new URL(`http://localhost${path}?dataset=${demFingerprint}`),
        current.result as unknown as ServerResponse,
      ),
    ).toBe(true);
    expect(current.result.statusCode).toBe(200);
    expect(current.headers.get("Content-Type")).toBe("image/png");
    expect(current.headers.get("ETag")).toContain(demFingerprint);
    const old = response();
    maps.handle(
      path,
      new URL(`http://localhost${path}?dataset=${fingerprint}`),
      old.result as unknown as ServerResponse,
    );
    expect(old.result.statusCode).toBe(409);
    expect(String(old.result.body)).toContain("neu laden");
  } finally {
    maps.close();
  }
});
it("schließt alle Dateihandles nach abgelehntem DEM-Metadatenstand", () => {
  const manifest = dem();
  writeFileSync(
    resolve(dir, "dem-manifest.json"),
    JSON.stringify({ ...manifest, sourceLockSha256: "e".repeat(64) }),
  );
  expect(() => new GermanyMaps(dir)).toThrow("Quellenstand");
  for (const name of ["index.sqlite", "maps.mbtiles", "dem.mbtiles"])
    renameSync(resolve(dir, name), resolve(dir, name + ".closed"));
});
it("übernimmt ein DEM ohne Freigabemanifest nicht still als einsatzbereit", () => {
  dem();
  rmSync(resolve(dir, "dem-manifest.json"));
  const maps = new GermanyMaps(dir);
  try {
    expect(maps.publicManifest().dem).toBeUndefined();
    expect(maps.tile(5, 17, 11, true)).toBeNull();
  } finally {
    maps.close();
  }
});
it.skipIf(process.platform === "win32")(
  "folgt keinem DEM-Symlink aus dem freigegebenen Paket",
  () => {
    const manifest = dem();
    const external = resolve(
      dir,
      "../",
      `outside-dem-${crypto.randomUUID()}.mbtiles`,
    );
    renameSync(resolve(dir, "dem.mbtiles"), external);
    try {
      symlinkSync(external, resolve(dir, "dem.mbtiles"));
      writeFileSync(
        resolve(dir, "dem-manifest.json"),
        JSON.stringify(manifest),
      );
      expect(() => new GermanyMaps(dir)).toThrow("außerhalb");
    } finally {
      rmSync(external, { force: true });
    }
  },
);
