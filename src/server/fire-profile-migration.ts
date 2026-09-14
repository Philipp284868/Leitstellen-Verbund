import type { DatabaseSync } from "node:sqlite";
import { validate } from "../shared/model";
import { germanyProvider } from "../shared/germany/world";
import { stationCapacity } from "../simulation/staffing";
import { reconcileFireRoster } from "../simulation/fire-roster";
import { catalogFireProfile } from "./facilities/fire-profiles";

export function planFireProfileMigration(sql: DatabaseSync) {
  const rows = [];
  const changes = [];
  for (const table of ["saves", "solo_saves"] as const) {
    if (
      !sql
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(table)
    )
      continue;
    for (const row of sql
      .prepare(`SELECT user_id,data FROM ${table} ORDER BY user_id`)
      .all()) {
      const save = validate(JSON.parse(String(row.data)));
      if (save.player.id !== row.user_id)
        throw Error("Kontozuordnung der Profilmigration widersprüchlich.");
      let changed = false;
      for (const b of save.buildings) {
        if (b.type !== "fire" || b.migrationReserve || !b.facility) continue;
        const f = germanyProvider().facilities?.get(b.facility.id);
        const profile =
          f?.fireProfile ?? catalogFireProfile(b.facility.sources);
        if (b.fireProfile?.revision === profile.revision) continue;
        changed = true;
        const capacity = stationCapacity(b);
        const bound = save.vehicles.filter(
          (v) =>
            v.home === b.id &&
            (v.status !== "ready" || v.patients > 0 || v.postIncident),
        );
        changes.push({
          owner: row.user_id,
          building: b.id,
          facility: b.facility.id,
          previous: b.fireProfile?.kind ?? b.organization?.kind ?? "legacy",
          target: profile.kind,
          activeVehicles: bound.length,
          patients: bound.reduce((n, v) => n + v.patients, 0),
          capacityRetained: capacity,
        });
        b.fireCapacityRetained ??= capacity;
        b.fireProfile = structuredClone(profile);
        b.fireProfilePending = bound.length > 0;
        reconcileFireRoster(save, b);
      }
      if (changed)
        rows.push({ table, user: String(row.user_id), save: validate(save) });
    }
  }
  return { rows, summary: { version: 29, changes } };
}
export function applyFireProfileMigration(
  sql: DatabaseSync,
  plan: ReturnType<typeof planFireProfileMigration>,
) {
  for (const row of plan.rows)
    sql
      .prepare(`UPDATE ${row.table} SET data=? WHERE user_id=?`)
      .run(JSON.stringify(row.save), row.user);
}
