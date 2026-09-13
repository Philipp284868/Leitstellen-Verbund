import type { DatabaseSync } from "node:sqlite";
import { validate } from "../shared/model";
import { migrateProgression } from "../shared/progression-state";
import { progress, xpForLevel } from "../shared/progression";
import { progress as oldProgress } from "../shared/progression-v1";
import { incidentKeys, incidentLoad } from "../simulation/workload";
import {
  migrateIncidentRadio,
  syncAssistanceRadio,
} from "../simulation/incident-radio";
import { sealMissionXp } from "../simulation/xp-rewards";
import { persistMetrics } from "./leaderboard";

export const XP_REWARDS_SCHEMA = `CREATE TABLE IF NOT EXISTS xp_rewards(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),generation TEXT NOT NULL,mission TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('owner','helper')),amount INTEGER NOT NULL CHECK(amount>=0),version INTEGER NOT NULL CHECK(version=2));`;
/** Runs within the existing backed-up database/startup transaction, including AMP's staged schema upgrade. */
export function applyBalancingMigration(
  sql: DatabaseSync,
  fromVersion: number,
) {
  if (!sql.isTransaction)
    throw Error("Balancing-Migration benötigt eine Transaktion.");
  if (sql.prepare("SELECT 1 FROM meta WHERE key='game-rules-v2'").get())
    return false;
  sql.exec(XP_REWARDS_SCHEMA);
  const source = Number(
    sql
      .prepare("SELECT value FROM meta WHERE key='balance-source-schema'")
      .get()?.value ?? fromVersion,
  );
  const changes: unknown[] = [];
  for (const table of ["saves", "solo_saves"])
    for (const row of sql.prepare(`SELECT user_id,data FROM ${table}`).all()) {
      const raw = JSON.parse(String(row.data)),
        save = validate(raw);
      if (save.player.id !== row.user_id)
        throw Error("Ungültige Leitstellenzuordnung bei Balancing-Migration.");
      migrateProgression(save);
      if (incidentLoad(save).overloaded)
        save.workloadLegacy = [...incidentKeys(save)];
      for (const m of save.missions) sealMissionXp(m, true);
      for (const m of [...save.missions, ...save.archive])
        migrateIncidentRadio(save, m);
      if (table === "saves") {
        sql
          .prepare("UPDATE event_cursors SET xp=? WHERE owner=?")
          .run(save.xp, row.user_id);
        // Keep full historical rows, but stop presenting superseded individual calls as active cards.
        for (const m of [...save.missions, ...save.archive])
          if (m.control?.radioSummary)
            sql
              .prepare(
                "UPDATE game_events SET payload=json_set(payload,'$.supersededBy',?) WHERE owner=? AND json_extract(payload,'$.mission')=? AND json_extract(payload,'$.type') IN('Funk','Sprechwunsch','Einsatz') AND id<>?",
              )
              .run(
                m.control.radioSummary.id,
                row.user_id,
                m.id,
                m.control.radioSummary.id,
              );
      }
      if (save.money !== raw.money)
        throw Error("Balancing-Migration darf kein Geld verändern.");
      sql
        .prepare(`UPDATE ${table} SET data=? WHERE user_id=?`)
        .run(JSON.stringify(validate(save)), row.user_id);
      changes.push({
        table,
        user: row.user_id,
        fromXp: raw.xp,
        toXp: save.xp,
        level: progress(save.xp).level,
        legacyLoad: save.workloadLegacy?.length ?? 0,
      });
    }
  // Existing assisting desks share the restored entry without replaying its first notification.
  const multi = sql
    .prepare("SELECT data FROM saves")
    .all()
    .map((row) => validate(JSON.parse(String(row.data))));
  for (const owner of multi)
    for (const m of [...owner.missions, ...owner.archive]) {
      if (!m.control?.radioSummary) continue;
      for (const helper of multi) {
        if (helper === owner) continue;
        const remote = `remote:${owner.player.id}:${m.id}`;
        const assigned = helper.vehicles.some((v) => v.mission === remote);
        const oldEntries =
          helper.radioNetwork?.entries.filter((e) => e.mission === remote) ??
          [];
        if (!assigned && !oldEntries.length) continue;
        m.control.radioSummary.receivers ??= {};
        m.control.radioSummary.receivers[helper.player.id] =
          m.control.radioSummary.version;
        syncAssistanceRadio(owner, m, helper, true);
        for (const e of oldEntries)
          if (!e.consolidated) {
            e.state = "delivered";
            e.silent = true;
            e.supersededBy = `incident:${m.id}:${helper.player.id}`;
          }
      }
    }
  for (const s of multi)
    sql
      .prepare("UPDATE saves SET data=? WHERE user_id=?")
      .run(JSON.stringify(validate(s)), s.player.id);
  if (source >= 24)
    for (const row of sql
      .prepare("SELECT user_id,xp FROM player_metrics")
      .all()) {
      const before = Number(row.xp),
        old = oldProgress(before),
        start = xpForLevel(old.level),
        required = xpForLevel(old.level + 1) - start;
      const xp =
        start +
        Number((BigInt(old.current) * BigInt(required)) / BigInt(old.required));
      sql
        .prepare("UPDATE player_metrics SET xp=? WHERE user_id=?")
        .run(xp, row.user_id);
      sql.prepare("INSERT INTO meta(key,value) VALUES(?,?)").run(
        `xp-conversion:${row.user_id}`,
        JSON.stringify({
          version: 2,
          fromXp: before,
          toXp: xp,
          level: old.level,
        }),
      );
    }
  // Refresh public dispatch totals without revisiting already ranked historical rewards.
  for (const row of sql.prepare("SELECT data FROM saves").all())
    persistMetrics(sql, validate(JSON.parse(String(row.data))));
  sql
    .prepare("INSERT INTO meta(key,value) VALUES('game-rules-v2',?)")
    .run(JSON.stringify({ version: 2, changes }));
  return true;
}
