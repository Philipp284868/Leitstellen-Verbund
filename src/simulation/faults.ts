import type { Save, Vehicle } from "../model";
import { along } from "../world";
import { beginTrip, recall } from "../engine";
import { setFms, operativeCode } from "./fms";
import { request } from "./incidents";
import { record } from "./events";
import { sample, DYNAMICS } from "./random";
export const faultNames = {
  engine: "Motorschaden",
  tire: "Reifenproblem",
  technical: "Technische Störung",
  radio: "Funkstörung",
  equipment: "Ausrüstungsdefekt",
  energy: "Tank-/Ladeproblem",
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
    v.status === "scene"
      ? v.path.at(-1)!
      : along(v.path, (s.time - v.depart) / Math.max(1, v.arrive - v.depart));
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
export function faultsTick(s: Save, v: Vehicle) {
  if (v.fault && v.fault.state !== "repaired") {
    if (v.fault.state !== "repairing" || v.fault.repairAt > s.time) return;
    v.fault.state = "repaired";
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
    if (!m && !v.patients) recall(s, v);
    else if (v.status !== "scene")
      beginTrip(s, v, v.journey?.target || m!.pos, v.status);
    setFms(s, v, operativeCode(v), "server", "Reparatur abgeschlossen");
    return;
  }
  const j = v.journey;
  if (!s.missions.some((m) => m.id === v.mission && m.dynamics?.active)) return;
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
  const kinds = Object.keys(faultNames) as (keyof typeof faultNames)[];
  breakVehicle(
    s,
    v,
    kinds[
      Math.floor(sample(s.seed, `fault-kind-${v.id}`, bucket) * kinds.length)
    ],
  );
}
