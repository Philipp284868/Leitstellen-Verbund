import type { DatabaseSync } from "node:sqlite";
import { validate } from "../src/model";
import { reconcileReadinessCore } from "../src/simulation/readiness-core";
import { migrateCivilProtection } from "../src/simulation/civil-protection";

/** Every transformation operates on decoded copies, shared by preview and commit. */
export function planReadinessMigration(db: DatabaseSync) {
  const saves = ["saves", "solo_saves"]
    .filter((table) =>
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table),
    )
    .flatMap((table) =>
      db
        .prepare(`SELECT user_id,data FROM ${table}`)
        .all()
        .map((row) => {
          const save = validate(JSON.parse(String(row.data)));
          const newCores = save.buildings.filter(
            (b) =>
              b.organization?.kind === "ff" &&
              b.ready <= save.time &&
              !b.readinessCore,
          ).length;
          for (const b of save.buildings) reconcileReadinessCore(save, b);
          const readiness = migrateCivilProtection(save);
          return {
            table,
            user: String(row.user_id),
            save: validate(save),
            newCores,
            readiness,
          };
        }),
    );
  return {
    saves,
    summary: {
      version: 15,
      cores: saves.reduce((n, s) => n + s.newCores, 0),
      readiness: saves.reduce((n, s) => n + s.readiness, 0),
      saves: saves.length,
    },
  };
}
export function applyReadinessMigration(db: DatabaseSync) {
  const plan = planReadinessMigration(db);
  for (const row of plan.saves)
    db.prepare(`UPDATE ${row.table} SET data=? WHERE user_id=?`).run(
      JSON.stringify(row.save),
      row.user,
    );
  return plan.summary;
}
