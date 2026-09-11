import { checkedCents, euro } from "../money";
export const PRICE_VERSION = 1;
/** Deliberately compressed game prices; procurement evidence/limits are in docs/EURO-WIRTSCHAFT.md. */
const euros = {
  building: {
    kats: 520000,
    fire: 650000,
    ems: 450000,
    police: 420000,
    thw: 680000,
    water: 420000,
    hospital: 1600000,
    school: 400000,
    heli: 980000,
  },
  vehicle: {
    flf: 1250000,
    ulf: 980000,
    "thw-power": 340000,
    "thw-pump": 460000,
    "thw-light": 290000,
    "kats-log": 380000,
    "dive-unit": 410000,
    tsf: 180000,
    lf: 320000,
    hlf: 520000,
    tlf: 350000,
    dlk: 720000,
    elw: 200000,
    rw: 450000,
    haz: 480000,
    air: 290000,
    rtw: 240000,
    ktw: 130000,
    nef: 160000,
    rth: 1450000,
    fustw: 85000,
    pmtw: 125000,
    gkw: 390000,
    mzgw: 360000,
    tmtw: 110000,
    gww: 270000,
    boat: 320000,
    lf10: 260000,
    hlf10: 410000,
    tlf2000: 280000,
    tlf3000: 310000,
    elw2: 780000,
    kdow: 90000,
    vrw: 200000,
    gwl: 310000,
    gwmess: 360000,
    gwt: 340000,
    abruest: 730000,
    abwasser: 620000,
    abschaum: 670000,
    abatem: 640000,
    abgefahrgut: 790000,
    sw: 300000,
    dekonp: 510000,
    grtw: 980000,
    naw: 360000,
    itw: 590000,
    ith: 2100000,
    rtwxl: 310000,
    ktwb: 180000,
    mzf: 220000,
    elrd: 140000,
    orgl: 150000,
    lna: 170000,
    segrtw: 200000,
    gwsan: 480000,
    segbetreuung: 270000,
  },
  extension: { technical: 95000, hazmat: 180000, air: 90000, doctor: 90000 },
} satisfies Record<string, Record<string, number>>;
export type PriceKind = keyof typeof euros;
export type PriceEntry = {
  kind: PriceKind;
  id: string;
  legacyCredits: number;
  cents: number;
};
const oldPrices = new Map<string, PriceEntry>();
/** Called once by the original catalog: old nominal prices are retained as migration evidence. */
export function catalogPrice(
  kind: PriceKind,
  id: string,
  legacyCredits: number,
): number {
  const value = (euros[kind] as Record<string, number>)[id];
  if (value === undefined) throw Error(`Europreis fehlt: ${kind}/${id}`);
  const cents = euro(value);
  oldPrices.set(`${kind}:${id}`, { kind, id, legacyCredits, cents });
  return cents;
}
export function priceEntries(): PriceEntry[] {
  return [...oldPrices.values()].map((x) => ({ ...x }));
}
export function legacyPrice(kind: PriceKind, id: string): number {
  const price = oldPrices.get(`${kind}:${id}`);
  if (!price) throw Error(`Historischer Katalogpreis fehlt: ${kind}/${id}`);
  return price.legacyCredits;
}
export const ECONOMY_PRICES = {
  start: euro(1400000),
  upgrade: euro(110000),
  professionalFire: euro(1350000),
  hire: 0,
  training: 0,
  operatingPerHour: 0,
  fundingPerInterval: euro(30000),
  fundingCeiling: euro(2500000),
  legacyReliefReward: euro(15000),
};
/** Fixed scenario funding, independent of extra vehicles, actual elapsed time or escalation. */
export function missionPayment(t: {
  level: number;
  seconds: number;
  requirements: Record<string, number>;
}): number {
  const skills = Object.keys(t.requirements).length;
  return checkedCents(
    euro(
      5000 +
        Math.min(12000, Math.max(0, t.level - 1) * 350) +
        skills * 1250 +
        Math.min(6000, Math.floor(t.seconds / 30) * 500),
    ),
  );
}
