import type { OperatingBill } from "./operating-cost-schema";
import { vt } from "../shared/catalog";
import { euro } from "../shared/money";
import { bookMoney } from "../shared/economy/ledger";
import type { Building, Save } from "../shared/model";
import type { AidRequest } from "./organizations-schema";
export function newOperatingBill(at: number): OperatingBill {
  return {
    version: 1,
    nextAt: at + 1800,
    lastAt: at,
    numerator: 0,
    due: 0,
    paid: 0,
    serial: 0,
  };
}
export function readinessHalfHour(s: Save, b: Building) {
  const fleet = s.vehicles.filter((v) => v.home === b.id);
  const people = s.people.filter((p) => p.home === b.id).length;
  return euro(
    fleet.reduce(
      (n, v) =>
        n +
        150 +
        (vt(v.type).level >= 10 ? 100 : 0) +
        (v.status !== "ready" ? 50 : 0),
      0,
    ) +
      people * 12,
  );
}
export function aidHalfHour(r: AidRequest) {
  return euro(
    r.assignments.reduce(
      (n, a) =>
        n + 250 + vt(a.type).crew * 15 + (vt(a.type).level >= 10 ? 150 : 0),
      0,
    ),
  );
}
/** Integer cent-millisecond accrual, periodic invoices, no simulation crash on
 * insufficient funds. Unpaid costs remain visible and are collected later. */
export function operatingCostTick(
  s: Save,
  bill: OperatingBill,
  rate: number,
  active: boolean,
  key: string,
  label: string,
) {
  const elapsed = Math.max(0, Math.round((s.time - bill.lastAt) * 1000));
  if (active) bill.numerator += elapsed * rate;
  bill.lastAt = s.time;
  if (s.time >= bill.nextAt || !active) {
    const cents = active
      ? Math.floor(bill.numerator / 1800000)
      : Math.ceil(bill.numerator / 1800000);
    bill.due += cents;
    bill.numerator = active ? bill.numerator - cents * 1800000 : 0;
    bill.nextAt = s.time + 1800;
  }
  const paid = Math.min(s.money, bill.due);
  if (paid > 0) {
    if (
      bookMoney(
        s,
        -paid,
        label,
        `operating:${s.generation}:${key}:${bill.serial}`,
      )
    ) {
      bill.due -= paid;
      bill.paid += paid;
      bill.serial++;
    }
  }
}
