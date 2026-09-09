import type { Save, Vehicle } from "../model";
import { bt, vt } from "../catalog";
import { record, simId } from "./events";
export const fmsDefaults = [
  "Dringender Sprechwunsch",
  "Einsatzbereit über Funk",
  "Einsatzbereit auf Wache",
  "Einsatz übernommen / Anfahrt",
  "An Einsatzstelle",
  "Sprechwunsch",
  "Nicht einsatzbereit",
  "Patiententransport / einsatzgebunden",
  "Zielort erreicht / bedingt verfügbar",
  "Quittung / Anmeldung",
];
export const alarmNames = {
  dme: "Nur DME",
  siren: "DME + Sirene",
  station: "Wachalarm",
};
export const operativeCode = (v: Vehicle) =>
  v.postIncident
    ? 6
    : { ready: 2, alarmed: 9, travel: 3, scene: 4, transport: 7, return: 1 }[
        v.status
      ];
export function fmsName(s: Save, v: Vehicle, code: number) {
  return (s.desk.definitions[bt(vt(v.type).home).org] ??
    s.desk.definitions.Alle ??
    fmsDefaults)[code];
}
export function setFms(
  s: Save,
  v: Vehicle,
  code: number,
  actor = "server",
  reason = "Automatischer Statuswechsel",
) {
  const f = (s.desk.fleet[v.id] ??= {
    code: operativeCode(v),
    changed: s.time,
    operative: v.status,
    channel: bt(vt(v.type).home).org,
    history: [],
  });
  if ((v.fault && v.fault.state !== "repaired") || v.postIncident) code = 6;
  if (f.code === code && f.history.length) {
    f.operative = v.status;
    return;
  }

  f.code = code;
  f.changed = s.time;
  f.operative = v.status;
  f.history.push({
    id: simId(s),
    at: s.time,
    type: "FMS_CHANGED",
    text: `FMS ${code}: ${fmsName(s, v, code)} · ${reason}`,
    actor,
    vehicle: v.id,
  });
  f.history = f.history.slice(-2000);
  const m = [...s.missions, ...s.archive].find((m) => m.id === v.mission);
  if (m)
    record(
      s,
      m,
      "FMS_CHANGED",
      `FMS ${code}: ${fmsName(s, v, code)} · ${reason}`,
      actor,
      v.id,
    );
}
export function syncFms(s: Save) {
  for (const v of s.vehicles) {
    const f = s.desk.fleet[v.id];
    if (!f || f.operative !== v.status) setFms(s, v, operativeCode(v));
  }
  for (const id of Object.keys(s.desk.fleet))
    if (!s.vehicles.some((v) => v.id === id)) delete s.desk.fleet[id];
}
