import { expect } from "vitest";
import type { Database } from "../src/server/database";
import type { Save } from "../src/shared/model";

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
      saved = current.get(id)!;
    expect(saved.money - initial.money).toBe(missionShare);
    expect(saved.economy!.historicalFundingCents).toBe(
      initial.economy!.historicalFundingCents,
    );
    expect(saved.economy).not.toHaveProperty("fundingNextAt");
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
