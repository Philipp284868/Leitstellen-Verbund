import { checkedCents, mulRatio, sumCents } from "../money";
import type { Economy } from "./schema";
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
/** Original paid/book value, never a price increase after purchase. */
export function saleValue(purchasePriceCents: number): number {
  return mulRatio(checkedCents(purchasePriceCents), 3, 5);
}
