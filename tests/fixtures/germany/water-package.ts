import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
/** Tiny explicitly synthetic source index; never imports the real Germany package in tests. */
export function createWaterFixture(
  dir: string,
  dataset: string,
  coordinates: { lon: number; lat: number }[],
) {
  const water = new DatabaseSync(resolve(dir, "water.sqlite"));
  water.exec(
    "CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE sources(rowid INTEGER PRIMARY KEY,id TEXT UNIQUE,lon REAL,lat REAL,data TEXT);CREATE VIRTUAL TABLE sources_rtree USING rtree(rowid,min_lon,max_lon,min_lat,max_lat);",
  );
  water
    .prepare("INSERT INTO metadata VALUES('dataset',?),('snapshot','fixture')")
    .run(dataset);
  for (const [id, p] of coordinates.entries()) {
    const inserted = water
      .prepare("INSERT INTO sources(id,lon,lat,data) VALUES(?,?,?,?)")
      .run(
        `node:${8000000 + id}`,
        p.lon,
        p.lat,
        JSON.stringify({
          emergency: "fire_hydrant",
          name: "Synthetische Prüfquelle",
        }),
      );
    water
      .prepare("INSERT INTO sources_rtree VALUES(?,?,?,?,?)")
      .run(inserted.lastInsertRowid, p.lon, p.lon, p.lat, p.lat);
  }
  water.close();
}
