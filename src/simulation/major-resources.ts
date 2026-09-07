import type { Mission, Vehicle } from "../model";
import { vt, type Skills } from "../catalog";
import type { SectionKind } from "./major-schema";
export const sectionSkills: Record<SectionKind, string[]> = {
  command: ["command"],
  fire: ["fire", "air", "hazmat"],
  rescue: ["rescue", "ladder", "diver", "boat"],
  water: ["water", "pump"],
  medical: ["medical", "doctor", "transport", "flight"],
  security: ["police", "crowd"],
  technical: ["technical", "rescue", "pump"],
  logistics: ["logistics", "command"],
  evacuation: ["rescue", "police", "crowd", "logistics"],
  staging: [],
};
export function placement(m: Mission, v: Vehicle): SectionKind {
  return (
    m.major?.placements.find(
      (p) => p.vehicle === v.id && p.assignment === v.assignment,
    )?.section ?? "staging"
  );
}
export function effectiveSkills(m: Mission | undefined, v: Vehicle): Skills {
  if (!m?.major) return vt(v.type).skills;
  const section = placement(m, v);
  if (!m.major.sections.some((s) => s.kind === section && s.ordered)) return {};
  return Object.fromEntries(
    Object.entries(vt(v.type).skills).filter(([k]) =>
      sectionSkills[section].includes(k),
    ),
  );
}
export function majorComplete(m: Mission) {
  return (
    !m.major ||
    (!m.major.pending?.remaining &&
      m.major.sections.every((s) => s.done) &&
      m.major.evacuated >= m.major.evacuees)
  );
}
export function canTransport(m: Mission, v?: Vehicle) {
  if (!m.major) return m.phase === "transport";
  return m.major.transports && (!v || placement(m, v) === "medical");
}
