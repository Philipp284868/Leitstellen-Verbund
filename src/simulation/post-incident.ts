import type { Save, Vehicle } from "../shared/model";
import { vt } from "../shared/catalog";
import { record } from "./events";
import { setFms } from "./fms";

/** Real transport work, deliberately short and independent of organization labels. */
export const POST_INCIDENT_SECONDS = {
  cleaning: 30,
  disinfection: 45,
  contaminated: 75,
  refill: 30,
} as const;

const names = {
  cleaning: "Reinigung läuft.",
  disinfection: "Desinfektion läuft.",
  refill: "Material wird aufgefüllt.",
  maintenance: "Wartung läuft.",
};
const pendingNames = {
  cleaning: "Reinigung nach Rückkehr erforderlich.",
  disinfection: "Desinfektion nach Rückkehr erforderlich.",
  refill: "Materialauffüllung nach Rückkehr erforderlich.",
  maintenance: "Wartung nach Rückkehr erforderlich.",
};
export function postIncidentReason(v: Vehicle) {
  const task = v.postIncident?.tasks[v.postIncident.current];
  return task
    ? (v.postIncident?.startedAt === undefined ? pendingNames : names)[
        task.kind
      ]
    : "Nachbereitung läuft.";
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
    !(vt(v.type).skills.transport > 0) ||
    v.status !== "transport" ||
    v.patients <= 0
  )
    return;
  const m =
    s.missions.find((m) => m.id === v.mission) ??
    s.archive.find((m) => m.id === v.mission);
  const contaminated =
    m?.dynamics?.hazards.some(
      (h) => h.kind === "hazmat" || h.kind === "contamination",
    ) ?? false;
  const tasks: NonNullable<Vehicle["postIncident"]>["tasks"] = [
    {
      kind: "cleaning",
      seconds: POST_INCIDENT_SECONDS.cleaning,
    },
    {
      kind: "refill",
      seconds: POST_INCIDENT_SECONDS.refill,
    },
  ];
  tasks.unshift({
    kind: "disinfection",
    seconds: contaminated
      ? POST_INCIDENT_SECONDS.contaminated
      : POST_INCIDENT_SECONDS.disinfection,
  });
  v.postIncident = {
    mission: m?.id ?? "",
    queuedAt: s.time,
    tasks,
    current: 0,
  };
  log(s, v, "POST_INCIDENT_PLANNED", "Nachbereitung nach Rückkehr vorgesehen.");
}
export function startPostIncident(s: Save, v: Vehicle) {
  if (
    v.status !== "ready" ||
    !v.postIncident ||
    v.postIncident.startedAt !== undefined
  )
    return;
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
