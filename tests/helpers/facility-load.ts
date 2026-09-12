import { DatabaseSync } from "node:sqlite";
import { CATALOG_SCHEMA } from "../../scripts/geodata/facility-catalog.mjs";
/** Deterministic synthetic stress catalog, explicitly not production geodata. */
export function createFacilityLoad(path: string, count: number) {
  const db = new DatabaseSync(path);
  db.exec(CATALOG_SCHEMA);
  db.exec("BEGIN");
  const insert = db.prepare(
    "INSERT INTO facilities(id,kind,name,address,state,lon,lat,usable,data) VALUES(?,?,?,?,?,?,?,?,?)",
  );
  const spatial = db.prepare("INSERT INTO facilities_rtree VALUES(?,?,?,?,?)");
  for (let i = 0; i < count; i++) {
    const dense = i < count * 0.4;
    const lon = dense
      ? 13.3 + (i % 200) * 0.0006
      : 6 + (((i * 7919) % 10000) / 10000) * 9;
    const lat = dense
      ? 52.45 + (Math.floor(i / 200) % 200) * 0.0006
      : 47.3 + (((i * 1543) % 10000) / 10000) * 7.6;
    const id = `load:${i}`,
      name = `Testwache ${String(i).padStart(6, "0")}`,
      address = dense ? "Berlin Teststraße" : "Synthetischer Standort";
    const data = {
      id,
      kind: "fire",
      name,
      address,
      state: "BE",
      lon,
      lat,
      snapshot: "load-v1",
      sources: [`node:${i}`],
      subtype: "FF",
      emergency: "unknown",
      status: "active",
      quality: ["Synthetic load fixture"],
      access: { lon, lat, source: `node:${i}`, method: "entrance" },
    };
    const row = insert.run(
      id,
      "fire",
      name,
      address,
      "BE",
      lon,
      lat,
      1,
      JSON.stringify(data),
    );
    spatial.run(row.lastInsertRowid, lon, lon, lat, lat);
  }
  db.exec(
    "INSERT INTO metadata VALUES('schema','1'),('snapshot','load-v1'),('dataset','load'); INSERT INTO facilities_fts(facilities_fts) VALUES('rebuild'); COMMIT; ANALYZE;",
  );
  db.close();
}
