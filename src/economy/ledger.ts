import { checkedCents, mulRatio, sumCents } from "../money";
import type { Economy } from "./schema";
import { FUNDING_INTERVAL } from "./schema";
import { ECONOMY_PRICES } from "./prices";
export type MoneyState = {
  money: number;
  time: number;
  generation: string;
  desk: { sequence: number };
  economy?: Economy;
  receipts: string[];
  journal: { id: string; at: number; amount: number; text: string }[];
};
export function ledgerBalance(s: MoneyState): number {
  if (!s.economy) throw Error("Euro-Umstellung des Spielstands fehlt.");
  return sumCents([
    s.economy.openingBalanceCents,
    ...s.journal.map((j) => j.amount),
  ]);
}
/** All checks precede mutation. Persist in the caller's existing account transaction. */
export function bookMoney(
  s: MoneyState,
  amount: number,
  text: string,
  receipt?: string,
): boolean {
  if (receipt && s.receipts.includes(receipt)) return false;
  if (!s.economy) throw Error("Euro-Umstellung des Spielstands fehlt.");
  checkedCents(amount, true);
  const proposed = sumCents([s.money, amount]);
  if (proposed < 0) throw Error("Nicht genügend Euro-Budget.");
  const balance = checkedCents(proposed);
  const dropped = s.journal.slice(1999),
    opening = sumCents([
      s.economy.openingBalanceCents,
      ...dropped.map((j) => j.amount),
    ]);
  if (!text || text.length > 180) throw Error("Ungültiger Buchungstext.");
  if (receipt && (receipt.length > 100 || s.receipts.length >= 50000))
    throw Error("Buchungsbeleg kann nicht sicher gespeichert werden.");
  const id = receipt ?? `${s.generation}-${s.desk.sequence + 1}`;
  if (!receipt) s.desk.sequence++;
  s.money = balance;
  s.economy.openingBalanceCents = opening;
  if (receipt) s.receipts.push(receipt);
  s.journal = [{ id, at: s.time, amount, text }, ...s.journal.slice(0, 1999)];
  return true;
}
/** No login clock, no debt and no retroactive charge; unused funding above the cap expires. */
export function fundingTick(
  s: MoneyState,
  now = s.time,
  practice = false,
): number {
  if (practice) return 0;
  const e = s.economy;
  if (!e) throw Error("Euro-Umstellung des Spielstands fehlt.");
  if (!Number.isFinite(now) || now < 0 || now > 1e12)
    throw Error("Ungültiger Abrechnungszeitpunkt.");
  if (now < e.fundingNextAt) return 0;
  const intervals = Math.floor((now - e.fundingNextAt) / FUNDING_INTERVAL) + 1,
    next = e.fundingNextAt + intervals * FUNDING_INTERVAL,
    room = Math.max(0, ECONOMY_PRICES.fundingCeiling - s.money),
    amount = Number(
      BigInt(intervals) * BigInt(ECONOMY_PRICES.fundingPerInterval) >
        BigInt(room)
        ? BigInt(room)
        : BigInt(intervals) * BigInt(ECONOMY_PRICES.fundingPerInterval),
    ),
    paid = checkedCents(sumCents([e.fundingPaidCents, amount]));
  // The persisted next-at cursor is the receipt; no ever-growing recurring receipt list.
  if (amount)
    bookMoney(s, amount, "Kommunales Vorhaltebudget · Spielgrundfinanzierung");
  e.fundingNextAt = next;
  e.fundingPaidCents = paid;
  return amount;
}
/** Original paid/book value, never a price increase after purchase. */
export function saleValue(purchasePriceCents: number): number {
  return mulRatio(checkedCents(purchasePriceCents), 3, 5);
}
