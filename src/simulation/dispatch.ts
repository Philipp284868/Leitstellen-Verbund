import {
  planTurnout,
  turnoutEstimate,
  checkReserveSelection,
  crewAllocator,
} from "./staffing";
import { reportUnit, telemetry } from "./reports";
import { effectiveSkills } from "./major-resources";
import type { Save, Mission } from "../model";
import { bt, vt, mt } from "../catalog";
import { openForceLabels } from "./force-plan";
import { readiness, beginTrip } from "../engine";
import { vehiclePosition } from "../vehicle-position";
import { routePlan } from "./traffic";
import { requirements } from "./hazards";
import type { TravelMode } from "./dynamics-schema";
import { record, simId } from "./events";
import { setFms, alarmNames } from "./fms";
import type { AAO, Alarm, Priority } from "./schema";
export function dispatchable(m: Mission) {
  if (m.location && m.location.state !== "verified")
    throw Error(
      "Einsatzort wird technisch geprüft; noch keine sichere Zufahrt verfügbar.",
    );
  if (m.control && (!m.control.locationKnown || !m.control.reportedTemplate))
    throw Error("Für die Disposition müssen Ort und Meldebild bekannt sein.");
}
export function propose(
  s: Save,
  m: Mission,
  aao: AAO,
  actor: string,
  remote: Record<string, number> = {},
) {
  dispatchable(m);
  const candidates = s.vehicles
    .filter(
      (v) =>
        !readiness(s, v) &&
        (aao.org === "Alle" || bt(vt(v.type).home).org === aao.org),
    )
    .map((v) => {
      try {
        const plan = routePlan(s, v, vehiclePosition(v, s.time), m.pos);
        return {
          v,
          eta: plan.blockedUntil
            ? Infinity
            : plan.seconds + turnoutEstimate(s, v, aao.alarm),
        };
      } catch {
        return { v, eta: Infinity };
      }
    })
    .filter((x) => Number.isFinite(x.eta))
    .sort((a, b) => a.eta - b.eta || a.v.id.localeCompare(b.v.id));
  const chosen: string[] = [],
    deficit: string[] = [],
    allocateCrew = crewAllocator(s);
  for (const type of aao.types) {
    const match = candidates.find(
      (x) => x.v.type === type && !chosen.includes(x.v.id) && allocateCrew(x.v),
    );
    if (match) chosen.push(match.v.id);
    else deficit.push(`Fehlt: ${vt(type).name}`);
  }
  const required = {
    ...(m.control?.briefed
      ? requirements(m)
      : mt(m.control?.reportedTemplate || "incoming").requirements),
  };
  for (const [k, n] of Object.entries(aao.skills))
    required[k] = Math.max(required[k] || 0, n);
  const skills: Record<string, number> = { ...remote };
  for (const v of s.vehicles.filter(
    (v) =>
      chosen.includes(v.id) || (v.mission === m.id && v.status === "scene"),
  ))
    for (const [k, n] of Object.entries(
      chosen.includes(v.id) ? vt(v.type).skills : effectiveSkills(m, v),
    ))
      skills[k] = (skills[k] || 0) + n;
  // Explicit vehicle preferences stay binding. Fill remaining capability gaps
  // from usable, staffed units; no particular vehicle model is a prerequisite.
  const exhausted = new Set<string>();
  while (chosen.length < 30) {
    const ranked = candidates
      .filter(({ v }) => !chosen.includes(v.id) && !exhausted.has(v.id))
      .map((candidate) => ({
        ...candidate,
        contribution: Object.entries(required).reduce(
          (total, [key, amount]) =>
            total +
            Math.min(
              Math.max(0, amount - (skills[key] || 0)),
              vt(candidate.v.type).skills[key] || 0,
            ) /
              Math.max(1, amount),
          0,
        ),
      }))
      .filter((candidate) => candidate.contribution > 0)
      .sort(
        (a, b) =>
          b.contribution - a.contribution ||
          a.eta - b.eta ||
          a.v.id.localeCompare(b.v.id),
      );
    const match = ranked.find(({ v }) => {
      if (allocateCrew(v)) return true;
      exhausted.add(v.id);
      return false;
    });
    if (!match) break;
    chosen.push(match.v.id);
    for (const [key, amount] of Object.entries(vt(match.v.type).skills))
      skills[key] = (skills[key] || 0) + amount;
  }
  deficit.push(...openForceLabels(required, skills));
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
  mode: TravelMode = "priority",
) {
  dispatchable(m);
  const vehicles = [...new Set(ids)].map((id) => {
    const v = s.vehicles.find((v) => v.id === id);
    if (!v) throw Error("Eigenes Fahrzeug fehlt.");
    const reason = readiness(s, v);
    if (reason) throw Error(`${v.name}: ${reason}`);
    // Validate every route before binding any vehicle.
    routePlan(
      s,
      v,
      v.status === "return" ? vehiclePosition(v, s.time) : v.path.at(-1)!,
      m.pos,
      mode,
    );
    return v;
  });
  checkReserveSelection(s, vehicles);
  if (!vehicles.length) throw Error("Mindestens ein Fahrzeug auswählen.");
  const allocateCrew = crewAllocator(s);
  for (const v of vehicles)
    if (!allocateCrew(v))
      throw Error(
        `${v.name}: Geeignete Besatzung bereits für ein anderes ausgewähltes Fahrzeug benötigt.`,
      );
  const proposal = m.control?.proposal;
  if (
    proposal &&
    proposal.vehicles.length === vehicles.length &&
    proposal.vehicles.every((id) => ids.includes(id))
  ) {
    const aao = s.desk.aaos.find((a) => a.id === proposal.aao);
    const t = telemetry(s, m);
    if (aao && t.aaos.length < 100)
      t.aaos.push({
        id: aao.id,
        name: aao.name,
        sufficient: proposal.missing.length === 0,
      });
  }
  for (const v of vehicles) {
    const continuing = v.status === "return";
    reportUnit(s, m, v);
    const selected = profile ?? s.desk.alarms[v.home] ?? "dme";
    const fallback =
      selected === "station" ? 30 : selected === "siren" ? 45 : 60;
    v.mission = m.id;
    v.assignment = simId(s);
    const delay = continuing ? 0 : planTurnout(s, v, fallback);
    beginTrip(s, v, m.pos, "travel", mode);
    v.depart += delay;
    v.arrive += delay;
    v.status = continuing ? "travel" : "alarmed";
    if (continuing) delete v.turnout;
    if (v.journey) v.journey.nextCheck = v.depart + 60;
    reportUnit(s, m, v, true);
    const event = record(
      s,
      m,
      "ALARM_STARTED",
      continuing
        ? `${v.name}: ${priority} · Folgeauftrag direkt aus der Rückfahrt übernommen.`
        : `${v.name}: ${alarmNames[selected]} · ${priority} · Ausrücken in ${delay} s.`,
      actor,
      v.id,
    );
    if (event) event.alarm = selected;
    record(
      s,
      m,
      "VEHICLE_DISPATCHED",
      continuing
        ? `${v.name} dem Einsatz zugeordnet. Anfahrt ab aktueller Straßenposition mit vorhandener Besatzung.`
        : `${v.name} dem Einsatz zugeordnet. Tatsächliches Ausrücken folgt nach Besatzungsbildung.`,
      actor,
      v.id,
    );
    setFms(
      s,
      v,
      continuing ? 3 : 9,
      actor,
      continuing
        ? "Folgeauftrag auf Rückfahrt übernommen"
        : "Alarmierung quittiert",
    );
    if (continuing)
      record(
        s,
        m,
        "VEHICLE_DEPARTED",
        `${v.name}: direkte Anfahrt vom aktuellen Standort begonnen.`,
        actor,
        v.id,
      );
  }
  record(
    s,
    m,
    "ALARM_CREATED",
    `${vehicles.length} Fahrzeug(e) alarmiert.`,
    actor,
  );
  if (m.control) {
    m.control.priority = priority;
    delete m.control.proposal;
  }
  if (m.control && ["disposition", "interview"].includes(m.control.stage))
    m.control.stage = vehicles.some((v) => v.status === "travel")
      ? "enroute"
      : "alarming";
  s.tutorial = Math.max(4, s.tutorial);
}
