/** Integer XP, cumulative thresholds and purchases share this versioned policy. */
export const PROGRESSION_VERSION = 2;
export const MAX_XP = 1_000_000_000_000;
export const XP_BANDS = [
  { from: 1, to: 1, base: 240, step: 0 },
  { from: 2, to: 5, base: 300, step: 45 },
  { from: 6, to: 15, base: 600, step: 45 },
  { from: 16, to: 30, base: 1080, step: 35 },
  { from: 31, to: 50, base: 1620, step: 40 },
  { from: 51, to: Infinity, base: 2420, step: 35 },
] as const;
export function xpForLevel(level: number): number {
  if (!Number.isSafeInteger(level) || level < 1)
    throw Error("Ungültige Stufe.");
  let xp = 0;
  for (const b of XP_BANDS) {
    const n = Math.max(0, Math.min(level - 1, b.to) - b.from + 1);
    xp += n * b.base + (n * (n - 1) * b.step) / 2;
  }
  if (!Number.isSafeInteger(xp))
    throw Error("Stufe außerhalb des sicheren Zahlenbereichs.");
  return xp;
}
export function progress(xp: number) {
  if (!Number.isSafeInteger(xp) || xp < 0 || xp > MAX_XP)
    throw Error(
      "XP außerhalb des unterstützten Zahlenbereichs; keine Gutschrift verworfen.",
    );
  let lo = 1,
    hi = 2;
  while (xpForLevel(hi) <= xp) hi *= 2;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (xpForLevel(mid) <= xp) lo = mid;
    else hi = mid;
  }
  const start = xpForLevel(lo),
    next = xpForLevel(lo + 1);
  return {
    level: lo,
    current: xp - start,
    required: next - start,
    next,
    fraction: (xp - start) / (next - start),
  };
}
export function addXp(state: { xp: number }, amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw Error("Ungültige XP-Gutschrift.");
  progress(state.xp + amount); // Validate before mutating; never clamp earned XP.
  state.xp += amount;
}
/** Original scenario family and severity only; never money, elapsed time or dispatched units. */
export const FAMILY_XP = {
  "small-fire": 20,
  "vehicle-fire": 28,
  vegetation: 35,
  "structure-fire": 55,
  "industry-fire": 90,
  technical: 25,
  collapse: 90,
  traffic: 55,
  hazmat: 75,
  "water-rescue": 65,
  flood: 55,
  medical: 35,
  police: 25,
  crowd: 45,
  supply: 45,
} as const;
export const LEGACY_SCENARIO_XP: Record<string, number> = {
  bin: 20,
  car: 28,
  shed: 25,
  field: 35,
  flat: 55,
  roof: 65,
  factory: 110,
  tree: 25,
  cellar: 25,
  chemical: 90,
  smoke: 75,
  silo: 105,
  sick: 35,
  transfer: 25,
  heart: 55,
  fall: 45,
  birth: 45,
  sport: 35,
  remote: 65,
  care: 40,
  traffic: 25,
  theft: 25,
  burglary: 30,
  match: 40,
  search: 35,
  demo: 45,
  roadblock: 35,
  fair: 55,
  debris: 45,
  pump: 50,
  supply: 45,
  shore: 50,
  capsize: 65,
  flood: 85,
  crash: 75,
  bus: 115,
  warehouse: 100,
  waterrescue: 95,
  collapse: 120,
  rail: 140,
  "bma-false": 20,
};
export function missionXp(t: {
  id?: string;
  level: number;
  seconds: number;
  requirements: Record<string, number>;
  profile?: {
    family: keyof typeof FAMILY_XP;
    severity: number;
    variant: string;
  };
}) {
  if (t.profile)
    return Math.min(
      150,
      FAMILY_XP[t.profile.family] +
        [0, 0, 10, 25][t.profile.severity] +
        (t.profile.variant === "extended" ? 10 : 0),
    );
  const value = t.id && LEGACY_SCENARIO_XP[t.id];
  if (value) return value;
  throw Error("Fehlende fachliche XP-Vergütung für Einsatzvorlage.");
}
/** The level comes exclusively from the authoritative owning dispatch XP. */
export function maxConcurrentIncidents(level: number) {
  if (!Number.isSafeInteger(level) || level < 1)
    throw Error("Ungültige Stufe.");
  return Math.min(10, level + 2);
}
export const unlockLevels: Record<string, Record<string, number>> = {
  building: {
    kats: 16,
    fire: 1,
    ems: 4,
    police: 7,
    school: 4,
    hospital: 12,
    thw: 15,
    water: 19,
    heli: 30,
  },
  vehicle: {
    flf: 24,
    ulf: 24,
    "thw-power": 18,
    "thw-pump": 18,
    "thw-light": 15,
    "kats-log": 16,
    "dive-unit": 22,
    tsf: 1,
    lf: 2,
    tlf: 3,
    rtw: 4,
    ktw: 4,
    hlf: 6,
    fustw: 7,
    elw: 8,
    dlk: 10,
    nef: 9,
    pmtw: 13,
    rw: 14,
    gkw: 15,
    mzgw: 17,
    tmtw: 15,
    air: 18,
    gww: 19,
    boat: 19,
    haz: 24,
    rth: 30,
    lf10: 2,
    hlf10: 5,
    tlf2000: 3,
    tlf3000: 5,
    elw2: 32,
    kdow: 8,
    vrw: 9,
    gwl: 13,
    gwmess: 22,
    gwt: 15,
    abruest: 28,
    abwasser: 25,
    abschaum: 26,
    abatem: 26,
    abgefahrgut: 30,
    sw: 16,
    dekonp: 28,
    grtw: 34,
    naw: 14,
    itw: 26,
    ith: 38,
    rtwxl: 12,
    ktwb: 8,
    mzf: 10,
    elrd: 18,
    orgl: 22,
    lna: 24,
    segrtw: 14,
    gwsan: 20,
    segbetreuung: 17,
  },
  extension: { technical: 14, hazmat: 24, air: 18, doctor: 9 },
};
export function unlockLevel(kind: string, id: string) {
  const value = unlockLevels[kind]?.[id];
  if (!value) throw Error(`Fehlende Freischaltregel: ${kind}/${id}`);
  return value;
}
