import { legacyMissionRewards } from "../catalog";
import { validate, type Mission, type Save } from "../model";
import {
  checkedCents,
  LEGACY_CREDIT_CENTS,
  mulRatio,
  sumCents,
} from "../money";
import { bookMoney, ledgerBalance } from "./ledger";
import { legacyPrice, priceEntries } from "./prices";
import { newEconomy } from "./schema";

/** Old units were whole fictional credits. This is a fixed game-design conversion. */
export function convertLegacyCredits(value: number, signed = false): number {
  if (
    !Number.isSafeInteger(value) ||
    Math.abs(value) > 1e12 ||
    (!signed && value < 0)
  )
    throw Error(
      "Ungültiger Alt-Creditbetrag; Migration unverändert abgebrochen.",
    );
  return checkedCents(
    Number(BigInt(value) * BigInt(LEGACY_CREDIT_CENTS)),
    signed,
  );
}
export function convertMissionMoney(m: Mission): void {
  if (m.telemetry?.credits != null)
    m.telemetry.credits = convertLegacyCredits(m.telemetry.credits);
  if (m.report?.credits != null)
    m.report.credits = convertLegacyCredits(m.report.credits);
  if (m.paymentCents === undefined && m.phase !== "done") {
    const reward = legacyMissionRewards.get(m.template);
    if (reward === undefined)
      throw Error(`Alte Einsatzvergütung unbekannt: ${m.template}`);
    m.paymentCents = convertLegacyCredits(reward);
  }
}
/** Exact largest catalog price ratio: enough cash protection to preserve old purchase choices. */
export function protectionRatio() {
  let numerator = 1,
    denominator = 1;
  for (const p of priceEntries()) {
    const old = convertLegacyCredits(p.legacyCredits);
    if (
      old > 0 &&
      BigInt(p.cents) * BigInt(denominator) > BigInt(numerator) * BigInt(old)
    ) {
      numerator = p.cents;
      denominator = old;
    }
  }
  return { numerator, denominator };
}
export type CurrencyChange = {
  converted: boolean;
  repriced: boolean;
  before: number;
  convertedBalanceCents: number;
  compensationCents: number;
  afterCents: number;
  journalSumCents: number;
  openingBalanceCents: number;
};
/** Works on a clone. Currency and price versions are deliberately separate idempotent steps. */
export function migrateEconomy(input: Save): {
  save: Save;
  change: CurrencyChange;
} {
  const s = structuredClone(input),
    before = s.money,
    converted = !s.economy;
  if (converted) {
    s.money = convertLegacyCredits(s.money);
    for (const j of s.journal) j.amount = convertLegacyCredits(j.amount, true);
    for (const m of [...s.missions, ...s.archive]) convertMissionMoney(m);
    for (const c of s.contributions)
      c.maxReward = convertLegacyCredits(c.maxReward);
    s.statistics.credits = convertLegacyCredits(s.statistics.credits);
    for (const b of s.buildings)
      b.purchasePriceCents ??= convertLegacyCredits(
        legacyPrice("building", b.type),
      );
    for (const v of s.vehicles)
      v.purchasePriceCents ??= convertLegacyCredits(
        legacyPrice("vehicle", v.type),
      );
    s.economy = newEconomy(
      s.time,
      sumCents([s.money, -sumCents(s.journal.map((j) => j.amount))]),
    );
    s.economy.priceVersion = 0;
  }
  const e = s.economy!;
  if (ledgerBalance(s) !== s.money)
    throw Error(
      "Euro-Migration: Buchungssumme stimmt nicht mit dem Guthaben überein.",
    );
  const convertedBalanceCents = s.money,
    repriced = e.priceVersion === 0;
  let compensationCents = 0;
  if (repriced) {
    const ratio = protectionRatio();
    compensationCents = sumCents([
      mulRatio(s.money, ratio.numerator, ratio.denominator),
      -s.money,
    ]);
    if (
      compensationCents &&
      !bookMoney(
        s,
        compensationCents,
        "Bestandsschutz · Kaufkraftausgleich Preisversion 1",
        "economy-price-v1",
      )
    )
      throw Error(
        "Euro-Migration: Ausgleichsbeleg und Preisversion widersprechen sich.",
      );
    e.compensationCents = checkedCents(
      sumCents([e.compensationCents, compensationCents]),
    );
    e.priceVersion = 1;
  }
  if (ledgerBalance(s) !== s.money)
    throw Error("Euro-Migration: Summenprüfung nach Ausgleich fehlgeschlagen.");
  const save = validate(s);
  return {
    save,
    change: {
      converted,
      repriced,
      before,
      convertedBalanceCents,
      compensationCents,
      afterCents: s.money,
      journalSumCents: sumCents(s.journal.map((j) => j.amount)),
      openingBalanceCents: e.openingBalanceCents,
    },
  };
}
