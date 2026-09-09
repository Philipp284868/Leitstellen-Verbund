import { expect } from "vitest";
import type { Database } from "../server/database";
import type { Save } from "../src/model";
import { ECONOMY_PRICES } from "../src/economy/prices";
import { FUNDING_INTERVAL } from "../src/economy/schema";

/** Check both independent income streams, not just a permissive balance delta. */
export function expectCoopPaymentOnce(
  db: Database,
  before: readonly [Save, Save],
  round: string,
  missionShare: number,
) {
  const current = db.all();
  for (const [index, initial] of before.entries()) {
    const id = initial.player.id,
      saved = current.get(id)!,
      old = initial.economy!,
      intervals =
        Math.floor((saved.time - old.fundingNextAt) / FUNDING_INTERVAL) + 1,
      funding = intervals * ECONOMY_PRICES.fundingPerInterval,
      oldJournalIds = new Set(initial.journal.map((j) => j.id)),
      newJournal = saved.journal.filter((j) => !oldJournalIds.has(j.id));
    // These fixtures deliberately start one second before funding, with room
    // below the ceiling throughout transport, restart and the later replay.
    expect(intervals).toBeGreaterThanOrEqual(1);
    expect(initial.money + funding + missionShare).toBeLessThan(
      ECONOMY_PRICES.fundingCeiling,
    );
    expect(saved.economy!.fundingPaidCents - old.fundingPaidCents).toBe(
      funding,
    );
    expect(saved.economy!.fundingNextAt).toBe(
      old.fundingNextAt + intervals * FUNDING_INTERVAL,
    );
    expect(
      newJournal
        .filter(
          (j) =>
            j.text === "Kommunales Vorhaltebudget · Spielgrundfinanzierung",
        )
        .reduce((total, j) => total + j.amount, 0),
    ).toBe(funding);
    expect(saved.money - initial.money).toBe(missionShare + funding);
    expect(
      saved.journal.filter(
        (j) => j.id === `${index === 0 ? "solo" : "coop"}:${round}:${id}`,
      ),
    ).toMatchObject([{ amount: missionShare }]);
    expect(
      db.sql
        .prepare("SELECT user_id,amount FROM rewards WHERE id=?")
        .all(`${index === 0 ? "owner" : "coop"}:${round}:${id}`),
    ).toEqual([{ user_id: id, amount: missionShare }]);
  }
}
