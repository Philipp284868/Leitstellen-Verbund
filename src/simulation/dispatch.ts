import type { Save, Mission } from "../model";
import { bt, vt, mt, capabilities } from "../catalog";
import { readiness, beginTrip } from "../engine";
import { length, route } from "../world";
import { record, simId } from "./events";
import { setFms, alarmNames } from "./fms";
import type { AAO, Alarm, Priority } from "./schema";
export function dispatchable(m: Mission) {
  if (m.control && (!m.control.locationKnown || !m.control.reportedTemplate))
    throw Error("Für die Disposition müssen Ort und Meldebild bekannt sein.");
}
export function propose(s: Save, m: Mission, aao: AAO, actor: string) {
  dispatchable(m);
  const candidates = s.vehicles
    .filter(
      (v) =>
        !readiness(s, v) &&
        (aao.org === "Alle" || bt(vt(v.type).home).org === aao.org),
    )
    .map((v) => {
      try {
        return {
          v,
          eta:
            (length(route(v.path.at(-1)!, m.pos, vt(v.type).mode)) * 12) /
            (vt(v.type).speed / 3.6),
        };
      } catch {
        return { v, eta: Infinity };
      }
    })
    .filter((x) => Number.isFinite(x.eta))
    .sort((a, b) => a.eta - b.eta || a.v.id.localeCompare(b.v.id));
  const chosen: string[] = [],
    deficit: string[] = [];
  for (const type of aao.types) {
    const match = candidates.find(
      (x) => x.v.type === type && !chosen.includes(x.v.id),
    );
    if (match) chosen.push(match.v.id);
    else deficit.push(`Fehlt: ${vt(type).name}`);
  }
  const required = {
    ...mt(m.control?.reportedTemplate || m.template).requirements,
  };
  for (const [k, n] of Object.entries(aao.skills))
    required[k] = Math.max(required[k] || 0, n);
  const skills: Record<string, number> = {};
  for (const v of s.vehicles.filter(
    (v) =>
      chosen.includes(v.id) || (v.mission === m.id && v.status === "scene"),
  ))
    for (const [k, n] of Object.entries(vt(v.type).skills))
      skills[k] = (skills[k] || 0) + n;
  for (const [k, n] of Object.entries(required))
    if ((skills[k] || 0) < n)
      deficit.push(`${capabilities[k] || k}: ${n - (skills[k] || 0)} fehlen`);
  m.control!.proposal = {
    id: simId(s),
    aao: aao.id,
    vehicles: chosen,
    missing: deficit,
    at: s.time,
  };
  record(
    s,
    m,
    "AAO_PROPOSED",
    `AAO ${aao.name}: ${chosen.length} Fahrzeuge vorgeschlagen; ${deficit.join("; ") || "Anforderungen erfüllt"}.`,
    actor,
  );
}
export function alarm(
  s: Save,
  m: Mission,
  ids: string[],
  actor: string,
  priority: Priority = "NORMAL",
  profile?: Alarm,
) {
  dispatchable(m);
  const vehicles = [...new Set(ids)].map((id) => {
    const v = s.vehicles.find((v) => v.id === id);
    if (!v) throw Error("Eigenes Fahrzeug fehlt.");
    const reason = readiness(s, v);
    if (reason) throw Error(`${v.name}: ${reason}`);
    // Validate every route before binding any vehicle.
    route(v.path.at(-1)!, m.pos, vt(v.type).mode);
    return v;
  });
  if (!vehicles.length) throw Error("Mindestens ein Fahrzeug auswählen.");
  for (const v of vehicles) {
    const selected = profile ?? s.desk.alarms[v.home] ?? "dme";
    const delay = selected === "station" ? 30 : selected === "siren" ? 45 : 60;
    v.mission = m.id;
    v.assignment = simId(s);
    beginTrip(s, v, m.pos, "travel");
    v.depart += delay;
    v.arrive += delay;
    v.status = "alarmed";
    const event = record(
      s,
      m,
      "ALARM_STARTED",
      `${v.name}: ${alarmNames[selected]} · ${priority} · Ausrücken in ${delay} s.`,
      actor,
      v.id,
    );
    if (event) event.alarm = selected;
    setFms(s, v, 9, actor, "Alarmierung quittiert");
  }
  if (m.control) {
    m.control.priority = priority;
    delete m.control.proposal;
  }
  if (m.control && ["disposition", "interview"].includes(m.control.stage))
    m.control.stage = "alarming";
  s.tutorial = Math.max(4, s.tutorial);
}
