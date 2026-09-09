import type { Save, Vehicle } from "../model";
import { vt } from "../catalog";
import { crewSummary } from "./staffing";
import type { Availability } from "./availability-schema";
import { postIncidentReason } from "./post-incident";

/** Derived on the server. FMS is a communication code, never a dispatch lock. */
export function vehicleAvailability(
  s: Save,
  v: Vehicle,
  crew = crewSummary(s, v),
): Availability {
  const result: Availability = {
    state: "UNAVAILABLE",
    alarmable: false,
    dispatchable: false,
    reason: "",
    crewPresent: crew.present,
    crewRequired: crew.required,
    crewCapacity: vt(v.type).crew,
  };
  if (v.fault && v.fault.state !== "repaired") {
    result.state =
      v.fault.state === "repairing" ? "MAINTENANCE" : "UNAVAILABLE";
    result.reason = "Fahrzeugdefekt: automatische Behebung läuft.";
    if (v.fault.repairAt > 0) result.until = v.fault.repairAt;
  } else if (v.patients > 0) {
    result.state = "EN_ROUTE";
    result.reason =
      "Patienten oder transportierte Personen an Bord; Übergabe noch offen.";
    if (v.status === "transport") result.until = v.arrive;
  } else if (v.postIncident) {
    result.state =
      v.postIncident.tasks[v.postIncident.current]?.kind === "maintenance"
        ? "MAINTENANCE"
        : "POST_INCIDENT";
    result.reason = postIncidentReason(v);
    result.until =
      v.postIncident.until ??
      (v.status === "return"
        ? v.arrive +
          v.postIncident.tasks.reduce(
            (seconds, task) => seconds + task.seconds,
            0,
          )
        : undefined);
  } else if (v.status === "alarmed") {
    result.state = "DISPATCHED";
    result.reason =
      crew.present < crew.required
        ? `Alarmiert: Besatzung trifft ein (${crew.present}/${crew.required}).`
        : "Alarmiert: Fahrzeug bereitet das Ausrücken vor.";
    result.until = v.depart;
  } else if (v.status === "travel" || v.status === "transport") {
    result.state = "EN_ROUTE";
    result.reason =
      v.status === "transport"
        ? "Patiententransport läuft."
        : "Auf Anfahrt zum Einsatz.";
    result.until = v.arrive;
  } else if (v.status === "scene") {
    result.state = "ON_SCENE";
    result.reason = "Am Einsatzort gebunden.";
  } else if (s.desk.fleet[v.id]?.code === 6) {
    result.reason = "FMS 6: Fahrzeug nicht einsatzbereit gemeldet.";
  } else {
    const home = s.buildings.find((b) => b.id === v.home);
    if (!home || home.ready > s.time)
      result.reason = "Wache befindet sich im Bau.";
    else if (crew.eligible < crew.required)
      result.reason = `Besatzung fehlt: ${crew.required - crew.eligible} geeignete Kräfte benötigt.`;
    else {
      result.state = v.status === "return" ? "RETURNING" : "AVAILABLE";
      result.alarmable = true;
      result.dispatchable = crew.present >= crew.required;
      result.reason = result.dispatchable
        ? ""
        : "Alarmierbar: Freiwillige Kräfte müssen zuerst zur Wache kommen.";
    }
  }
  return result;
}
export function dispatchReason(s: Save, v: Vehicle) {
  const state = vehicleAvailability(s, v);
  return state.alarmable ? "" : state.reason;
}
