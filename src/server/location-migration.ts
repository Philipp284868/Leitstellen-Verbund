import type { DatabaseSync } from "node:sqlite";
import { validate } from "../shared/model";
import { WORLD } from "../shared/world";
export function planLocationMigration(db: DatabaseSync) {
  const rows = ["saves", "solo_saves"]
    .filter((t) =>
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(t),
    )
    .flatMap((table) =>
      db
        .prepare(`SELECT user_id,data FROM ${table}`)
        .all()
        .map((row) => {
          const s = validate(JSON.parse(String(row.data)));
          if (s.player.id !== String(row.user_id))
            throw Error("Migration abgebrochen: unzulässige Kontozuordnung.");
          const pending = s.missions
            .filter((m) => !m.location)
            .map((m) => m.id);
          for (const m of s.missions.filter((m) => pending.includes(m.id)))
            m.location = {
              version: 1,
              dataset: WORLD,
              siteRef: "unverified",
              roadRef: "unverified",
              kind: "legacy",
              original: { ...m.pos },
              access: { ...m.pos },
              checkedAt: 0,
              station: "unverified",
              profiles: [],
              driveSeconds: 0,
              state: "repair-pending",
              reason:
                "Bestandsort wird am ursprünglichen Standort auf eine gültige Zufahrt geprüft.",
            };
          s.locationReview ??= {
            version: 1,
            pending,
            nextAt: s.time,
            checked: 0,
          };
          return {
            table,
            user: String(row.user_id),
            save: validate(s),
            pending: pending.length,
          };
        }),
    );
  return {
    rows,
    summary: {
      version: 18,
      saves: rows.length,
      pending: rows.reduce((n, r) => n + r.pending, 0),
    },
  };
}
export function applyLocationMigration(db: DatabaseSync) {
  const plan = planLocationMigration(db);
  for (const row of plan.rows)
    db.prepare(`UPDATE ${row.table} SET data=? WHERE user_id=?`).run(
      JSON.stringify(row.save),
      row.user,
    );
  return plan.summary;
}
