import { fixturePurchase } from "./fixtures/germany/facilities";
import { describe, expect, it } from "vitest";
import { buildings, extensions, missions, vehicles } from "../src/catalog";
import { economyBalanceAudit } from "../src/economy/balancing";
import {
  bookMoney,
  fundingTick,
  ledgerBalance,
  saleValue,
} from "../src/economy/ledger";
import {
  convertLegacyCredits,
  migrateEconomy,
  protectionRatio,
} from "../src/economy/migration";
import { ECONOMY_PRICES, priceEntries } from "../src/economy/prices";
import { apply, beginTrip, tick } from "../src/engine";
import { fresh, validate } from "../src/model";
import {
  MAX_CENTS,
  checkedCents,
  euro,
  formatMoney,
  mulRatio,
  sumCents,
} from "../src/money";
import { sites as nodes } from "./fixtures/germany/locations";

describe("Euro-Cent-Modell und vollständiger Preiskatalog", () => {
  it("trägt sechs offengelegte Einstiegs-/Ausbau-/Abwesenheitsszenarien ohne mehr Notrufe oder schnellere Fahrten", () => {
    const cases = economyBalanceAudit();
    expect(cases).toHaveLength(6);
    expect(economyBalanceAudit()).toEqual(cases);
    expect(cases.find((c) => c.id === "entry")!.reserve).toBe(euro(570000));
    expect(cases.find((c) => c.id === "entry")!.secondsToGoal).toBe(0);
    expect(cases.find((c) => c.id === "advanced")!.secondsToGoal).toBeLessThan(
      13 * 3600,
    );
    expect(cases.find((c) => c.id === "absence")!.secondsToGoal).toBe(90 * 60);
    expect(cases.find((c) => c.id === "absence")!.finalCents).toBe(
      ECONOMY_PRICES.fundingCeiling,
    );
    expect(cases.every((c) => c.nextReserve >= 0)).toBe(true);
  });
  it("bewahrt auch im großen sicheren Bereich den letzten Cent und rundet nur einmal", () => {
    expect(formatMoney(12500000)).toMatch(/^125\.000,00\s€$/);
    expect(formatMoney(MAX_CENTS - 1)).toMatch(
      /^89\.999\.999\.999\.999,99\s€$/,
    );
    expect(formatMoney(-1)).toMatch(/^-0,01\s€$/);
    expect(mulRatio(101, 3, 5)).toBe(60);
    expect(mulRatio(-101, 3, 5)).toBe(-61);
    expect(sumCents([MAX_CENTS, -MAX_CENTS, 1])).toBe(1);
    for (const n of [NaN, Infinity, 0.1, MAX_CENTS + 1, -1])
      expect(() => checkedCents(n)).toThrow();
    expect(() => sumCents([MAX_CENTS, 1])).toThrow();
    expect(() => convertLegacyCredits(1.1)).toThrow();
  });
  it("enthält jede reale Katalogposition und eine betriebsfähige erste Anschaffung mit Reserve", () => {
    expect(vehicles).toHaveLength(50);
    expect(priceEntries()).toHaveLength(
      buildings.length + vehicles.length + extensions.length,
    );
    expect(
      new Set(
        priceEntries().map(
          (p) => p.cents / convertLegacyCredits(p.legacyCredits),
        ),
      ).size,
    ).toBeGreaterThan(10);
    const fire = buildings.find((b) => b.id === "fire")!,
      tsf = vehicles.find((v) => v.id === "tsf")!;
    expect(ECONOMY_PRICES.start - fire.price - tsf.price).toBe(euro(570000));
    expect(
      ECONOMY_PRICES.hire +
        ECONOMY_PRICES.training +
        ECONOMY_PRICES.operatingPerHour,
    ).toBe(0);
    expect(
      missions.every((m) => Number.isSafeInteger(m.reward) && m.reward > 0),
    ).toBe(true);
    expect(saleValue(euro(180000))).toBe(euro(108000));
  });
  it("bucht atomar und einmalig; die gekürzte Journalansicht bleibt centgenau abstimmbar", () => {
    const s = fresh("Euro", "Mitte", 1000);
    const initial = s.money;
    expect(bookMoney(s, -101, "Kauf", "purchase-one")).toBe(true);
    expect(bookMoney(s, -101, "Kauf", "purchase-one")).toBe(false);
    const before = structuredClone(s);
    expect(() => bookMoney(s, -s.money - 1, "Zu teuer")).toThrow("Euro-Budget");
    expect(s).toEqual(before);
    for (let i = 0; i < 2010; i++) bookMoney(s, 1, "Centbeleg");
    expect(s.journal).toHaveLength(2000);
    expect(s.money).toBe(initial - 101 + 2010);
    expect(ledgerBalance(s)).toBe(s.money);
    expect(validate(s)).toBeDefined();
  });
  it("finanziert geringe Einsatzdichte zeitbasiert ohne Login-/Übungsfarm oder Abwesenheitsschulden", () => {
    let s = fresh("Vorhaltung", "Mitte", 1000);
    bookMoney(s, -s.money, "Bestand vollständig investiert");
    const first = s.economy!.fundingNextAt;
    expect(fundingTick(s, first - 1)).toBe(0);
    expect(fundingTick(s, first)).toBe(euro(30000));
    expect(fundingTick(s, first)).toBe(0);
    s = validate(structuredClone(s));
    expect(fundingTick(s, first)).toBe(0);
    const before = structuredClone(s);
    expect(fundingTick(s, first + 86400, true)).toBe(0);
    expect(s).toEqual(before);
    expect(fundingTick(s, first + 30 * 86400)).toBe(euro(2470000));
    expect(s.money).toBe(ECONOMY_PRICES.fundingCeiling);
    const after = s.economy!.fundingNextAt;
    bookMoney(s, -euro(100000), "Späterer Kauf");
    expect(fundingTick(s, after - 1)).toBe(0);
    expect(fundingTick(s, after)).toBe(euro(30000));
    expect(ledgerBalance(s)).toBe(s.money);
    expect(s.receipts).toEqual([]);
  });
  it("trennt Währungsumrechnung, Kaufkraftausgleich und XP und wiederholt nichts", () => {
    const old = fresh("Altbestand", "Mitte", 1000);
    delete old.economy;
    old.money = 250000;
    old.journal = [
      {
        id: "old-cost",
        at: old.time,
        amount: -18000,
        text: "Alte Anschaffung",
      },
    ];
    old.statistics.credits = 5301;
    old.xp = 12345;
    const snapshot = structuredClone(old),
      result = migrateEconomy(old),
      ratio = protectionRatio();
    expect(old).toEqual(snapshot);
    expect(result.change.convertedBalanceCents).toBe(euro(2500000));
    expect(result.change.compensationCents).toBeGreaterThan(0);
    expect(result.save.money).toBe(
      mulRatio(euro(2500000), ratio.numerator, ratio.denominator),
    );
    expect(result.save.xp).toBe(old.xp);
    expect(result.save.statistics.credits).toBe(5301000);
    expect(result.save.journal.find((j) => j.id === "old-cost")!.amount).toBe(
      -18000000,
    );
    expect(ledgerBalance(result.save)).toBe(result.save.money);
    expect(migrateEconomy(result.save).save).toEqual(result.save);
    expect(migrateEconomy(result.save).change.converted).toBe(false);
    for (const p of priceEntries()) {
      if (
        convertLegacyCredits(p.legacyCredits) <=
        result.change.convertedBalanceCents
      )
        expect(p.cents).toBeLessThanOrEqual(result.save.money);
    }
  });
  it("bewahrt rollende Fahrzeuge, Besatzungsbindungen und Seeds und übernimmt ursprüngliche Katalogbuchwerte", () => {
    const s = fresh("Mobil", "Nord", 1000);
    apply(s, fixturePurchase("fire", nodes[0]));
    tick(s, s.time + 30, {}, false, false);
    apply(s, { type: "buy", kind: "tsf", home: s.buildings[0].id });
    beginTrip(s, s.vehicles[0], nodes[1], "return");
    delete s.economy;
    for (const o of [...s.buildings, ...s.vehicles])
      delete o.purchasePriceCents;
    s.money = 177000;
    s.journal = [
      { id: "old-build", at: 1000, amount: -55000, text: "Bau" },
      { id: "old-buy", at: 1030, amount: -18000, text: "Kauf" },
    ];
    const before = structuredClone(s),
      { save } = migrateEconomy(s);
    expect(save.seed).toBe(before.seed);
    expect(save.people).toEqual(before.people);
    expect(save.vehicles[0]).toEqual({
      ...before.vehicles[0],
      purchasePriceCents: euro(180000),
    });
    expect(save.buildings[0]).toEqual({
      ...before.buildings[0],
      purchasePriceCents: euro(550000),
    });
    expect(saleValue(save.vehicles[0].purchasePriceCents!)).toBe(euro(108000));
    expect(s).toEqual(before);
  });
  it("lehnt widersprüchliche Preisversion und schon vorhandenen Ausgleichsbeleg atomar ab", () => {
    const s = fresh("Widerspruch", "Nord", 1000);
    s.economy!.priceVersion = 0;
    s.receipts.push("economy-price-v1");
    const before = structuredClone(s);
    expect(() => migrateEconomy(s)).toThrow("widersprechen");
    expect(s).toEqual(before);
  });
});
