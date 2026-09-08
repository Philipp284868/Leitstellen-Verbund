import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { GermanyMaps } from "../server/germany/maps";
import {
  project,
  unproject,
  meters,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  inBounds,
} from "../src/germany/projection";

const folders: string[] = [];
afterEach(() => {
  for (const p of folders.splice(0))
    rmSync(p, { recursive: true, force: true });
});
function fixture(status = "ready") {
  const dir = mkdtempSync(join(tmpdir(), "lv-germany-map-"));
  folders.push(dir);
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      schema: 1,
      worldId: "germany-1",
      status,
      snapshot: "2026-09-07",
      dataset: "a".repeat(64),
    }),
  );
  const db = new DatabaseSync(join(dir, "index.sqlite"));
  db.exec("CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT)");
  db.prepare("INSERT INTO metadata VALUES('source_sha256',?)").run(
    "a".repeat(64),
  );
  db.exec(`CREATE TABLE places(id INTEGER PRIMARY KEY,name TEXT,kind TEXT,display_name TEXT,lon REAL,lat REAL,region TEXT);
    CREATE VIRTUAL TABLE places_fts USING fts5(name,display_name,content='places',content_rowid='id');
    INSERT INTO places VALUES(1,'Berlin','city','Berlin',13.405,52.52,'Berlin');
    INSERT INTO places VALUES(2,'Hauptstraße','street','Hauptstraße, Berlin',13.41,52.51,'Berlin');
    INSERT INTO places_fts(places_fts) VALUES('rebuild');
    CREATE TABLE anchors(id INTEGER PRIMARY KEY,lon REAL,lat REAL,name TEXT);
    INSERT INTO anchors VALUES(19,13.405,52.52,'Straßenstandort');`);
  db.close();
  const tiles = new DatabaseSync(join(dir, "maps.mbtiles"));
  tiles.exec("CREATE TABLE metadata(name TEXT PRIMARY KEY,value TEXT)");
  tiles
    .prepare("INSERT INTO metadata VALUES('source_sha256',?)")
    .run("a".repeat(64));
  tiles.exec(
    "CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB)",
  );
  tiles
    .prepare("INSERT INTO tiles VALUES(?,?,?,?)")
    .run(2, 2, 2, gzipSync(Buffer.from("vector fixture")));
  tiles.close();
  return dir;
}
describe("Deutschland-Projektion und begrenzte Geodatenabfragen", () => {
  it("erhält reale Koordinaten, rechteckige Ausdehnung und geodätische Entfernungen", () => {
    const points = [
      { lon: 13.405, lat: 52.52 },
      { lon: 11.576, lat: 48.137 },
      { lon: 6.87, lat: 55.05 },
      { lon: 14.98, lat: 51.15 },
    ];
    for (const p of points) {
      const q = unproject(project(p));
      expect(q.lon).toBeCloseTo(p.lon, 9);
      expect(q.lat).toBeCloseTo(p.lat, 9);
      expect(inBounds(project(p))).toBe(true);
    }
    const berlinMunich = meters(project(points[0]), project(points[1]));
    expect(berlinMunich).toBeGreaterThan(500000);
    expect(berlinMunich).toBeLessThan(510000);
    expect(WORLD_HEIGHT).toBeGreaterThan(WORLD_WIDTH);
    expect(inBounds({ x: -1, y: 0 })).toBe(false);
  });
  it("sucht ausschließlich importierte Daten und behandelt Suchsyntax als Text", () => {
    const maps = new GermanyMaps(fixture());
    try {
      expect(maps.search("Berl").some((r) => r.name === "Berlin")).toBe(true);
      expect(maps.search('" OR *')).toEqual([]);
      expect(maps.search("Rivermere")).toEqual([]);
      expect(maps.node(19)?.lat).toBe(52.52);
      expect(maps.publicManifest()).not.toHaveProperty("dir");
    } finally {
      maps.close();
    }
  });
  it("konvertiert XYZ nach TMS und begrenzt Kachelkoordinaten", () => {
    const maps = new GermanyMaps(fixture());
    try {
      expect(maps.tile(2, 2, 1)?.[0]).toBe(0x1f);
      expect(maps.tile(2, 2, 0)).toBe(null);
      expect(() => maps.tile(20, 0, 0)).toThrow();
      expect(() => maps.tile(2, 4, 0)).toThrow();
      expect(() => maps.tile(2, 0, -1)).toThrow();
    } finally {
      maps.close();
    }
  });
  it("findet exakte Orte auch hinter vielen Adresstreffern und begrenzt Vorschläge", () => {
    const dir = fixture();
    const db = new DatabaseSync(join(dir, "index.sqlite"));
    const insert = db.prepare("INSERT INTO places VALUES(?,?,?,?,?,?,?)");
    db.exec("BEGIN");
    insert.run(
      0,
      "Berlin",
      "village",
      "Berlin, Schleswig-Holstein",
      10.45,
      54.04,
      "Schleswig-Holstein",
    );
    for (let id = 3; id < 400; id++)
      insert.run(
        id,
        `Testort Straße ${id}`,
        "street",
        `Testort Straße ${id}`,
        13.4,
        52.5,
        "",
      );
    insert.run(500, "Testort", "village", "Testort", 13.41, 52.51, "");
    db.exec("INSERT INTO places_fts(places_fts) VALUES('rebuild'); COMMIT");
    db.close();
    const maps = new GermanyMaps(dir);
    try {
      expect(maps.search("Berlin")[0]).toMatchObject({ id: "1", kind: "city" });
      expect(maps.search("Testort")[0]).toMatchObject({
        id: "500",
        kind: "village",
      });
      expect(maps.search("Testort")).toHaveLength(20);
      expect(maps.search("T")).toEqual([]);
    } finally {
      maps.close();
    }
  });
  it("öffnet kein unvollständiges Datenpaket", () => {
    expect(() => new GermanyMaps(fixture("building"))).toThrow();
  });
  it("weist Karten und Suche aus unterschiedlichen Quellen zurück", () => {
    const dir = fixture();
    const db = new DatabaseSync(join(dir, "maps.mbtiles"));
    db.prepare("UPDATE metadata SET value=? WHERE name='source_sha256'").run(
      "b".repeat(64),
    );
    db.close();
    expect(() => new GermanyMaps(dir)).toThrow("demselben Datenbestand");
  });
  it("liefert ein geprüftes optionales Höhenmodell getrennt von Vektorkacheln", () => {
    const dir = fixture();
    const dem = new DatabaseSync(join(dir, "dem.mbtiles"));
    dem.exec(
      "CREATE TABLE metadata(name TEXT PRIMARY KEY,value TEXT);CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB)",
    );
    for (const [key, value] of Object.entries({
      source_id: "copernicus-fixture",
      source_lock_sha256: "c".repeat(64),
      encoding: "terrarium",
      minzoom: "5",
      maxzoom: "11",
    }))
      dem.prepare("INSERT INTO metadata VALUES(?,?)").run(key, value);
    dem
      .prepare("INSERT INTO tiles VALUES(5,17,20,?)")
      .run(Buffer.from("height fixture"));
    dem.close();
    const manifest = {
      status: "ready",
      source: "Copernicus GLO-90",
      attribution: "Copernicus DEM",
      sha256: "d".repeat(64),
      bytes: statSync(join(dir, "dem.mbtiles")).size,
      sourceId: "copernicus-fixture",
      sourceLockSha256: "c".repeat(64),
      minzoom: 5,
      maxzoom: 11,
      tileSize: 256,
      encoding: "terrarium",
    };
    writeFileSync(join(dir, "dem-manifest.json"), JSON.stringify(manifest));
    const maps = new GermanyMaps(dir);
    try {
      expect(maps.publicManifest().dem?.dataset).toBe("d".repeat(64));
      expect(maps.tile(5, 17, 11, true)?.toString()).toBe("height fixture");
      expect(maps.tile(5, 17, 11)).toBeNull();
      expect(() => maps.tile(4, 1, 1, true)).toThrow();
    } finally {
      maps.close();
    }
    writeFileSync(
      join(dir, "dem-manifest.json"),
      JSON.stringify({ ...manifest, bytes: manifest.bytes + 1 }),
    );
    expect(() => new GermanyMaps(dir)).toThrow("Manifest stimmen nicht");
  });
});
