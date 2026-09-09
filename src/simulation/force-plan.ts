import {
  capabilities,
  vehicles,
  type Skills,
  type VehicleType,
} from "../catalog";

type Allocation = { type: VehicleType; skills: Skills };
export type ForceRow = {
  type: string;
  name: string;
  present: number;
  required: number;
};
/** A concrete, economical coverage suggestion. Equivalent units count by their actual abilities. */
function allocate(required: Skills): Allocation[] {
  const remaining = { ...required },
    result: Allocation[] = [];
  while (Object.values(remaining).some((n) => n > 0)) {
    const candidates = vehicles
      .map((type) => ({
        type,
        score:
          Object.entries(remaining).reduce(
            (sum, [key, n]) =>
              sum + (n > 0 ? Math.min(n, type.skills[key] ?? 0) / n : 0),
            0,
          ) / Math.sqrt(type.price),
      }))
      .filter((c) => c.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.type.level - b.type.level ||
          a.type.id.localeCompare(b.type.id),
      );
    if (!candidates.length) break;
    const type = candidates[0].type,
      skills: Skills = {};
    for (const [key, n] of Object.entries(remaining))
      if (n > 0 && type.skills[key]) {
        skills[key] = Math.min(n, type.skills[key]);
        remaining[key] -= skills[key];
      }
    result.push({ type, skills });
  }
  return result;
}
export function forceRows(
  required: Skills,
  available: Skills = {},
): ForceRow[] {
  const remaining = { ...available },
    rows = new Map<string, ForceRow>();
  for (const unit of allocate(required)) {
    const row = rows.get(unit.type.id) ?? {
      type: unit.type.id,
      name: unit.type.name,
      present: 0,
      required: 0,
    };
    row.required++;
    if (
      Object.entries(unit.skills).every(
        ([key, n]) => (remaining[key] ?? 0) >= n,
      )
    ) {
      row.present++;
      for (const [key, n] of Object.entries(unit.skills)) remaining[key] -= n;
    }
    rows.set(unit.type.id, row);
  }
  return [...rows.values()];
}
export function openForceLabels(required: Skills, available: Skills = {}) {
  return Object.entries(required)
    .filter(([key, n]) => n > (available[key] ?? 0))
    .map(([key, n]) =>
      key === "fire"
        ? `Fahrzeug mit geeignetem Löschmittel benötigt (${n - (available[key] ?? 0)} Fähigkeitseinheit${n - (available[key] ?? 0) === 1 ? "" : "en"}).`
        : `${capabilities[key] || key}: ${n - (available[key] ?? 0)} Fähigkeitseinheit${n - (available[key] ?? 0) === 1 ? "" : "en"} benötigt.`,
    );
}
