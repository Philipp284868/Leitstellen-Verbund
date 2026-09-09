import type { Mission, Vehicle } from "../model";
import { vt, type Skills } from "../catalog";
import type { SectionKind } from "./major-schema";
import { taskRequirements } from "./mission-tasks";
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
  if (
    (v.fault && v.fault.state !== "repaired") ||
    v.postIncident ||
    !responseCrewAvailable(m, v)
  )
    return {};
  if (!m?.major) return vt(v.type).skills;
  const section = placement(m, v);
  if (!m.major.sections.some((s) => s.kind === section && s.ordered)) return {};
  return Object.fromEntries(
    Object.entries(vt(v.type).skills).filter(([k]) =>
      sectionSkills[section].includes(k),
    ),
  );
}
/** Capability coverage is a planning fact; actual simultaneous crew work is limited. */
export function workingSkills(m: Mission, v: Vehicle): Skills {
  const capabilities = effectiveSkills(m, v);
  if (m.major || !m.dynamics?.active || !m.tasks) return capabilities;
  // One crew cannot fight a fire and perform technical rescue independently
  // at the same instant. Compatible tools (e.g. pump + extinguishing water)
  // remain available together. Completed work releases this crew's next task.
  const open = taskRequirements(m);
  for (const hazard of m.dynamics.hazards)
    if (!hazard.resolved)
      open[hazard.skill] = Math.max(open[hazard.skill] || 0, hazard.required);
  const groups = [
    ["fire", "water", "foam", "air", "hazmat", "measure", "decon"],
    [
      "rescue",
      "technical",
      "ladder",
      "diver",
      "boat",
      "pump",
      "power",
      "lighting",
    ],
    [
      "medical",
      "doctor",
      "transport",
      "intensive",
      "medicalCommand",
      "care",
      "flight",
    ],
    ["police", "crowd"],
    ["command", "logistics"],
  ];
  if (m.dynamics.tactic === "rescue")
    [groups[0], groups[1]] = [groups[1], groups[0]];
  const active = groups.find((group) =>
    group.some((key) => open[key] && capabilities[key]),
  );
  return active
    ? Object.fromEntries(
        Object.entries(capabilities).filter(([key]) => active.includes(key)),
      )
    : capabilities;
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
