import type { DatabaseSync } from "node:sqlite";
import { missionSchema, validate } from "../shared/model";
import {
  convertLegacyCredits,
  convertMissionMoney,
  migrateEconomy,
} from "../shared/economy/migration";
import { migrateBuildingStaffing } from "../simulation/building-staffing";

export const PERSONAL_PROGRESS_SCHEMA = `
CREATE TABLE IF NOT EXISTS tutorial_progress(user_id TEXT PRIMARY KEY REFERENCES users(id),payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS training_worlds(user_id TEXT PRIMARY KEY REFERENCES users(id),payload TEXT NOT NULL,updated_at INTEGER NOT NULL);`;

/** Read-only plan; no writes or shared object mutation, also used by the actual transaction. */
export function planEconomyMigration(db: DatabaseSync) {
  const has = (name: string) =>
    !!db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(name);
  const oldOwners = new Set<string>();
  const saves = ["saves", "solo_saves"].filter(has).flatMap((table) =>
    db
      .prepare(`SELECT user_id,data FROM ${table}`)
      .all()
      .map((row) => {
        const raw = JSON.parse(String(row.data)),
          checked = validate(raw),
          user = String(row.user_id),
          mode = table === "saves" ? "multi" : "single";
        if (checked.player.id !== user)
          throw Error("Euro-Migration: Kontobesitz stimmt nicht überein.");
        const { save, change } = migrateEconomy(checked);
        if (change.converted) oldOwners.add(`${mode}:${user}`);
        const staffing = migrateBuildingStaffing(save);
        return {
          table,
          mode,
          user,
          save: validate(save),
          change,
          staffing,
          oldXp: checked.xp,
        };
      }),
  );
  const histories = has("mission_history")
    ? db
        .prepare("SELECT owner,mode,id,data FROM mission_history")
        .all()
        .filter((r) => oldOwners.has(`${r.mode}:${r.owner}`))
        .map((row) => {
          const mission = missionSchema.parse(JSON.parse(String(row.data)));
          const oldCredits = mission.report?.credits ?? 0;
          convertMissionMoney(mission);
          return {
            owner: String(row.owner),
            mode: String(row.mode),
            id: String(row.id),
            data: JSON.stringify(missionSchema.parse(mission)),
            oldCredits,
            cents: mission.report?.credits ?? 0,
          };
        })
    : [];
  const rewards = has("rewards")
    ? db
        .prepare("SELECT id,user_id,amount FROM rewards")
        .all()
        .filter((r) => oldOwners.has(`multi:${r.user_id}`))
        .map((row) => ({
          id: String(row.id),
          before: Number(row.amount),
          cents: convertLegacyCredits(Number(row.amount)),
        }))
    : [];
  const total = (values: number[]) =>
    values.reduce((n, v) => n + BigInt(v), 0n).toString();
  const summary = {
    currencyVersion: 1,
    priceVersion: 1,
    unit: "cent",
    currency: "EUR",
    saves: saves.map(({ user, mode, change, staffing, oldXp, save }) => ({
      user,
      mode,
      ...change,
      oldXp,
      newXp: save.xp,
      staffing,
    })),
    totals: {
      convertedBalanceCents: total(
        saves.map((s) => s.change.convertedBalanceCents),
      ),
      compensationCents: total(saves.map((s) => s.change.compensationCents)),
      afterCents: total(saves.map((s) => s.change.afterCents)),
      historyBeforeCredits: total(histories.map((h) => h.oldCredits)),
      historyAfterCents: total(histories.map((h) => h.cents)),
      rewardsBeforeCredits: total(rewards.map((r) => r.before)),
      rewardsAfterCents: total(rewards.map((r) => r.cents)),
    },
    historiesConverted: histories.length,
    rewardsConverted: rewards.length,
  };
  if (
    BigInt(summary.totals.convertedBalanceCents) +
      BigInt(summary.totals.compensationCents) !==
    BigInt(summary.totals.afterCents)
  )
    throw Error("Euro-Migration: Gesamtsummen stimmen nicht überein.");
  if (
    BigInt(summary.totals.rewardsBeforeCredits) * 1000n !==
      BigInt(summary.totals.rewardsAfterCents) ||
    BigInt(summary.totals.historyBeforeCredits) * 1000n !==
      BigInt(summary.totals.historyAfterCents)
  )
    throw Error("Euro-Migration: Historische Summen stimmen nicht überein.");
  return { saves, histories, rewards, summary };
}
/** Caller must hold BEGIN IMMEDIATE and create the existing pre-migration backup first. */
export function applyEconomyMigration(db: DatabaseSync) {
  if (!db.isTransaction)
    throw Error("Euro-Migration benötigt eine gemeinsame Transaktion.");
  const plan = planEconomyMigration(db);
  db.exec(PERSONAL_PROGRESS_SCHEMA);
  for (const s of plan.saves)
    db.prepare(`UPDATE ${s.table} SET data=? WHERE user_id=?`).run(
      JSON.stringify(s.save),
      s.user,
    );
  for (const h of plan.histories)
    db.prepare(
      "UPDATE mission_history SET data=? WHERE owner=? AND mode=? AND id=?",
    ).run(h.data, h.owner, h.mode, h.id);
  for (const r of plan.rewards)
    db.prepare("UPDATE rewards SET amount=? WHERE id=?").run(r.cents, r.id);
  db.prepare(
    "INSERT INTO meta(key,value) VALUES('economy-v1',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(JSON.stringify(plan.summary));
  // Parse persisted values again before committing, including their independent currency marker.
  const verify = planEconomyMigration(db);
  if (
    verify.saves.some((s) => s.change.converted || s.change.repriced) ||
    verify.histories.length ||
    verify.rewards.length ||
    verify.summary.totals.afterCents !== plan.summary.totals.afterCents
  )
    throw Error(
      "Euro-Migration: Wiederholungs-/Persistenzprüfung fehlgeschlagen.",
    );
  return plan.summary;
}
