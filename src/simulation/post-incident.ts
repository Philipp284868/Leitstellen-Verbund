import type { Save, Vehicle } from "../model";
import { bt, vt } from "../catalog";
import { record } from "./events";
import { setFms } from "./fms";
import { sample } from "./random";

const names = {
  cleaning: "Reinigung läuft.",
  disinfection: "Desinfektion läuft.",
  refill: "Material wird aufgefüllt.",
  maintenance: "Wartung läuft.",
};
export function postIncidentReason(v: Vehicle) {
  const task = v.postIncident?.tasks[v.postIncident.current];
  return task ? names[task.kind] : "Nachbereitung läuft.";
}
function log(s: Save, v: Vehicle, type: string, text: string) {
  const m = [...s.missions, ...s.archive].find(
    (m) => m.id === v.postIncident?.mission,
  );
  if (m) record(s, m, type, `${v.name}: ${text}`, "server", v.id);
}
/** Capture work before recall clears the assignment. No work is invented for cancelled approaches. */
export function queuePostIncident(s: Save, v: Vehicle) {
  if (
    v.postIncident ||
    bt(vt(v.type).home).org !== "Rettungsdienst" ||
    !["scene", "transport"].includes(v.status)
  )
    return;
  const m =
    s.missions.find((m) => m.id === v.mission) ??
    s.archive.find((m) => m.id === v.mission);
  const seed = m?.dynamics?.random ?? s.seed;
  const contaminated =
    m?.dynamics?.hazards.some(
      (h) => h.kind === "hazmat" || h.kind === "smoke",
    ) ?? false;
  const tasks: NonNullable<Vehicle["postIncident"]>["tasks"] = [
    {
      kind: "cleaning",
      seconds: 60 + Math.floor(sample(seed, `clean:${v.id}`, 0) * 61),
    },
    {
      kind: "refill",
      seconds: 60 + Math.floor(sample(seed, `refill:${v.id}`, 0) * 61),
    },
  ];
  if (contaminated || v.patients > 0)
    tasks.unshift({ kind: "disinfection", seconds: contaminated ? 240 : 120 });
  v.postIncident = {
    mission: m?.id ?? "",
    queuedAt: s.time,
    tasks,
    current: 0,
  };
  log(s, v, "POST_INCIDENT_PLANNED", "Nachbereitung nach Rückkehr vorgesehen.");
}
export function startPostIncident(s: Save, v: Vehicle) {
  if (!v.postIncident || v.postIncident.startedAt !== undefined) return;
  v.postIncident.startedAt = s.time;
  v.postIncident.until = s.time + v.postIncident.tasks[0].seconds;
  setFms(s, v, 6, "server", postIncidentReason(v));
  log(s, v, "POST_INCIDENT_STARTED", postIncidentReason(v));
}
export function postIncidentTick(s: Save, v: Vehicle) {
  // Recover a persisted station arrival whose pending work has not started yet.
  // The pending work already blocks disposition, so there is no free availability window.
  if (v.status === "ready" && v.postIncident?.startedAt === undefined)
    startPostIncident(s, v);
  const work = v.postIncident;
  if (!work || work.startedAt === undefined || work.until === undefined) return;
  while (s.time >= work.until) {
    log(
      s,
      v,
      "POST_INCIDENT_TASK_COMPLETED",
      postIncidentReason(v).replace("läuft.", "abgeschlossen."),
    );
    if (work.current + 1 >= work.tasks.length) {
      log(
        s,
        v,
        "VEHICLE_READY",
        "Nachbereitung abgeschlossen; wieder einsatzbereit.",
      );
      delete v.postIncident;
      setFms(s, v, 2, "server", "Nachbereitung abgeschlossen");
      return;
    }
    work.current++;
    work.until += work.tasks[work.current].seconds;
    log(s, v, "POST_INCIDENT_STARTED", postIncidentReason(v));
  }
}
