import type { Mission, Vehicle } from "../model";
import { vt, type Skills } from "../catalog";
import type { SectionKind } from "./major-schema";
export const sectionSkills: Record<SectionKind, string[]> = {
  command: ["command"],
  fire: ["fire", "air", "hazmat", "foam", "measure", "decon"],
  rescue: ["rescue", "ladder", "diver", "boat"],
  water: ["water", "pump"],
  medical: [
    "medical",
    "doctor",
    "transport",
    "flight",
    "intensive",
    "medicalCommand",
    "care",
  ],
  security: ["police", "crowd"],
  technical: ["technical", "rescue", "pump", "power", "lighting"],
  logistics: ["logistics", "command", "power", "lighting"],
  evacuation: ["rescue", "police", "crowd", "logistics", "care"],
  staging: [],
};
export function placement(m: Mission, v: Vehicle): SectionKind {
  return (
    m.major?.placements.find(
      (p) => p.vehicle === v.id && p.assignment === v.assignment,
    )?.section ?? "staging"
  );
}
export function responseCrewAvailable(m: Mission | undefined, v: Vehicle) {
  if (m?.dynamics?.responders) {
    const boarded = v.turnout
      ? new Set(
          v.turnout.arrivals.filter((a) => a.boarded).map((a) => a.person),
        )
      : undefined;
    const crew = m.dynamics.responders.filter(
      (r) =>
        r.vehicle === v.id &&
        (!r.assignment || r.assignment === v.assignment) &&
        (!boarded || boarded.has(r.person)),
    );
    const lost = crew.filter(
      (r) => !["NORMAL", "BELASTET", "GEFÄHRDET"].includes(r.state),
    ).length;
    if (lost) {
      const minimum =
        v.turnout?.minimum ?? vt(v.type).crewMinimum ?? vt(v.type).crew;
      const aboard =
        v.turnout?.arrivals.filter((a) => a.boarded).length || crew.length;
      if (aboard - lost < minimum) return false;
    }
  }
  return true;
}
export function effectiveSkills(m: Mission | undefined, v: Vehicle): Skills {
  if (!responseCrewAvailable(m, v)) return {};
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
