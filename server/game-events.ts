import type { DatabaseSync } from "node:sqlite";
import type { Save } from "../src/model";
import { projectEvents } from "../src/game-events";
import { progress } from "../src/progression";
export const EVENTS_SCHEMA = `CREATE TABLE IF NOT EXISTS game_events(owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,id TEXT NOT NULL,at REAL NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(owner,id));
CREATE INDEX IF NOT EXISTS game_events_page ON game_events(owner,at DESC,id DESC);
CREATE TABLE IF NOT EXISTS event_cursors(owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,xp INTEGER NOT NULL);`;
export function persistGameEvents(
  sql: DatabaseSync,
  s: Save,
  known: Map<string, string>,
) {
  const events = projectEvents(s),
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
    "INSERT INTO game_events VALUES(?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET payload=excluded.payload",
  );
  for (const e of events) {
    const payload = JSON.stringify(e);
    if (known.get(e.id) === payload) continue;
    put.run(s.player.id, e.id, e.at, payload);
    known.set(e.id, payload);
  }
  while (known.size > 4000) known.delete(known.keys().next().value!);
  // Operational log has bounded retention; the full incident archive/journal remains separate.
  sql
    .prepare(
      "DELETE FROM game_events WHERE owner=? AND id IN (SELECT id FROM game_events WHERE owner=? ORDER BY at DESC,id DESC LIMIT -1 OFFSET 10000)",
    )
    .run(s.player.id, s.player.id);
}
export function eventsPage(
  sql: DatabaseSync,
  owner: string,
  before?: { at: number; id: string },
) {
  const rows = before
    ? sql
        .prepare(
          "SELECT payload FROM game_events WHERE owner=? AND (at<? OR (at=? AND id<?)) ORDER BY at DESC,id DESC LIMIT 101",
        )
        .all(owner, before.at, before.at, before.id)
    : sql
        .prepare(
          "SELECT payload FROM game_events WHERE owner=? ORDER BY at DESC,id DESC LIMIT 101",
        )
        .all(owner);
  const events = rows.slice(0, 100).map((r) => JSON.parse(String(r.payload)));
  const last = events.at(-1);
  return {
    events: events.reverse(),
    next: rows.length > 100 ? { at: last.at, id: last.id } : null,
  };
}
