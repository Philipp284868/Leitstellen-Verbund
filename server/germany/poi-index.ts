import { DatabaseSync } from "node:sqlite";
import type { MapPoi, PoiCategory } from "../../src/germany/poi-data";

const categories: Record<string, PoiCategory> = {
  fire_station: "fire",
  police: "police",
  hospital: "hospital",
  clinic: "hospital",
};
const names: Record<string, string> = {
  fire_station: "Feuerwache",
  police: "Polizeiwache",
  hospital: "Krankenhaus",
  clinic: "Klinik",
};
/** Sparse, process-local acceleration built before the HTTP server listens.
 * The installed geographic database remains read-only and unchanged. */
export function createPoiIndex(source: DatabaseSync): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE places(id INTEGER PRIMARY KEY,kind TEXT,name TEXT,lon REAL,lat REAL);CREATE VIRTUAL TABLE places_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat);BEGIN",
    );
    if (
      source
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='places'",
        )
        .get()
    ) {
      const insert = db.prepare("INSERT INTO places VALUES(?,?,?,?,?)"),
        spatial = db.prepare("INSERT INTO places_rtree VALUES(?,?,?,?,?)");
      for (const row of source
        .prepare(
          "SELECT id,kind,name,lon,lat FROM places WHERE kind IN ('hospital','clinic','fire_station','police')",
        )
        .iterate()) {
        insert.run(
          row.id,
          row.kind,
          String(row.name).slice(0, 2048),
          row.lon,
          row.lat,
        );
        spatial.run(row.id, row.lon, row.lon, row.lat, row.lat);
      }
    }
    db.exec(
      "COMMIT;CREATE INDEX places_kind ON places(kind);PRAGMA query_only=ON",
    );
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
export function poiTileBounds(z: number, x: number, y: number) {
  if (
    ![z, x, y].every(Number.isInteger) ||
    z < 4 ||
    z > 14 ||
    x < 0 ||
    y < 0 ||
    x >= 2 ** z ||
    y >= 2 ** z
  )
    throw Error("Ungültige POI-Kachel.");
  const lon = (n: number) => (n / 2 ** z) * 360 - 180,
    lat = (n: number) =>
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * n) / 2 ** z))) * 180) / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)] as const;
}
/** Complete spatial aggregates at overview scales; detail requests never silently truncate. */
export function indexedPoiTile(
  db: DatabaseSync,
  z: number,
  x: number,
  y: number,
): MapPoi[] {
  const [west, south, east, north] = poiTileBounds(z, x, y);
  // A country-scale RTree would traverse millions of address rows. Overview
  // queries start from the existing sparse kind index (37k records), detail
  // queries use the spatial index. Both return all matching geographic records.
  const where =
    z < 11
      ? "FROM places p WHERE p.lon>=? AND p.lon<? AND p.lat>=? AND p.lat<? AND p.kind IN ('hospital','clinic','fire_station','police')"
      : "FROM places_rtree r JOIN places p ON p.id=r.id WHERE r.min_lon<? AND r.max_lon>=? AND r.min_lat<? AND r.max_lat>=? AND p.lon>=? AND p.lon<? AND p.lat>=? AND p.lat<? AND p.kind IN ('hospital','clinic','fire_station','police')";
  const params =
    z < 11
      ? [west, east, south, north]
      : [east, west, north, south, west, east, south, north];
  if (z >= 11) {
    const rows = db
      .prepare(
        `SELECT p.id,p.name,p.kind,p.lon,p.lat ${where} ORDER BY p.id LIMIT 1001`,
      )
      .all(...params);
    if (rows.length <= 1000)
      return rows.map((r) => ({
        id: `index:${r.id}`,
        name: String(r.name || names[String(r.kind)]).slice(0, 2048),
        kind: String(r.kind),
        category: categories[String(r.kind)],
        lon: Number(r.lon),
        lat: Number(r.lat),
        count: 1,
        source: "index",
      }));
  }
  const columns = 8;
  return db
    .prepare(
      `SELECT p.kind,MIN(p.id) AS id,MIN(p.name) AS name,AVG(p.lon) AS lon,AVG(p.lat) AS lat,COUNT(*) AS count,CAST((p.lon-?)/? AS INTEGER) AS gx,CAST((p.lat-?)/? AS INTEGER) AS gy ${where} GROUP BY p.kind,gx,gy ORDER BY p.kind,gx,gy`,
    )
    .all(
      west,
      (east - west) / columns,
      south,
      (north - south) / columns,
      ...params,
    )
    .map((r) => ({
      id: `index-group:${z}:${x}:${y}:${r.kind}:${r.gx}:${r.gy}`,
      category: categories[String(r.kind)],
      name:
        Number(r.count) === 1
          ? String(r.name || names[String(r.kind)]).slice(0, 2048)
          : `${r.count} ${names[String(r.kind)]}-Karteneinträge`,
      kind: String(r.kind),
      lon: Number(r.lon),
      lat: Number(r.lat),
      count: Number(r.count),
      source: "index",
    }));
}
