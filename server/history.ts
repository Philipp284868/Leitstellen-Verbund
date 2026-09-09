import type { DatabaseSync } from "node:sqlite";
import { missionSchema, type Mission, type Save } from "../src/model";
import { mt } from "../src/catalog";
export const HISTORY_SCHEMA = `CREATE TABLE IF NOT EXISTS mission_history (
  owner TEXT NOT NULL REFERENCES users(id), mode TEXT NOT NULL, id TEXT NOT NULL,
  completed REAL NOT NULL, org TEXT NOT NULL, major INTEGER NOT NULL, search TEXT NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY(owner,mode,id));
  CREATE INDEX IF NOT EXISTS history_order ON mission_history(owner,mode,completed DESC,id DESC);`;

/** Persist before shrinking the live window. Post-incident work retains its referenced reports. */
export function persistHistory(db: DatabaseSync, s: Save, mode: string) {
  const insert = db.prepare(
    "INSERT INTO mission_history VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(owner,mode,id) DO UPDATE SET completed=excluded.completed,org=excluded.org,major=excluded.major,search=excluded.search,data=excluded.data WHERE data<>excluded.data",
  );
  for (const m of s.archive) {
    const t = mt(m.template);
    insert.run(
      s.player.id,
      mode,
      m.id,
      m.completed,
      t.org,
      m.major ? 1 : 0,
      `${m.id} ${t.name} ${m.telemetry?.units.map((u) => u.name).join(" ") ?? ""}`.toLocaleLowerCase(
        "de",
      ),
      JSON.stringify(m),
    );
  }
  const retained = new Set(
    s.vehicles.flatMap((v) =>
      v.postIncident?.mission ? [v.postIncident.mission] : [],
    ),
  );
  for (const id of s.operations.campaign?.missions ?? []) retained.add(id);
  s.archive = s.archive.filter((m, index) => index < 100 || retained.has(m.id));
}
export function publicHistory(m: Mission): Mission {
  const result = structuredClone(m);
  if (result.control) delete result.control.secret;
  if (result.dynamics) {
    delete result.dynamics.random;
    delete result.dynamics.pending;
  }
  if (result.major) delete result.major.pending;
  return result;
}
/** Explicit exports contain every report, even after the live snapshot window was reduced. */
export function exportHistory(
  db: DatabaseSync,
  owner: string,
  mode: string,
  live: Mission[],
) {
  const reports = new Map(
    db
      .prepare(
        "SELECT data FROM mission_history WHERE owner=? AND mode=? ORDER BY completed DESC,id DESC",
      )
      .all(owner, mode)
      .map((row) => {
        const mission = missionSchema.parse(JSON.parse(String(row.data)));
        return [mission.id, mission] as const;
      }),
  );
  for (const mission of live) reports.set(mission.id, mission);
  return [...reports.values()]
    .sort((a, b) => b.completed - a.completed || b.id.localeCompare(a.id))
    .map(publicHistory);
}
export function historyPage(
  db: DatabaseSync,
  owner: string,
  mode: string,
  options: { page: number; query: string; org: string; major: boolean },
) {
  const where =
    "owner=? AND mode=? AND (?='' OR instr(search,?)>0) AND (?='Alle' OR org=?) AND (?=0 OR major=1)";
  const needle = options.query.trim().toLocaleLowerCase("de");
  const args = [
    owner,
    mode,
    needle,
    needle,
    options.org,
    options.org,
    Number(options.major),
  ];
  const total = Number(
    db
      .prepare(`SELECT count(*) AS n FROM mission_history WHERE ${where}`)
      .get(...args)!.n,
  );
  const page = Math.min(options.page, Math.max(0, Math.ceil(total / 25) - 1));
  const rows = db
    .prepare(
      `SELECT data FROM mission_history WHERE ${where} ORDER BY completed DESC,id DESC LIMIT 25 OFFSET ?`,
    )
    .all(...args, page * 25);
  return {
    total,
    page,
    pageSize: 25,
    missions: rows.map((row) =>
      publicHistory(missionSchema.parse(JSON.parse(String(row.data)))),
    ),
  };
}
