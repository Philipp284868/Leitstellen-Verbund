import type { Mission } from "./model";
import { mt } from "./catalog";

export type IncidentKind =
  | "unknown"
  | "fire"
  | "medical"
  | "technical"
  | "police"
  | "water"
  | "other"
  | "mixed";
export const incidentColors: Record<IncidentKind, string> = {
  unknown: "#647989",
  fire: "#b64436",
  medical: "#25845f",
  technical: "#9b7736",
  police: "#2c73a0",
  water: "#237e96",
  other: "#655b89",
  mixed: "#647989",
};
export const incidentKindNames: Record<IncidentKind, string> = {
  unknown: "Ungeklärter Notruf",
  fire: "Brand",
  medical: "Medizinischer Notfall",
  technical: "Technische Hilfe",
  police: "Polizei",
  water: "Wasserrettung",
  other: "Weitere Hilfe",
  mixed: "Verschiedene Einsatzarten",
};

/** Reads only established desk knowledge, even if accidentally given an internal mission. */
export function missionPresentation(m: Mission) {
  const c = m.control;
  const confirmed = !c || c.briefed || c.legacy;
  const id = confirmed ? m.template : c.reportedTemplate || "incoming";
  const t = mt(id);
  const known = id !== "incoming";
  const category: IncidentKind = !known
    ? "unknown"
    : t.org === "Rettungsdienst"
      ? "medical"
      : t.requirements.fire || t.profile?.fire || id === "bma"
        ? "fire"
        : t.org === "Polizei"
          ? "police"
          : t.org === "Wasserrettung"
            ? "water"
            : t.org === "Feuerwehr" || t.org === "THW"
              ? "technical"
              : "other";
  const categories: IncidentKind[] = [category];
  if (
    confirmed &&
    category !== "medical" &&
    m.dynamics?.patients.some((p) => p.condition !== "dead")
  )
    categories.push("medical");
  return {
    id,
    name: t.name,
    org: t.org,
    category,
    categories,
    color: incidentColors[category],
    known,
    confirmed,
  };
}

/** Public display of completed work, not a claim that the whole incident can close. */
export function missionProgress(m: Mission) {
  if (!missionPresentation(m).confirmed) return null;
  if (m.tasks) {
    const completed = m.tasks.entries.filter((task) => task.done).length,
      total = m.tasks.entries.length;
    return {
      value: completed,
      max: Math.max(1, total),
      label: `Erledigte Einsatzaufgaben · ${completed}/${total}`,
    };
  }
  return {
    value: m.progress,
    max: mt(m.template).seconds,
    label: "Einsatzfortschritt",
  };
}
