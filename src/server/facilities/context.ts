import type { Database } from "../database";
import type { PurchaseContext } from "../../shared/facilities/purchase";

/** One authorized owner row, no world view or unrelated vehicle/incident deserialization. */
export function facilityContext(db: Database, owner: string): PurchaseContext {
  const row = db.sql
    .prepare(
      `SELECT json_extract(data,'$.money') money, json_extract(data,'$.xp') xp, json_extract(data,'$.progression') progression,
    (SELECT json_group_array(json_object('id',json_extract(value,'$.id'),'facility',json_object('id',json_extract(value,'$.facility.id')))) FROM json_each(saves.data,'$.buildings')) buildings
    FROM saves WHERE user_id=?`,
    )
    .get(owner);
  if (!row) throw Error("Leitstelle nicht verfügbar.");
  return {
    money: Number(row.money),
    xp: Number(row.xp),
    progression: row.progression
      ? JSON.parse(String(row.progression))
      : undefined,
    buildings: JSON.parse(String(row.buildings)),
  };
}
