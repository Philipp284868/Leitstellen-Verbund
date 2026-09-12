import type { Save } from "../shared/model";
import type { Template } from "../shared/catalog";
import { sample } from "./random";
import { weatherWeight } from "./weather";
import {
  situationCategoryWeight,
  situationTemplateWeight,
} from "./world-situation";

export const INCIDENT_MIX = {
  technical: 50,
  fire: 18,
  medical: 24,
  police: 5,
  water: 2,
  other: 1,
} as const;
export type IncidentCategory = keyof typeof INCIDENT_MIX;
export const EXCEPTIONAL_INCIDENT_CHANCE = 0.01;
/** Simulation policy, not a claim about German incident statistics. */
export function incidentCategory(t: Template): IncidentCategory {
  const family = t.profile?.family;
  if (t.profile?.fire || family?.includes("fire") || family === "vegetation")
    return "fire";
  if (family === "medical") return "medical";
  if (family === "police" || family === "crowd") return "police";
  if (family === "water-rescue") return "water";
  if (family) return "technical";
  if (t.requirements.fire) return "fire";
  if (t.org === "Rettungsdienst") return "medical";
  if (t.org === "Polizei") return "police";
  if (t.org === "Wasserrettung") return "water";
  if (["Feuerwehr", "THW", "Infrastruktur"].includes(t.org)) return "technical";
  return "other";
}
export const exceptionalIncident = (t: Template) =>
  !!t.profile?.major ||
  (incidentCategory(t) === "fire" && (t.profile?.severity ?? 0) >= 3) ||
  [
    "factory",
    "warehouse",
    "forest",
    "rail",
    "bus",
    "collapse",
    "flood",
  ].includes(t.id);

function weighted<T>(
  values: readonly T[],
  weight: (v: T) => number,
  draw: number,
): T {
  const total = values.reduce((n, v) => n + weight(v), 0);
  let remaining = Math.min(1 - Number.EPSILON, Math.max(0, draw)) * total;
  for (const value of values) {
    remaining -= weight(value);
    if (remaining < 0) return value;
  }
  return values.at(-1)!;
}
/** Category first; adding variants cannot increase a category's probability.
 * Weather/time affect suitable templates only, never multiply category weights. */
export function chooseIncidentTemplate(
  s: Save,
  candidates: readonly Template[],
  categoryDraw = sample(s.seed, "incident-category"),
  templateDraw = sample(s.seed, "incident-template"),
): Template {
  if (!candidates.length) throw Error("Keine geeignete Einsatzvorlage.");
  const distinct = [...new Map(candidates.map((t) => [t.id, t])).values()];
  const ordinary = distinct.filter((t) => !exceptionalIncident(t));
  const rare = distinct.filter(exceptionalIncident);
  // A separate 1% gate prevents a large exceptional catalog from becoming normal load.
  const pool =
    rare.length &&
    sample(s.seed, "incident-exceptional") < EXCEPTIONAL_INCIDENT_CHANCE
      ? rare
      : ordinary.length
        ? ordinary
        : distinct;
  const categories = (Object.keys(INCIDENT_MIX) as IncidentCategory[]).filter(
    (k) => pool.some((t) => incidentCategory(t) === k),
  );
  const category = weighted(
    categories,
    (k) => INCIDENT_MIX[k] * situationCategoryWeight(s, k),
    categoryDraw,
  );
  return weighted(
    pool
      .filter((t) => incidentCategory(t) === category)
      .sort((a, b) => a.id.localeCompare(b.id)),
    (t) =>
      Math.min(
        6,
        Math.max(1, weatherWeight(s, t.id)) * situationTemplateWeight(s, t),
      ),
    templateDraw,
  );
}
