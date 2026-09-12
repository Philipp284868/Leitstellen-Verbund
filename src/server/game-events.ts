import type { DatabaseSync } from "node:sqlite";
import type { Save } from "../shared/model";
import { projectEvents } from "../shared/game-events";
import { progress } from "../shared/progression";
export const EVENTS_SCHEMA = `CREATE TABLE IF NOT EXISTS game_events(owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,id TEXT NOT NULL,at REAL NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(owner,id));
CREATE INDEX IF NOT EXISTS game_events_page ON game_events(owner,at DESC,id DESC);
CREATE TABLE IF NOT EXISTS event_cursors(owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,xp INTEGER NOT NULL);`;
export function persistGameEvents(
  sql: DatabaseSync,
  s: Save,
  known: Map<string, string>,
) {
  const projected = projectEvents(s),
    events = [
      ...projected.filter((e) => e.unresolved),
      ...projected.filter((e) => !e.unresolved).slice(-10000),
    ],
    previous = sql
      .prepare("SELECT xp FROM event_cursors WHERE owner=?")
      .get(s.player.id);
  const level = progress(s.xp).level;
  if (previous && progress(Number(previous.xp)).level < level)
    events.push({
      id: `level:${s.generation}:${level}`,
      at: s.time,
      sender: "System",
      type: "Fortschritt",
      priority: "important",
      text: `Stufe ${level} erreicht. Neue Freischaltungen stehen unter Fortschritt.`,
    });
  sql
    .prepare(
      "INSERT INTO event_cursors VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET xp=excluded.xp",
    )
    .run(s.player.id, s.xp);
  const put = sql.prepare(
    "INSERT INTO game_events VALUES(?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET payload=excluded.payload,at=excluded.at",
  );
  let changed = Number(known.get("@prune-count") ?? 100);
  for (const e of events) {
    const payload = JSON.stringify(e);
    if (known.get(e.id) === payload) continue;
    put.run(s.player.id, e.id, e.at, payload);
    known.set(e.id, payload);
    changed++;
  }
  // Keep exactly the projected window. A smaller FIFO than that window would
  // evict unchanged rows and rewrite the complete history on every tick.
  const liveIds = new Set(events.map((e) => e.id));
  for (const id of known.keys())
    if (id !== "@prune-count" && !liveIds.has(id)) known.delete(id);
  // Operational log has bounded retention; the full incident archive/journal remains separate.
  if (changed >= 100)
    sql
      .prepare(
        "DELETE FROM game_events WHERE owner=? AND id IN (SELECT id FROM game_events WHERE owner=? AND COALESCE(json_extract(payload,'$.unresolved'),0)=0 ORDER BY at DESC,id DESC LIMIT -1 OFFSET 10000)",
      )
      .run(s.player.id, s.player.id);
  known.set("@prune-count", String(changed >= 100 ? 0 : changed));
}
export function eventsPage(
  sql: DatabaseSync,
  owner: string,
  before?: { at: number; id: string },
  actor = owner,
) {
  const rows = before
    ? sql
        .prepare(
          "SELECT payload FROM game_events WHERE (owner=? OR (owner=? AND id LIKE 'report:%')) AND (at<? OR (at=? AND id<?)) ORDER BY at DESC,id DESC LIMIT 101",
        )
        .all(owner, actor, before.at, before.at, before.id)
    : sql
        .prepare(
          "SELECT payload FROM game_events WHERE owner=? OR (owner=? AND id LIKE 'report:%') ORDER BY at DESC,id DESC LIMIT 101",
        )
        .all(owner, actor);
  let events = rows.slice(0, 100).map((r) => JSON.parse(String(r.payload)));
  const last = events.at(-1);
  // Earlier log versions may contain pre-recon text. Apply the same visibility
  // projection when reading those rows, without destroying the stored history.
  const source = sql
    .prepare("SELECT data FROM saves WHERE user_id=?")
    .get(owner);
  if (source && events.some((e) => e.mission)) {
    const save = JSON.parse(String(source.data)) as Save;
    const hidden = new Set(
      [...save.missions, ...save.archive]
        .filter((m) => m.control && !m.control.briefed && !m.control.legacy)
        .map((m) => m.id),
    );
    if (events.some((e) => hidden.has(e.mission))) {
      const visible = new Map(projectEvents(save).map((e) => [e.id, e]));
      events = events
        .map((e) => (hidden.has(e.mission) ? visible.get(e.id) : e))
        .filter(Boolean);
    }
  }
  return {
    events: events.reverse(),
    next: rows.length > 100 ? { at: last.at, id: last.id } : null,
  };
}
