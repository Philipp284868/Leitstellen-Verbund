import type { Mission, Save, Vehicle } from "../shared/model";
import type { Skills } from "../shared/catalog";
import { recall } from "../shared/engine";
import { requirements } from "./hazards";
import { effectiveSkills, placement } from "./major-resources";
import { sectionNames } from "./major-schema";
import { ensureMissionTasks } from "./mission-tasks";
import { openForceLabels } from "./force-plan";
import { record } from "./events";

export type WithdrawalAssessment = {
  allowed: boolean;
  reasons: string[];
  required: Skills;
  remaining: Skills;
};
function sceneUnits(s: Save, m: Mission, remoteUnits: readonly Vehicle[]) {
  return [
    ...s.vehicles.filter((v) => v.mission === m.id),
    ...remoteUnits,
  ].filter((v) => v.status === "scene" && v.arrive <= s.time);
}
/** Build once per immutable snapshot; never reuse across authoritative changes. */
function prepareAssessment(
  s: Save,
  mission: Mission,
  remote: Skills = {},
  remoteUnits: readonly Vehicle[] = [],
  remoteScope = false,
) {
  const m = structuredClone(mission);
  if (m.dynamics?.active) ensureMissionTasks(s, m);
  const required = requirements(m);
  const baseReasons: string[] = [];
  if (!s.missions.some((entry) => entry.id === m.id) || m.phase === "done")
    baseReasons.push("Der Einsatz ist nicht mehr aktiv.");
  if (m.control && !m.control.briefed)
    baseReasons.push(
      "Erste Lagemeldung abwarten; der Kräftebedarf ist noch nicht erkundet.",
    );
  const expectedMission = remoteScope ? `remote:${s.player.id}:${m.id}` : m.id;
  const bound = new Set([
    ...(m.dynamics?.patients
      .filter((p) => p.transport === "aboard")
      .map((p) => p.vehicle) ?? []),
    ...m.transports.filter((t) => t.status === "ordered").map((t) => t.vehicle),
  ]);
  const reasonsByVehicle = new Map<string, string[]>();
  for (const v of remoteScope ? remoteUnits : s.vehicles) {
    const reasons: string[] = [];
    if (
      v.mission !== expectedMission ||
      !["scene", "travel", "alarmed"].includes(v.status)
    ) {
      reasonsByVehicle.set(v.id, [
        `${v.name}: nicht für diesen Einsatz zurückschickbar.`,
      ]);
      continue;
    }
    if ((v.fault && v.fault.state !== "repaired") || v.postIncident)
      reasons.push(
        `${v.name}: Defekt oder Nachbereitung noch nicht abgeschlossen.`,
      );
    if (v.patients > 0 || bound.has(v.id))
      reasons.push(
        `${v.name}: Patienten oder betreute Personen sind noch gebunden.`,
      );
    reasonsByVehicle.set(v.id, reasons);
  }
  // remote is the already verified aggregate; remoteUnits are only needed for
  // section/leader constraints and must not be added a second time.
  const own = sceneUnits(s, m, []);
  const all = sceneUnits(s, m, remoteUnits);
  const skillsByVehicle = new Map(
    all.map((v) => [v.id, effectiveSkills(m, v)]),
  );
  const before = { ...remote };
  const ownTotal: Skills = {};
  for (const v of own)
    for (const [key, amount] of Object.entries(skillsByVehicle.get(v.id)!)) {
      before[key] = (before[key] || 0) + amount;
      ownTotal[key] = (ownTotal[key] || 0) + amount;
    }
  const removable = new Set(
    (remoteScope ? remoteUnits : own)
      .filter((v) => v.status === "scene" && v.arrive <= s.time)
      .map((v) => v.id),
  );
  const protectedCoverage: Skills = {};
  for (const [key, amount] of Object.entries(required))
    protectedCoverage[key] = Math.min(amount, before[key] || 0);
  const sections =
    m.major?.sections
      .filter(
        (section) =>
          !section.done ||
          (section.kind === "evacuation" &&
            m.major!.evacuated < m.major!.evacuees),
      )
      .map((section) => ({
        kind: section.kind,
        contributors: all
          .filter(
            (v) =>
              placement(m, v) === section.kind &&
              Object.values(skillsByVehicle.get(v.id)!).some((n) => n > 0),
          )
          .map((v) => v.id),
        leader: all.find(
          (v) =>
            v.id === section.leader?.vehicle &&
            v.assignment === section.leader?.assignment,
        )?.id,
      })) ?? [];
  return (ids: readonly string[]): WithdrawalAssessment => {
    const selection = new Set(ids),
      reasons = [...baseReasons];
    if (!selection.size) reasons.push("Mindestens ein Fahrzeug auswählen.");
    for (const id of selection)
      reasons.push(
        ...(reasonsByVehicle.get(id) ?? ["Eigenes Einsatzfahrzeug fehlt."]),
      );
    const remaining = { ...before };
    const removed: Skills = {};
    for (const id of selection)
      if (removable.has(id))
        for (const [key, amount] of Object.entries(
          skillsByVehicle.get(id) ?? {},
        )) {
          removed[key] = (removed[key] || 0) + amount;
          remaining[key] = Math.max(
            0,
            (before[key] || 0) -
              Math.min(
                (remoteScope ? remote : ownTotal)[key] || 0,
                removed[key],
              ),
          );
        }
    reasons.push(...openForceLabels(protectedCoverage, remaining));
    for (const section of sections) {
      if (
        section.contributors.length &&
        section.contributors.every((id) => selection.has(id))
      )
        reasons.push(
          `${sectionNames[section.kind]}: letzte zugeordnete Kräfte werden noch benötigt.`,
        );
      if (section.leader && selection.has(section.leader))
        reasons.push(
          `${sectionNames[section.kind]}: Abschnittsleitung zuerst ablösen.`,
        );
    }
    return {
      allowed: reasons.length === 0,
      reasons: [...new Set(reasons)],
      required: { ...required },
      remaining,
    };
  };
}

