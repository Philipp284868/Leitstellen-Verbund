/** Integer XP, cumulative thresholds and purchases share this versioned policy. */
export const PROGRESSION_VERSION = 1;
export const MAX_XP = 1_000_000_000_000;
const bands = [
  { from: 1, to: 5, base: 150, step: 35 },
  { from: 6, to: 10, base: 400, step: 60 },
  { from: 11, to: 25, base: 850, step: 35 },
  { from: 26, to: 50, base: 1600, step: 50 },
  { from: 51, to: Infinity, base: 2850, step: 35 },
];
export function xpForLevel(level: number): number {
  if (!Number.isSafeInteger(level) || level < 1)
    throw Error("Ungültige Stufe.");
  let xp = 0;
  for (const b of bands) {
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
/** Based on original scenario requirements, never runtime escalation, time or unit count. */
export function missionXp(t: {
  level: number;
  seconds: number;
  requirements: Record<string, number>;
}) {
  return (
    100 +
    Math.min(60, Math.floor(t.seconds / 30) * 10) +
    Math.min(100, Object.keys(t.requirements).length * 15) +
    Math.max(0, t.level - 1) * 35
  );
}
export const unlockLevels: Record<string, Record<string, number>> = {
  building: {
    kats: 8,
    fire: 1,
    ems: 4,
    police: 7,
    school: 5,
    hospital: 12,
    thw: 15,
    water: 20,
    heli: 30,
  },
  vehicle: {
    flf: 24,
    ulf: 24,
    "thw-power": 18,
    "thw-pump": 18,
    "thw-light": 15,
    "kats-log": 12,
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
    nef: 11,
    pmtw: 13,
    rw: 14,
    gkw: 15,
    mzgw: 17,
    tmtw: 15,
    air: 18,
    gww: 20,
    boat: 20,
    haz: 24,
    rth: 30,
    lf10: 2,
    hlf10: 5,
    tlf2000: 3,
    tlf3000: 5,
    elw2: 32,
    kdow: 8,
    vrw: 9,
    gwl: 16,
    gwmess: 22,
    gwt: 16,
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
  extension: { technical: 14, hazmat: 24, air: 18, doctor: 11 },
};
export function unlockLevel(kind: string, id: string) {
  const value = unlockLevels[kind]?.[id];
  if (!value) throw Error(`Fehlende Freischaltregel: ${kind}/${id}`);
  return value;
}
