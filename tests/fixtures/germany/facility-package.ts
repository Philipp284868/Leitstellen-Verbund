import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { CATALOG_SCHEMA } from "../../../scripts/geodata/facility-catalog.mjs";
import { unproject, type Point } from "../../../src/shared/germany/projection";
import { fixtureDataset } from "./locations";
import { facilitiesAt, fixtureFacilities } from "./facilities";
export function createFacilityFixture(
  dir: string,
  options: { dataset?: string; positions?: Point[] } = {},
) {
  const db = new DatabaseSync(resolve(dir, "facilities.sqlite"));
  try {
    db.exec(CATALOG_SCHEMA);
    db.exec("BEGIN");
    for (const [key, value] of Object.entries({
      schema: "1",
      snapshot: "2026-09-10",
      dataset: options.dataset ?? fixtureDataset,
    }))
      db.prepare("INSERT INTO metadata VALUES(?,?)").run(key, value);
    for (const f of options.positions
      ? facilitiesAt(options.positions)
      : fixtureFacilities) {
      const data = {
        ...f,
        access: {
          ...unproject(f.access!.pos),
          source: f.access!.source,
          method: f.access!.method,
        },
      };
      const row = db
        .prepare(
          "INSERT INTO facilities(id,kind,name,address,state,lon,lat,usable,data) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          f.id,
          f.kind,
          f.name,
          f.address,
          f.state,
          f.lon,
          f.lat,
          1,
          JSON.stringify(data),
        );
      db.prepare("INSERT INTO facilities_rtree VALUES(?,?,?,?,?)").run(
        row.lastInsertRowid,
        f.lon,
        f.lon,
        f.lat,
        f.lat,
      );
      for (const ref of f.sources)
        db.prepare("INSERT INTO aliases VALUES(?,?)").run(ref, f.id);
    }
    db.exec(
      "INSERT INTO facilities_fts(facilities_fts) VALUES('rebuild');COMMIT;",
    );
  } finally {
    db.close();
  }
}
