import type { DatabaseSync } from "node:sqlite";
import {
  createSituation,
  advanceSituation,
  worldSituationSchema,
  type WorldSituation,
} from "../src/simulation/world-situation";
export const WORLD_SITUATION_KEY = "world-situation-v1";
export function readWorldSituation(
  sql: DatabaseSync,
): WorldSituation | undefined {
  const row = sql
    .prepare("SELECT value FROM meta WHERE key=?")
    .get(WORLD_SITUATION_KEY);
  return row
    ? worldSituationSchema.parse(JSON.parse(String(row.value)))
    : undefined;
}
export function writeWorldSituation(sql: DatabaseSync, state: WorldSituation) {
  const valid = worldSituationSchema.parse(state);
  sql
    .prepare(
      "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(WORLD_SITUATION_KEY, JSON.stringify(valid));
  return valid;
}
export function ensureWorldSituation(sql: DatabaseSync) {
  const existing = readWorldSituation(sql);
  if (existing) return existing;
  // Initialization happens once during migration, not on every login. An empty
  // installation starts at its first server boot; existing simulation clocks survive.
  const rows = sql.prepare("SELECT data FROM saves ORDER BY user_id").all();
  const clocks = rows
    .map((r) => Number(JSON.parse(String(r.data)).time))
    .filter(Number.isFinite);
  return writeWorldSituation(
    sql,
    createSituation(
      clocks.length ? Math.max(...clocks) : Math.floor(Date.now() / 1000),
    ),
  );
}
export function stepWorldSituation(sql: DatabaseSync, seconds: number) {
  return writeWorldSituation(
    sql,
    advanceSituation(ensureWorldSituation(sql), seconds),
  );
}
