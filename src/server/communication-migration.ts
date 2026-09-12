import type { DatabaseSync } from "node:sqlite";
import { validate } from "../shared/model";
import { radioNetwork } from "../simulation/transmissions";

export function planCommunicationMigration(db: DatabaseSync) {
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
          if (save.player.id !== String(row.user_id))
            throw Error("Migration abgebrochen: unzulässige Kontozuordnung.");
          const initialized = !save.radioNetwork;
          // Historical events never become a fresh audio backlog on an upgrade.
          radioNetwork(save);
          let requests = 0;
          for (const request of save.aid) {
            if (request.version !== 2) requests++;
            request.version = 2;
            request.vehicleWishes ??= [];
            for (const assignment of request.assignments)
              assignment.requestedType ??= assignment.type;
          }
          return {
            table,
            user: String(row.user_id),
            save: validate(save),
            initialized,
            requests,
          };
        }),
    );
  return {
    saves,
    summary: {
      version: 16,
      saves: saves.length,
      radio: saves.filter((s) => s.initialized).length,
      requests: saves.reduce((n, s) => n + s.requests, 0),
    },
  };
}
export function applyCommunicationMigration(db: DatabaseSync) {
  const plan = planCommunicationMigration(db);
  for (const row of plan.saves)
    db.prepare(`UPDATE ${row.table} SET data=? WHERE user_id=?`).run(
      JSON.stringify(row.save),
      row.user,
    );
  return plan.summary;
}
