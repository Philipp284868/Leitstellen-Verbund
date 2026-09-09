import { turnoutReady } from "./staffing";
import { stationProfile, crewSummaries } from "./staffing";
import { vehicleAvailability } from "./availability";
import { urgentPriority } from "./priority";
import { openForceLabels } from "./force-plan";
import { finalizeReport } from "./reports";
import type { Skills } from "../catalog";
import type { Save, Mission } from "../model";
import { missing, capacity } from "../engine";
import { mt } from "../catalog";
import { record, simId } from "./events";
import { syncFms, setFms, operativeCode } from "./fms";
import { callsTick } from "./calls";
import type { Incident } from "./schema";
export function legacyIncident(s: Save, m: Mission) {
  if (m.control) return;
  m.control = {
    priority: "NORMAL",
    legacy: true,
    stage:
      m.phase === "done"
        ? "closed"
        : m.phase === "working"
          ? "working"
          : "disposition",
    locationKnown: true,
    reportedTemplate: m.template,
    briefed: true,
    firstArrival: "",
    facts: [
      {
        key: "legacy",
        text: mt(m.template).name,
        source: "migration",
        confidence: "bestätigt",
      },
    ],
    calls: [],
    radio: [],
    events: [],
  };
  record(
    s,
    m,
    "MIGRATED",
    "Bestehender Einsatz übernommen. Frühere Einzelmeldungen wurden nicht aufgezeichnet.",
  );
}
export function beforeStep(s: Save) {
  callsTick(s);
  for (const v of s.vehicles)
    if (v.status === "alarmed" && v.depart <= s.time) {
      if (!turnoutReady(s, v)) continue;
      v.status = "travel";
      const m = s.missions.find((m) => m.id === v.mission);
      if (m) {
        if (m.control?.stage === "alarming") m.control.stage = "enroute";
        record(
          s,
          m,
          "VEHICLE_DEPARTED",
          `${v.name} ausgerückt; Anfahrt begonnen.`,
          "server",
          v.id,
        );
      }
      setFms(s, v, 3);
    }
}
export function request(
  s: Save,
  m: Mission,
  vehicle: string,
  reason: "arrival" | "request" | "question",
  details: string,
  priority: Incident["radio"][number]["priority"] = "NORMAL",
) {
  const c = m.control!;
  if (
    c.radio.length >= 50 ||
    c.radio.some(
      (r) =>
        r.state === "open" &&
        r.reason === reason &&
        r.vehicle === vehicle &&
        r.details === details,
    )
  )
    return;
  c.radio.push({
    id: simId(s),
    vehicle,
    reason,
    priority,
    state: "open",
    created: s.time,
    answered: 0,
    details,
  });
  record(s, m, "SPEAK_REQUESTED", details, "server", vehicle);
  const v = s.vehicles.find((v) => v.id === vehicle);
  if (v && (!v.fault || v.fault.state === "repaired"))
    setFms(s, v, urgentPriority(priority) ? 0 : 5);
}
export function afterVehicles(s: Save, remote: Record<string, Skills> = {}) {
  syncFms(s);
  for (const m of s.missions) {
    const c = m.control;
    if (!c || c.legacy) continue;
    const atScene = s.vehicles.filter(
      (v) =>
        v.mission === m.id &&
        v.status === "scene" &&
        (!v.fault || v.fault.state === "repaired"),
    );
    for (const v of atScene)
      if (
        !c.events.some(
          (e) =>
            e.type === "VEHICLE_ARRIVED" &&
            e.vehicle === v.id &&
            e.assignment === v.assignment,
        )
      )
        record(
          s,
          m,
          "VEHICLE_ARRIVED",
          `${v.name} an der Einsatzstelle.`,
          "server",
          v.id,
        );
    if (!c.firstArrival && atScene.length) {
      c.firstArrival = atScene[0].id;
      c.stage = "recon";
      request(
        s,
        m,
        c.firstArrival,
        "arrival",
        "Erste Erkundung abgeschlossen. Lagemeldung liegt vor.",
        c.priority,
      );
    }
    if (
      c.briefed &&
      (atScene.length || Object.values(remote[m.id] || {}).some((n) => n > 0))
    ) {
      const skills = capacity(s, m.id);
      for (const [k, n] of Object.entries(remote[m.id] || {}))
        skills[k] = (skills[k] || 0) + n;
      const deficit = missing(m, skills);
      const signature = deficit.map(([k, n]) => `${k}:${n}`).join(";");
      if (deficit.length && c.deficit !== signature)
        request(
          s,
          m,
          atScene[0]?.id || c.firstArrival,
          "request",
          `Nachforderung: ${openForceLabels(Object.fromEntries(deficit)).join(", ")}`,
          "DRINGEND",
        );
      c.deficit = signature;
    }
  }
}
export function radioAction(
  s: Save,
  m: Mission,
  id: string,
  op: "report" | "request" | "question" | "close",
  actor: string,
  remote: Skills = {},
) {
  const c = m.control,
    r = c?.radio.find((r) => r.id === id);
  if (!c || !r) throw Error("Sprechwunsch fehlt.");
  if (r.state === "handled") return;
  if (!c.briefed && r.reason === "arrival") {
    c.briefed = true;
    if (m.dynamics?.active && m.dynamics.level > 1)
      c.priority = m.dynamics.level >= 3 ? "NOTFALL" : "DRINGEND";
    c.reportedTemplate = m.template;
    c.stage = "working";
    c.facts.push({
      key: "recon",
      text: c.secret?.detail ?? mt(m.template).name,
      source: r.vehicle,
      confidence: "bestätigt",
    });
    record(
      s,
      m,
      "REPORT_RECEIVED",
      c.secret?.detail ?? mt(m.template).name,
      actor,
      r.vehicle,
    );
    if (m.template === "bma-false")
      record(
        s,
        m,
        "FALSE_ALARM_CONFIRMED",
        "Fehlalarm durch die erste Lagemeldung bestätigt.",
        actor,
        r.vehicle,
      );
  }
  if (op === "question") {
    if (r.questioned) return;
    r.questioned = true;
    const skills = capacity(s, m.id);
    for (const [k, n] of Object.entries(remote))
      skills[k] = (skills[k] || 0) + n;
    record(
      s,
      m,
      "RADIO_ANSWER",
      `Rückfrage beantwortet: ${
        openForceLabels(Object.fromEntries(missing(m, skills))).join(", ") ||
        "Kräfte vor Ort ausreichend"
      }.`,
      actor,
      r.vehicle,
    );
    return;
  }
  if (op === "request")
    record(
      s,
      m,
      "REINFORCEMENT_REQUESTED",
      `${r.details} – Disposition weiterer Kräfte angefordert.`,
      actor,
      r.vehicle,
    );
  r.state = "handled";
  r.answered = s.time;
  record(
    s,
    m,
    "SPEAK_HANDLED",
    `Sprechwunsch erledigt (${op}).`,
    actor,
    r.vehicle,
  );
  const v = s.vehicles.find((v) => v.id === r.vehicle);
  if (v && !c.radio.some((x) => x.vehicle === v.id && x.state === "open"))
    setFms(s, v, operativeCode(v), actor, "Funkgespräch beendet");
}
export function afterStep(s: Save) {
  for (const m of s.missions)
    if (m.control?.briefed && m.phase === "transport")
      m.control.stage = "transport";
  for (const m of s.archive)
    if (m.control && m.control.stage !== "closed") {
      m.control.stage = "closed";
      for (const c of m.control.calls)
        if (c.state !== "ended") {
          if (c.state === "active") c.duration += s.time - c.started;
          c.state = "ended";
          c.ended = s.time;
        }
      for (const r of m.control.radio)
        if (r.state === "open") {
          r.state = "handled";
          r.answered = s.time;
        }
      record(
        s,
        m,
        "MISSION_COMPLETED",
        `Einsatz abgeschlossen: ${mt(m.template).name}. Belohnung serverseitig gebucht.`,
      );
    }
  for (const m of s.archive) finalizeReport(s, m);
  syncFms(s);
}
export function publicSave(source: Save): Save {
  const s = structuredClone(source);
  const crews = crewSummaries(source);
  for (let i = 0; i < s.vehicles.length; i++)
    s.vehicles[i].availability = vehicleAvailability(
      source,
      source.vehicles[i],
      crews.get(s.vehicles[i].id),
    );
  const volunteerHomes = new Set(
    s.buildings.filter((b) => stationProfile(b).kind === "ff").map((b) => b.id),
  );
  for (const p of s.people) if (volunteerHomes.has(p.home)) delete p.duty;
  s.seed = 0;
  s.operations.cooldown = 0;
  if (
    s.operations.campaign &&
    !source.missions
      .concat(source.archive)
      .find((m) => m.id === s.operations.campaign!.missions[0])?.control
      ?.briefed
  )
    delete s.operations.campaign;
  if (s.operations.campaign) {
    s.operations.campaign.next = 0;
    s.operations.campaign.remaining = 0;
  }
  if (s.environment)
    s.environment.roads = s.environment.roads.filter(
      (r) =>
        !r.id.startsWith("major-road:") ||
        source.missions.find((m) => r.id === `major-road:${m.id}`)?.control
          ?.briefed,
    );
  for (const m of [...s.missions, ...s.archive]) {
    if (!m.control?.briefed) delete m.major;
    else if (m.major) delete m.major.pending;
    if (!m.control?.briefed) delete m.organization;
    if (m.dynamics) {
      delete m.dynamics.random;
      delete m.dynamics.pending;
      if (!m.control?.briefed) delete m.dynamics;
    }
    if (m.control) {
      delete m.control.secret;
      if (!m.control.briefed)
        m.control.events = m.control.events.filter(
          (e) =>
            !/^(MAJOR_|HAZARD_|PATIENT_|MISSION_ESCALATED|MISSION_DOWNGRADED|MISSION_STABILIZED|FIRE_SPREAD|CREW_EMERGENCY|SECONDARY_EVENT|FOLLOWUP_PENDING)/.test(
              e.type,
            ),
        );
      if (!m.control.briefed && !m.control.legacy) {
        m.template = m.control.reportedTemplate || "incoming";
        if (!m.control.locationKnown) m.pos = { x: 0, y: 0 };
      }
    }
  }
  return s;
}
