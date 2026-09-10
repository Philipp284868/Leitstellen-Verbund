import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { coordinates, fixtureDataset } from "./locations";
import { createFacilityFixture } from "./facility-package";
import {
  encodeTile,
  rectangle,
  type TileFeature,
} from "../../helpers/geography-tile";

/** Bounded synthetic transport package at valid Berlin coordinates. It exercises
 * the real SQLite/MBTiles reader and HTTP/MapLibre contracts, not geographic fidelity. */
export function createGermanyPackage(dir: string) {
  mkdirSync(dir, { recursive: true });
  createFacilityFixture(dir);
  writeFileSync(
    resolve(dir, "manifest.json"),
    JSON.stringify({
      schema: 1,
      worldId: "germany-1",
      status: "ready",
      snapshot: "2026-09-10",
      dataset: fixtureDataset,
      graphRuntimeIdentity: JSON.parse(
        readFileSync(
          resolve("tests/fixtures/germany-graph-runtime.json"),
          "utf8",
        ),
      ),
    }),
  );
  const db = new DatabaseSync(resolve(dir, "index.sqlite"));
  db.exec("BEGIN");
  db.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE anchors(id INTEGER PRIMARY KEY,lon REAL,lat REAL,name TEXT,road_class TEXT,bridge INTEGER,tunnel INTEGER,access TEXT);
    CREATE VIRTUAL TABLE anchors_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat);
    CREATE TABLE places(id INTEGER PRIMARY KEY,osm_type TEXT,osm_id TEXT,kind TEXT,name TEXT,display_name TEXT,lon REAL,lat REAL,region TEXT);
    CREATE VIRTUAL TABLE places_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat);
    CREATE VIRTUAL TABLE places_fts USING fts5(name,display_name,content='places',content_rowid='id');`);
  db.prepare("INSERT INTO metadata VALUES('source_sha256',?)").run(
    fixtureDataset,
  );
  for (const [id, p] of coordinates.entries()) {
    db.prepare("INSERT INTO anchors VALUES(?,?,?,?,?,0,0,'')").run(
      id,
      p.lon,
      p.lat,
      "Straße des 17. Juni",
      "primary",
    );
    db.prepare("INSERT INTO anchors_rtree VALUES(?,?,?,?,?)").run(
      id,
      p.lon,
      p.lon,
      p.lat,
      p.lat,
    );
  }
  for (const [id, kind, name, p] of [
    [1, "city", "Berlin", coordinates[0]],
    [2, "hospital", "Technische Klinik-Fixture Berlin", coordinates[100]],
    [3, "street", "Straße des 17. Juni", coordinates[2]],
  ] as const) {
    db.prepare("INSERT INTO places VALUES(?,'way',?,?,?,?,?,?,?)").run(
      id,
      String(kind === "hospital" ? 100000 : 100000 + id),
      kind,
      name,
      name,
      p.lon,
      p.lat,
      "Berlin",
    );
    db.prepare("INSERT INTO places_rtree VALUES(?,?,?,?,?)").run(
      id,
      p.lon,
      p.lon,
      p.lat,
      p.lat,
    );
  }
  db.exec("INSERT INTO places_fts(places_fts) VALUES('rebuild')");
  db.exec("COMMIT");
  db.close();
  const tiles = new DatabaseSync(resolve(dir, "maps.mbtiles"));
  tiles.exec("BEGIN");
  tiles.exec(
    "CREATE TABLE metadata(name TEXT PRIMARY KEY,value TEXT); CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB,PRIMARY KEY(zoom_level,tile_column,tile_row))",
  );
  tiles
    .prepare("INSERT INTO metadata VALUES('source_sha256',?)")
    .run(fixtureDataset);
  tiles.exec("INSERT INTO metadata VALUES('maxzoom','14')");
  const features: TileFeature[] = [
    {
      layer: "landuse",
      properties: { class: "residential" },
      type: 3,
      parts: [rectangle(0, 0, 4096, 4096)],
    },
    {
      layer: "landcover",
      properties: { class: "farmland" },
      type: 3,
      parts: [rectangle(0, 0, 4096, 4096)],
    },
    {
      layer: "transportation",
      properties: { class: "primary" },
      type: 2,
      parts: [
        [
          [0, 2048],
          [4096, 2048],
        ],
      ],
    },
  ];
  const bytes = encodeTile(features),
    added = new Set<string>();
  for (let z = 0; z <= 14; z++)
    for (const p of [...coordinates, { lon: 13.405, lat: 52.52 }]) {
      const n = 2 ** z,
        x = Math.floor(((p.lon + 180) / 360) * n),
        y = Math.floor(
          ((1 - Math.asinh(Math.tan((p.lat * Math.PI) / 180)) / Math.PI) / 2) *
            n,
        );
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const tx = x + dx,
            ty = y + dy,
            key = `${z}/${tx}/${ty}`;
          if (tx < 0 || ty < 0 || tx >= n || ty >= n || added.has(key))
            continue;
          added.add(key);
          tiles
            .prepare("INSERT INTO tiles VALUES(?,?,?,?)")
            .run(z, tx, n - 1 - ty, bytes);
        }
    }
  tiles.exec("COMMIT");
  tiles.close();
}
