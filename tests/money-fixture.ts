import type { Save } from "../src/shared/model";
import { bookMoney } from "../src/shared/economy/ledger";
import { euro } from "../src/shared/money";

/** Explicit developer funding, preserving the real euro journal reconciliation. */
export function fundTestBudget(s: Save, wholeEuros: number) {
  bookMoney(s, euro(wholeEuros) - s.money, "Entwickler-Testbudget");
}
