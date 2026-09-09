import { vehiclePosition } from "../vehicle-position";
import type { Save, Vehicle } from "../model";
import { beginTrip, recall } from "../engine";
import { setFms, operativeCode } from "./fms";
import { request } from "./incidents";
import { record } from "./events";
import { sample, DYNAMICS } from "./random";
import { newPatient } from "./patients";
import { injureResponder, injuryReason } from "./responder-recovery";
export const faultNames = {
  engine: "Motorschaden",
  tire: "Reifenproblem",
  technical: "Technische Störung",
  radio: "Funkstörung",
  equipment: "Ausrüstungsdefekt",
  energy: "Tank-/Ladeproblem",
  accident: "Unfall des Einsatzfahrzeugs",
};
export function breakVehicle(
  s: Save,
  v: Vehicle,
  kind: keyof typeof faultNames,
) {
  if (
    (v.fault && v.fault.state !== "repaired") ||
    !["travel", "scene", "transport"].includes(v.status)
  )
    return;
  const position =
    v.status === "scene" ? v.path.at(-1)! : vehiclePosition(v, s.time);
  v.fault = {
    kind,
    since: s.time,
    repairAt: 0,
    state: "awaiting",
    mission: v.mission || "",
    assignment: v.assignment || "",
    position,
  };
  v.path = [position];
  v.depart = s.time;
  v.arrive = s.time;
  const m = s.missions.find((m) => m.id === v.mission);
  if (m?.control) {
    const person = s.people.find(
      (p) =>
        p.vehicle === v.id &&
        !injuryReason(s, p) &&
        (!v.turnout ||
          v.turnout.arrivals.some((a) => a.person === p.id && a.boarded)),
    );
    // Injuries belong to this incident only when the accident happened at its scene.
    // A vehicle immobilized en route never teleports casualties to the original address.
    if (
      kind === "accident" &&
      v.status === "scene" &&
      m.dynamics?.active &&
      person &&
      m.dynamics.patients.length < 30
    ) {
      const p = newPatient(
        s,
        m,
        "Verletzung nach Unfall eines Einsatzfahrzeugs",
        true,
      );
      p.health = 45;
      p.condition = "deteriorating";
      p.consciousness = "eingetrübt";
      p.pulse = 124;
      p.breathing = 27;
      p.systolic = 97;
      p.oxygen = 83;
      p.priority = "urgent";
      m.dynamics.patients.push(p);
      m.dynamics.extra.medical = Math.max(m.dynamics.extra.medical || 0, 2);
      m.dynamics.extra.transport = Math.max(m.dynamics.extra.transport || 0, 1);
      m.dynamics.aftermath = 0;
      if (person) {
        injureResponder(s, m, person.id, p);
        m.dynamics.responders ??= [];
        const prior = m.dynamics.responders.find(
          (r) =>
            r.person === person.id &&
            (!r.assignment || r.assignment === v.assignment),
        );
        if (prior) {
          prior.state = "VERLETZT";
          prior.patient = p.id;
          prior.since = s.time;
        } else
          m.dynamics.responders.push({
            person: person.id,
            vehicle: v.id,
            ...(v.assignment ? { assignment: v.assignment } : {}),
            state: "VERLETZT",
            since: s.time,
            patient: p.id,
          });
      }
    }
    record(
      s,
      m,
      "VEHICLE_BREAKDOWN",
      `${v.name}: ${faultNames[kind]}. Nicht einsatzbereit; Ersatzkraft disponieren und Reparatur beauftragen.`,
      "server",
      v.id,
    );
    request(
      s,
      m,
      v.id,
      "request",
      `${v.name} ausgefallen (${faultNames[kind]}). Ersatzfahrzeug erforderlich.`,
      v.patients ? "NOTFALL" : "DRINGEND",
    );
  }
  setFms(s, v, 6, "server", faultNames[kind]);
}
export function repairVehicle(s: Save, v: Vehicle, actor: string) {
  if (!v.fault || v.fault.state === "repaired")
    throw Error("Kein reparierbarer Fahrzeugdefekt.");
  if (v.fault.state === "repairing") return;
  v.fault.state = "repairing";
  v.fault.repairAt = s.time + (v.fault.kind === "engine" ? 180 : 120);
  const m = [...s.missions, ...s.archive].find(
    (m) => m.id === v.fault!.mission,
  );
  if (m)
    record(
      s,
      m,
      "REPAIR_ORDERED",
      `${v.name}: mobiler Reparaturdienst beauftragt.`,
      actor,
      v.id,
    );
}
export function faultsTick(s: Save, v: Vehicle, remoteDynamic = false) {
  if (v.fault && v.fault.state !== "repaired") {
    if (v.fault.state !== "repairing" || v.fault.repairAt > s.time) return;
    v.fault.state = "repaired";
    if (v.journey) {
      delete v.journey.motion;
      delete v.journey.motionVersion;
    }
    const m = s.missions.find((m) => m.id === v.mission);
    if (m)
      record(
        s,
        m,
        "VEHICLE_REPAIRED",
        `${v.name}: Reparatur abgeschlossen.`,
        "server",
        v.id,
      );
    if (!m && !v.mission?.startsWith("remote:") && !v.patients) recall(s, v);
    else if (v.status !== "scene")
      beginTrip(s, v, v.journey?.target || m?.pos || v.path.at(-1)!, v.status);
    setFms(s, v, operativeCode(v), "server", "Reparatur abgeschlossen");
    return;
  }
  const j = v.journey;
  if (
    !remoteDynamic &&
    !s.missions.some((m) => m.id === v.mission && m.dynamics?.active)
  )
    return;
  if (!j || !["travel", "scene", "transport"].includes(v.status)) return;
  // One draw per minute and assignment, not per browser/tick. Repairs never reroll an old minute.
  const bucket = Math.floor(s.time / 60),
    key = `fault-check-${bucket}`;
  if (j.events.includes(key)) return;
  j.events = [
    ...j.events.filter((e) => !e.startsWith("fault-check-")),
    key,
  ].slice(-60);
  if (
    sample(s.seed, `fault-${v.id}-${v.assignment}`, bucket) >=
    DYNAMICS.defectChance
  )
    return;
  // Existing incidents retain the previous draw mapping when a catalog is upgraded.
  const profiled = s.missions.some(
    (m) => m.id === v.mission && m.dynamics?.scenario,
  );
  const kinds = (Object.keys(faultNames) as (keyof typeof faultNames)[]).filter(
    (kind) => kind !== "accident" || profiled,
  );
  breakVehicle(
    s,
    v,
    kinds[
      Math.floor(sample(s.seed, `fault-kind-${v.id}`, bucket) * kinds.length)
    ],
  );
}
