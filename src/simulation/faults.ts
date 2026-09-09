import { vehiclePosition } from "../vehicle-position";
import type { Save, Vehicle } from "../model";
import { beginTrip, recall } from "../engine";
import { setFms, operativeCode } from "./fms";
import { request } from "./incidents";
import { record } from "./events";
import { sample, DYNAMICS } from "./random";
import { newPatient } from "./patients";
import { injureResponder, injuryReason } from "./responder-recovery";
import { FAULT_SECONDS, FAULT_RECOVERY_GRACE } from "./fault-config";
import { crewSummary } from "./staffing";
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
    !["ready", "travel", "scene", "transport", "return"].includes(v.status)
  )
    return;
  const position =
    v.status === "scene" ? v.path.at(-1)! : vehiclePosition(v, s.time);
  v.fault = {
    kind,
    since: s.time,
    repairAt: s.time + FAULT_SECONDS[kind],
    state: "repairing",
    mission: v.mission || "",
    assignment: v.assignment || "",
    position,
  };
  v.path = [position];
  // Retain the old movement epoch: fault.since identifies its exact interrupted phase.
  // Rendering and the engine stop at fault.position until the repair has completed.
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
      `${v.name}: ${faultNames[kind]}. Vorübergehend nicht einsatzbereit; automatische Behebung in ${FAULT_SECONDS[kind]} s.`,
      "server",
      v.id,
    );
    request(
      s,
      m,
      v.id,
      "request",
      `${v.name} ausgefallen (${faultNames[kind]}). Automatische Behebung läuft; bei Bedarf Ersatzfahrzeug disponieren.`,
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
  // Compatibility with old manual repair actions: idempotent and never extends an interruption.
  v.fault.repairAt = v.fault.since + FAULT_SECONDS[v.fault.kind];
  const m = [...s.missions, ...s.archive].find(
    (m) => m.id === v.fault!.mission,
  );
  if (m)
    record(
      s,
      m,
      "REPAIR_ORDERED",
      `${v.name}: automatische Störungsbehebung gestartet.`,
      actor,
      v.id,
    );
}
export function faultsTick(s: Save, v: Vehicle, remoteDynamic = false) {
  if (v.fault && v.fault.state !== "repaired") {
    if (v.fault.state === "awaiting") repairVehicle(s, v, "server");
    v.fault.repairAt = Math.min(
      v.fault.repairAt || Infinity,
      v.fault.since + FAULT_SECONDS[v.fault.kind],
    );
    if (v.fault.repairAt > s.time + 1e-6) return;
    const m = s.missions.find((m) => m.id === v.mission);
    if (v.status !== "ready" && v.status !== "scene") {
      // Keep the active fault during route planning so the current position and zero speed
      // come from the interruption, while traffic.ts retains its directed road remainder.
      const target =
        v.status === "return"
          ? s.buildings.find((b) => b.id === v.home)!.pos
          : v.journey?.target || m?.pos || v.path.at(-1)!;
      beginTrip(s, v, target, v.status, v.journey?.mode);
    }
    v.fault.state = "repaired";
    if (m)
      record(
        s,
        m,
        "VEHICLE_REPAIRED",
        `${v.name}: Reparatur abgeschlossen.`,
        "server",
        v.id,
      );
    if (
      v.status !== "ready" &&
      v.status !== "return" &&
      !m &&
      !v.mission?.startsWith("remote:") &&
      !v.patients
    )
      recall(s, v);
    const crew = crewSummary(s, v);
    setFms(
      s,
      v,
      crew.eligible < crew.required ? 6 : operativeCode(v),
      "server",
      crew.eligible < crew.required
        ? "Störung behoben; Besatzung noch nicht einsatzbereit"
        : "Reparatur abgeschlossen",
    );
    return;
  }
  if (v.fault && s.time < v.fault.repairAt + FAULT_RECOVERY_GRACE) return;
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
