import { mt } from "../src/catalog";
import type { DatabaseSync } from "node:sqlite";
import type { Save } from "../src/model";
import { progress } from "../src/progression";
export const LEADERBOARD_SCHEMA = `
CREATE TABLE IF NOT EXISTS player_metrics(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, xp INTEGER NOT NULL, legacy_xp INTEGER NOT NULL, calls INTEGER NOT NULL DEFAULT 0, participations INTEGER NOT NULL DEFAULT 0, active_seconds REAL NOT NULL DEFAULT 0, excluded INTEGER NOT NULL DEFAULT 0 CHECK(excluded IN(0,1)));
CREATE INDEX IF NOT EXISTS player_rank ON player_metrics(excluded,xp DESC,user_id);
CREATE TABLE IF NOT EXISTS player_activity(owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, generation TEXT NOT NULL, mission TEXT NOT NULL, actor TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, event TEXT NOT NULL, PRIMARY KEY(owner,generation,mission,kind,event));
CREATE TABLE IF NOT EXISTS ranked_missions(owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,generation TEXT NOT NULL,mission TEXT NOT NULL,PRIMARY KEY(owner,generation,mission));
CREATE TABLE IF NOT EXISTS desk_metrics(owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,data TEXT NOT NULL);
INSERT OR IGNORE INTO player_metrics(user_id,xp,legacy_xp) SELECT user_id,COALESCE(json_extract(data,'$.xp'),0),COALESCE(json_extract(data,'$.xp'),0) FROM saves;
INSERT OR IGNORE INTO ranked_missions SELECT h.owner,json_extract(s.data,'$.generation'),h.id FROM mission_history h JOIN saves s ON s.user_id=h.owner WHERE h.mode='multi';
`;
export function recordActivity(
  sql: DatabaseSync,
  s: Save,
  user: string,
  action: { type: string; mission?: string; call?: string; op?: string },
  commandId: string,
) {
  if (!action.mission) return;
  const call = action.type === "call" && action.op === "accept";
  if (
    !call &&
    ![
      "dispatch",
      "radio",
      "transport",
      "patient-care",
      "tactic",
      "alarm",
    ].includes(action.type)
  )
    return;
  const event = call ? action.call! : commandId;
  const result = sql
    .prepare("INSERT OR IGNORE INTO player_activity VALUES (?,?,?,?,?,?)")
    .run(
      s.player.id,
      s.generation,
      action.mission,
      user,
      call ? "call" : "decision",
      event,
    );
  if (call && result.changes)
    sql
      .prepare("UPDATE player_metrics SET calls=calls+1 WHERE user_id=?")
      .run(user);
}
export function persistMetrics(
  sql: DatabaseSync,
  s: Save,
  known = new Set<string>(),
) {
  sql
    .prepare(
      "INSERT OR IGNORE INTO player_metrics(user_id,xp,legacy_xp) VALUES (?,?,?)",
    )
    .run(s.player.id, s.xp, s.xp);
  const previous = sql
    .prepare("SELECT data FROM desk_metrics WHERE owner=?")
    .get(s.player.id);
  const breakdown: {
    byOrg: Record<string, number>;
    byType: Record<string, number>;
    assisted: number;
  } = (previous ? JSON.parse(String(previous.data)).breakdown : null) ?? {
    byOrg: {},
    byType: {},
    assisted: 0,
  };
  for (const m of s.archive) {
    if (!m.report) continue;
    const key = `${s.generation}:${m.id}`;
    if (known.has(key)) continue;
    known.add(key);
    if (
      !sql
        .prepare("INSERT OR IGNORE INTO ranked_missions VALUES (?,?,?)")
        .run(s.player.id, s.generation, m.id).changes
    )
      continue;
    if (m.location?.state !== "technical-closure") {
      const template = mt(m.template);
      breakdown.byOrg[template.org] = (breakdown.byOrg[template.org] ?? 0) + 1;
      breakdown.byType[template.name] =
        (breakdown.byType[template.name] ?? 0) + 1;
      if (m.contributors.some((id) => id !== s.player.id)) breakdown.assisted++;
    }
    const people = sql
      .prepare(
        "SELECT DISTINCT actor FROM player_activity WHERE owner=? AND generation=? AND mission=? ORDER BY actor",
      )
      .all(s.player.id, s.generation, m.id);
    const xp =
      m.location?.state === "technical-closure"
        ? 0
        : Math.max(0, Math.floor(m.report.xp ?? 0));
    for (const [i, row] of people.entries())
      sql
        .prepare(
          "UPDATE player_metrics SET xp=xp+?,participations=participations+? WHERE user_id=?",
        )
        .run(
          Math.floor(xp / people.length) + (i < xp % people.length ? 1 : 0),
          m.location?.state === "technical-closure" ? 0 : 1,
          row.actor,
        );
    sql
      .prepare(
        "DELETE FROM player_activity WHERE owner=? AND generation=? AND mission=?",
      )
      .run(s.player.id, s.generation, m.id);
  }
  while (known.size > 500) known.delete(known.values().next().value!);
  const t = s.statistics;
  // Explicit public metrics, never a serialized Save or report.
  const data = {
    breakdown,
    since: t.since || null,
    requests: t.since ? t.requests : null,
    falseAlarms: t.since ? t.falseAlarms : null,
    meanCallSeconds: t.since && t.calls ? t.callSeconds / t.calls : null,
    xp: s.xp,
    completed: s.completed,
    recordedCompleted: t.completed,
    calls: t.since ? t.calls : null,
    major: t.since ? t.major : null,
    patients: t.since ? { delivered: t.delivered, dead: t.dead } : null,
    meters: t.since ? t.meters : null,
    credits: t.since ? t.credits : null,
    sites: s.buildings.length,
    vehicles: s.vehicles.length,
    people: s.people.length,
    timings: Object.fromEntries(
      Object.entries(t.timings).map(([k, v]) => [
        k,
        v.count ? v.sum / v.count : null,
      ]),
    ),
  };
  sql
    .prepare(
      "INSERT INTO desk_metrics VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET data=excluded.data WHERE data<>excluded.data",
    )
    .run(s.player.id, JSON.stringify(data));
}
export function leaderboard(
  sql: DatabaseSync,
  user: string,
  query: string,
  page: number,
  sort: string,
) {
  const order =
    sort === "name"
      ? "name COLLATE NOCASE,id"
      : sort === "calls"
        ? "calls DESC,rank"
        : "rank";
  const cte = `WITH ranked AS (SELECT u.id, json_extract(s.data,'$.player.name') name,
    json_extract(d.data,'$.player.station') desk, p.xp,p.legacy_xp,p.calls,p.participations,p.active_seconds,
    COALESCE(m.owner_id,u.id) owner,dm.data metrics,
    ROW_NUMBER() OVER(ORDER BY p.xp DESC,u.created,u.id) rank
    FROM users u JOIN saves s ON s.user_id=u.id JOIN player_metrics p ON p.user_id=u.id
    LEFT JOIN desk_members m ON m.user_id=u.id JOIN saves d ON d.user_id=COALESCE(m.owner_id,u.id)
    LEFT JOIN desk_metrics dm ON dm.owner=COALESCE(m.owner_id,u.id) WHERE u.role='player' AND p.excluded=0)`;
  const where = " WHERE instr(lower(name||' '||desk),lower(?))>0";
  const total = Number(
    sql.prepare(cte + " SELECT COUNT(*) n FROM ranked" + where).get(query)!.n,
  );
  const mine = sql
    .prepare(cte + " SELECT rank FROM ranked WHERE id=?")
    .get(user);
  const current = Math.min(page, Math.max(0, Math.ceil(total / 20) - 1));
  const rows = sql
    .prepare(
      cte +
        " SELECT * FROM ranked" +
        where +
        " ORDER BY " +
        order +
        " LIMIT 20 OFFSET ?",
    )
    .all(query, current * 20);
  const items = rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    desk: String(r.desk),
    rank: Number(r.rank),
    xp: Number(r.xp),
    level: progress(Number(r.xp)).level,
    legacyXp: Number(r.legacy_xp),
    calls: Number(r.calls),
    participations: Number(r.participations),
    activeSeconds: Number(r.active_seconds),
    shared: JSON.parse(String(r.metrics ?? "null")),
    own: r.id === user,
  }));
  return {
    items,
    total,
    page: current,
    myRank: mine ? Number(mine.rank) : null,
  };
}
/** Count live authenticated players once per interval irrespective of tab count. */
export function recordPlayTime(
  sql: DatabaseSync,
  users: readonly string[],
  seconds: number,
) {
  if (seconds <= 0 || seconds > 60) return;
  const stmt = sql.prepare(
    "UPDATE player_metrics SET active_seconds=active_seconds+? WHERE user_id=?",
  );
  for (const user of new Set(users)) stmt.run(seconds, user);
}
