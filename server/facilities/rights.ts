import type { DatabaseSync } from "node:sqlite";
import type { Save } from "../../src/model";

export const FACILITY_RIGHTS_SCHEMA = `CREATE TABLE IF NOT EXISTS facility_rights(owner TEXT NOT NULL REFERENCES users(id),facility TEXT NOT NULL,building TEXT NOT NULL,identity TEXT NOT NULL,PRIMARY KEY(owner,facility),UNIQUE(owner,building));`;
/** A second independent constraint besides the command receipt. Existing identity is immutable. */
export function persistFacilityRights(sql: DatabaseSync, s: Save) {
  const bindings = s.buildings.filter((b) => b.facility);
  for (const b of bindings) {
    const identity = JSON.stringify({
      type: b.type,
      pos: b.pos,
      facility: b.facility,
    });
    const previous = sql
      .prepare(
        "SELECT * FROM facility_rights WHERE owner=? AND (building=? OR facility=?)",
      )
      .all(s.player.id, b.id, b.facility!.id);
    if (
      previous.some(
        (r) =>
          r.building !== b.id ||
          r.facility !== b.facility!.id ||
          r.identity !== identity,
      )
    )
      throw Error(
        "BUILDING_PURCHASE_ONLY: Standortidentität und Zufahrt sind unveränderlich.",
      );
    sql
      .prepare(
        "INSERT INTO facility_rights VALUES(?,?,?,?) ON CONFLICT(owner,facility) DO NOTHING",
      )
      .run(s.player.id, b.facility!.id, b.id, identity);
  }
  for (const old of sql
    .prepare("SELECT building FROM facility_rights WHERE owner=?")
    .all(s.player.id)) {
    const remaining = s.buildings.find((b) => b.id === old.building);
    if (remaining && !remaining.facility)
      throw Error(
        "BUILDING_PURCHASE_ONLY: Standortbindung darf nicht entfernt werden.",
      );
    if (!remaining)
      sql
        .prepare("DELETE FROM facility_rights WHERE owner=? AND building=?")
        .run(s.player.id, old.building);
  }
}
