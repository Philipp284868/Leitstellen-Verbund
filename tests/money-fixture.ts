import type { Save } from "../src/model";
import { bookMoney } from "../src/economy/ledger";
import { euro } from "../src/money";

/** Explicit developer funding, preserving the real euro journal reconciliation. */
export function fundTestBudget(s: Save, wholeEuros: number) {
  bookMoney(s, euro(wholeEuros) - s.money, "Entwickler-Testbudget");
}