export function createWithdrawalAssessment(
  s: Save,
  m: Mission,
  remote: Skills = {},
  remoteUnits: readonly Vehicle[] = [],
) {
  return prepareAssessment(s, m, remote, remoteUnits);
}

export function assessWithdrawal(
  s: Save,
  m: Mission,
  ids: readonly string[],
  remote: Skills = {},
  remoteUnits: readonly Vehicle[] = [],
) {
  return prepareAssessment(s, m, remote, remoteUnits)(ids);
}
/** Owner-world validation for a helper's recall; caller must verify helper ownership/authorization. */
export function assessRemoteWithdrawal(
  s: Save,
  m: Mission,
  ids: readonly string[],
  remote: Skills,
  remoteUnits: readonly Vehicle[],
) {
  return prepareAssessment(s, m, remote, remoteUnits, true)(ids);
}

/** Stage every route, status and event on a private copy; commit all or nothing. */
export function withdraw(
  s: Save,
  mission: Mission,
  ids: readonly string[],
  actor: string,
  remote: Skills = {},
  remoteUnits: readonly Vehicle[] = [],
) {
  const assessment = assessWithdrawal(s, mission, ids, remote, remoteUnits);
  if (!assessment.allowed) throw Error(assessment.reasons.join(" "));
  const staged = structuredClone(s);
  const m = staged.missions.find((entry) => entry.id === mission.id)!;
  if (m.dynamics?.active) ensureMissionTasks(staged, m);
  const selection = new Set(ids);
  for (const id of selection)
    recall(staged, staged.vehicles.find((v) => v.id === id)!);
  record(
    staged,
    m,
    "FORCES_WITHDRAWN",
    `${selection.size} Fahrzeug(e) zurückgeschickt; verbleibende offene Aufgaben berücksichtigt.`,
    actor,
  );
  Object.assign(s, staged);
  return assessment;
}
