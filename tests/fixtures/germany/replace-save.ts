import type { Database } from "../../../src/server/database";
import type { Save } from "../../../src/shared/model";

/** Explicit setup-only replacement in isolated test databases. Never used by game requests. */
export function replaceFixtureSave(db: Database, owner: string, save: Save) {
  db.transaction(() => {
    db.sql.prepare("DELETE FROM facility_rights WHERE owner=?").run(owner);
    db.save(owner, save);
  });
}
