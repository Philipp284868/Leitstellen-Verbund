import {
  organizationsTick,
  organizationsComplete,
  attachOrganizations,
} from "./organizations";
import type { Save, Mission, Vehicle } from "../model";
import { majorTick } from "./major-incidents";
import { majorComplete, effectiveSkills } from "./major-resources";
import { mt, BALANCE, type Skills } from "../catalog";
import { level } from "../model";
import { capacity } from "../engine";
import { initialHazards, hazardTick, hazardNames, hazard } from "./hazards";
import { initialFire, fireTick } from "./fire";
import { newPatient, patientTick, patientsReady } from "./patients";
import { record, simId } from "./events";
import { request } from "./incidents";
import { attachIncident } from "./calls";
import { DYNAMICS, sample } from "./random";
import { updateWeather, weatherNames } from "./weather";
export function attachDynamics(s: Save, m: Mission, active = true) {
  if (m.dynamics) return;
  updateWeather(s);
  m.dynamics = {
    version: 1,
    active,
    last: s.time,
    state: "developing",
    level: 1,
    tactic: "standard",
    hazards: active ? initialHazards(s, m) : [],
    fire: active ? initialFire(m) : undefined,
    patients: [],
    extra: {},
    events: [],
    nextEvent: s.time + 300,
    eventChecks: 0,
    aftermath: 0,
    parent: "",
    children: [],
    random: m.control?.secret?.seed ?? s.seed,
    weatherAtCall: weatherNames[s.environment!.kind],
  };
  if (active)
    for (let i = 0; i < mt(m.template).patients; i++)
      m.dynamics.patients.push(newPatient(s, m, mt(m.template).name));
}
function announce(
  s: Save,
  m: Mission,
  type: string,
  text: string,
  urgent = false,
) {
  record(s, m, type, text);
  if (!m.control?.briefed) return;
  const v = s.vehicles.find(
    (v) =>
      v.mission === m.id &&
      v.status === "scene" &&
      (!v.fault || v.fault.state === "repaired"),
  );
  if (v) request(s, m, v.id, "request", text, urgent ? "NOTFALL" : "DRINGEND");
}
function escalate(s: Save, m: Mission, skills: Skills) {
  const d = m.dynamics!;
  if (s.time < d.nextEvent || d.events.length >= DYNAMICS.maxEvents) return;
  d.nextEvent = s.time + DYNAMICS.eventCooldown;
  const danger = d.hazards.find((h) => !h.resolved && h.value >= h.threshold);
  if (!danger) return;
  if (d.level < 4) {
    d.level++;
    d.extra[danger.skill] =
      Math.max(
        mt(m.template).requirements[danger.skill] || 1,
        d.extra[danger.skill] || 0,
      ) + 1;
    d.events.push(`escalation-${d.level}`);
    d.state = d.level >= 3 ? "critical" : "escalating";
    if (m.control?.briefed)
      m.control.priority = d.level >= 3 ? "NOTFALL" : "DRINGEND";
    announce(
      s,
      m,
      "MISSION_ESCALATED",
      `Alarmstufe ${d.level}: ${hazardNames[danger.kind]} nimmt zu. Weitere Kräfte erforderlich.`,
      d.level >= 3,
    );
  }
  const n = d.eventChecks++,
    seed = d.random || 0;
  const nextArea = d.fire?.sections.find((a) => !a.burning && !a.damage);
  if (
    d.events.length < DYNAMICS.maxEvents &&
    d.fire &&
    nextArea &&
    d.fire.intensity >= 70 &&
    sample(seed, "spread", n) < DYNAMICS.spreadChance
  ) {
    nextArea.burning = 50;
    nextArea.smoke = 40;
    d.fire.area += 20;
    d.events.push(`spread-${nextArea.name}`);
    announce(
      s,
      m,
      "FIRE_SPREAD",
      `Brandübersprung: ${nextArea.name}. Löschmaßnahmen und Wasserversorgung verstärken.`,
    );
  }
  const collapse = d.hazards.find((h) => h.kind === "collapse");
  if (
    d.events.length < DYNAMICS.maxEvents &&
    collapse &&
    collapse.value > 75 &&
    d.tactic !== "defensive" &&
    skills.fire &&
    !d.events.includes("collapse") &&
    sample(seed, "collapse", n) < DYNAMICS.collapseChance
  ) {
    d.events.push("collapse");
    d.extra.rescue = Math.max(d.extra.rescue || 0, 2);
    if (level(s) >= 2)
      d.patients.push(newPatient(s, m, "Verletzung einer Einsatzkraft"));
    announce(
      s,
      m,
      "CREW_EMERGENCY",
      "Teileinsturz: Einsatzkraft gefährdet. Rückzug, Rettungskräfte und Rettungsdienst erforderlich.",
      true,
    );
  }
  if (
    d.events.length < DYNAMICS.maxEvents &&
    d.fire &&
    d.fire.explosion > 70 &&
    !d.events.includes("explosion")
  ) {
    d.events.push("explosion");
    d.hazards.push(hazard("gas", "hazmat", 60));
    // Defensive isolation is an alternative until specialist resources arrive.
    announce(
      s,
      m,
      "SECONDARY_EVENT",
      "Explosion an der Einsatzstelle. Sicherheitsabstand herstellen; defensive Taktik oder Gefahrgutkräfte einsetzen.",
      true,
    );
  }
  if (
    d.events.length < DYNAMICS.maxEvents &&
    !d.parent &&
    !d.pending &&
    !d.children.length &&
    sample(seed, "secondary", n) < DYNAMICS.secondaryChance
  ) {
    d.pending = {
      template:
        level(s) >= 2 && s.vehicles.some((v) => v.type === "rtw")
          ? "sick"
          : "bin",
      due: s.time + 120,
    };
    d.events.push("followup-pending");
    announce(
      s,
      m,
      "FOLLOWUP_PENDING",
      "Ein Folgeereignis wurde gemeldet. Ein zugeordneter Notruf folgt mit Abstand.",
    );
  }
}
export function dynamicsTick(
  s: Save,
  m: Mission,
  remote: Skills = {},
  carriers: Record<string, Skills> = {},
  remoteUnits: Vehicle[] = [],
) {
  const d = m.dynamics;
  if (!d?.active || m.phase === "done") return;
  const elapsed =
    Math.floor((s.time - d.last) / DYNAMICS.quantum) * DYNAMICS.quantum;
  if (elapsed <= 0) return;
  const now = s.time;
  // Fixed quanta preserve dynamics across normal tick batching and persisted restarts.
  for (
    let t = d.last + DYNAMICS.quantum;
    t <= now + 1e-6;
    t += DYNAMICS.quantum
  ) {
    s.time = t;
    const skills = { ...capacity(s, m.id) };
    for (const v of s.vehicles.filter(
      (v) =>
        v.mission === m.id &&
        v.status === "scene" &&
        v.arrive > t &&
        (!v.fault || v.fault.state === "repaired"),
    ))
      for (const [k, n] of Object.entries(effectiveSkills(m, v)))
        skills[k] = Math.max(0, (skills[k] || 0) - n);
    for (const [k, n] of Object.entries(remote))
      skills[k] = (skills[k] || 0) + n;
    if (d.tactic === "defensive") {
      skills.hazmat = Math.max(skills.hazmat || 0, (skills.fire || 0) * 0.5);
    }
    majorTick(s, m, skills, DYNAMICS.quantum, remoteUnits);
    organizationsTick(s, m, skills, DYNAMICS.quantum);
    hazardTick(s, m, skills, DYNAMICS.quantum);
    fireTick(s, m, skills, DYNAMICS.quantum);
    patientTick(s, m, skills, DYNAMICS.quantum, carriers);
    escalate(s, m, skills);
    const critical = d.patients.find(
      (p) => p.condition === "critical" || p.condition === "cpr",
    );
    if (
      critical &&
      d.events.length < 40 &&
      m.control?.briefed &&
      !d.events.includes(`patient-${critical.id}`)
    ) {
      d.events.push(`patient-${critical.id}`);
      announce(
        s,
        m,
        "PATIENT_CRITICAL",
        "Patient kritisch: Notarzt und ausreichende Versorgung erforderlich.",
        true,
      );
    }
    if (critical) d.state = "critical";
    if (d.hazards.every((h) => h.resolved) && patientsReady(m)) {
      if (d.level > 1) {
        d.level = 1;
        d.extra = {};
        if (m.control) m.control.priority = critical ? "NOTFALL" : "NORMAL";
        announce(
          s,
          m,
          "MISSION_DOWNGRADED",
          "Gefahren beseitigt; zusätzliche Alarmstufe aufgehoben.",
        );
      }
      if (!d.aftermath) {
        d.aftermath = t + 15;
        d.state = "aftermath";
        if (m.control?.briefed)
          record(
            s,
            m,
            "MISSION_STABILIZED",
            "Gefahren beherrscht und Patienten transportfähig. Nachkontrolle läuft.",
          );
      }
    } else if (d.hazards.every((h) => h.value < 40) && !critical) {
      if (d.level > 1) {
        d.level = 1;
        d.extra = {};
        if (m.control) m.control.priority = critical ? "NOTFALL" : "NORMAL";
        announce(
          s,
          m,
          "MISSION_DOWNGRADED",
          "Lage stabilisiert; Alarmstufe zurückgenommen. Kräfte können bedarfsgerecht zurückgenommen werden.",
        );
      }
      d.state = "stabilizing";
    }
    d.last = t;
  }
  s.time = now;
}
export function dynamicsComplete(m: Mission, time: number) {
  return (
    majorComplete(m) &&
    organizationsComplete(m) &&
    (!m.dynamics?.active ||
      (!!m.dynamics.aftermath &&
        m.dynamics.aftermath <= time &&
        patientsReady(m) &&
        m.dynamics.hazards.every((h) => h.resolved)))
  );
}
export function followupsTick(s: Save) {
  // Shared cap with the normal generator; never catch up a backlog or chain grandchildren.
  if (s.missions.length >= BALANCE.activeMax || s.missionWait > 0) return;
  const parent = [...s.missions, ...s.archive].find(
    (m) =>
      m.dynamics?.pending &&
      m.dynamics.pending.due <= s.time &&
      m.dynamics.children.length < DYNAMICS.followups,
  );
  if (!parent?.dynamics?.pending) return;
  const d = parent.dynamics,
    template = d.pending!.template;
  const child: Mission = {
    id: simId(s),
    template,
    pos: { ...parent.pos },
    progress: 0,
    phase: "offered",
    created: s.time,
    completed: 0,
    shared: false,
    round: simId(s),
    contributors: [],
    transports: [],
  };
  s.missions.push(child);
  attachIncident(s, child);
  attachDynamics(s, child);
  attachOrganizations(child);
  child.dynamics!.parent = parent.id;
  d.children.push(child.id);
  delete d.pending;
  record(
    s,
    parent,
    "FOLLOWUP_CREATED",
    `Zugeordneter Folgeeinsatz ${child.id.slice(-8)} angelegt.`,
  );
  record(
    s,
    child,
    "FOLLOWUP_LINKED",
    `Folgeereignis zu Einsatz ${parent.id.slice(-8)}.`,
  );
  s.missionWait = 120;
}
