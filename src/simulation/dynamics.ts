import {
  organizationsTick,
  organizationsComplete,
  attachOrganizations,
} from "./organizations";
import type { Save, Mission, Vehicle } from "../model";
import { majorTick } from "./major-incidents";
import {
  majorComplete,
  effectiveSkills,
  workingSkills,
} from "./major-resources";
import { mt, type Skills } from "../catalog";
import { level } from "../model";
import { initialHazards, hazardTick, hazardNames, hazard } from "./hazards";
import { initialFire, fireTick } from "./fire";
import { ensureMissionTasks, taskTick, tasksComplete } from "./mission-tasks";
import { newPatient, patientTick, patientsReady } from "./patients";
import { record, simId } from "./events";
import { request } from "./incidents";
import { attachIncident } from "./calls";
import { DYNAMICS, sample } from "./random";
import { updateWeather, weatherNames } from "./weather";
import { injureResponder, syncResponderRecovery } from "./responder-recovery";
import {
  canGenerate,
  capabilitiesUnlocked,
  fleetCapabilities,
} from "./feasibility";
export function attachDynamics(s: Save, m: Mission, active = true) {
  if (m.dynamics) return;
  updateWeather(s);
  m.dynamics = {
    version: 1,
    active,
    ...(active && mt(m.template).profile
      ? {
          scenario: structuredClone(mt(m.template).profile),
          responders: [],
          bystanderChecked: false,
        }
      : {}),
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
    for (const h of m.dynamics.hazards)
      record(
        s,
        m,
        "HAZARD_CREATED",
        `${hazardNames[h.kind]} angelegt; Ausprägung und Maßnahmenbedarf werden erkundet.`,
      );
  if (active)
    for (
      let i = 0;
      i < (m.dynamics.scenario?.patientCount ?? mt(m.template).patients);
      i++
    )
      m.dynamics.patients.push(newPatient(s, m, mt(m.template).name));
  if (active) ensureMissionTasks(s, m);
}

/** Resolve only a small, witnessed incipient fire; response and reconnaissance remain required. */
function bystanderTick(s: Save, m: Mission) {
  const d = m.dynamics!;
  if (!d.scenario?.bystander || d.bystanderChecked || s.time < m.created + 45)
    return;
  d.bystanderChecked = true;
  if (
    d.fire &&
    d.fire.intensity < 45 &&
    sample(d.random || 0, "bystander", 0) < 0.18
  ) {
    for (const h of d.hazards.filter((h) =>
      ["fire", "smoke", "heat"].includes(h.kind),
    )) {
      h.value = 0;
      h.resolved = true;
    }
    for (const part of d.fire.sections) part.burning = 0;
    d.fire.intensity = 0;
    d.fire.smoke = 0;
    announce(
      s,
      m,
      "MISSION_STABILIZED",
      "Anwohner haben den Entstehungsbrand gelöscht. Erkundung und Nachkontrolle durch alarmierte Kräfte bleiben erforderlich.",
    );
  }
}
function responderTick(s: Save, m: Mission, skills: Skills) {
  const d = m.dynamics!;
  if (!d.scenario) return;
  const sceneVehicles = new Map(
    s.vehicles
      .filter((v) => v.mission === m.id && v.status === "scene")
      .map((v) => [v.id, v]),
  );
  const people = sceneVehicles.size
    ? s.people.filter((p) => p.vehicle && sceneVehicles.has(p.vehicle))
    : [];
  d.responders ??= [];
  const patients = new Map(d.patients.map((p) => [p.id, p]));
  const responders = new Map(
    d.responders.map((r) => [`${r.person}:${r.assignment ?? ""}`, r]),
  );
  for (const responder of d.responders.filter((r) => r.patient)) {
    const patient = patients.get(responder.patient);
    if (!patient) continue;
    if (["EINGESCHLOSSEN", "VERMISST"].includes(responder.state)) {
      if ((skills.rescue || 0) < 2) continue;
      record(
        s,
        m,
        "CREW_RESCUED",
        "Betroffene Einsatzkraft durch zugeordnete Rettungskräfte erreicht; Rettungsdienst übernimmt.",
        "server",
        responder.vehicle,
      );
    }
    const next =
      patient.health <= 12
        ? "BEWUSSTLOS"
        : patient.health < 35
          ? "SCHWER_VERLETZT"
          : "VERLETZT";
    if (responder.state !== next) {
      responder.state = next;
      responder.since = s.time;
    }
  }
  const worst = Math.max(
    0,
    ...d.hazards.filter((h) => !h.resolved).map((h) => h.value),
  );
  for (const p of people) {
    const assignment = sceneVehicles.get(p.vehicle!)!.assignment ?? undefined;
    const key = `${p.id}:${assignment ?? ""}`;
    let responder = responders.get(key);
    if (!responder) {
      responder = {
        person: p.id,
        vehicle: p.vehicle!,
        ...(assignment ? { assignment } : {}),
        state: "NORMAL",
        since: s.time,
        patient: "",
      };
      d.responders.push(responder);
      responders.set(key, responder);
    }
    if (
      !responder ||
      !["NORMAL", "BELASTET", "GEFÄHRDET"].includes(responder.state)
    )
      continue;
    const next =
      worst >= 75 && d.tactic !== "defensive"
        ? "GEFÄHRDET"
        : worst >= 45
          ? "BELASTET"
          : "NORMAL";
    if (responder.state !== next) {
      responder.state = next;
      responder.since = s.time;
    }
  }
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
        (d.scenario?.requirements ?? mt(m.template).requirements)[
          danger.skill
        ] || 1,
        d.extra[danger.skill] || 0,
      ) + 1;
    d.events.push(`escalation-${d.level}`);
    d.state = d.level >= 3 ? "critical" : "escalating";
    record(
      s,
      m,
      "HAZARD_ESCALATED",
      `${hazardNames[danger.kind]}: Gefahrenbewertung auf Alarmstufe ${d.level} angehoben.`,
    );
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
    if (
      d.scenario &&
      /Fassade|Treppenraum|Obergeschoss/.test(nextArea.name) &&
      !d.events.includes("persons-trapped") &&
      capabilitiesUnlocked(s, {
        rescue: 1,
        ladder: 1,
        medical: 2,
        transport: 1,
      })
    ) {
      d.events.push("persons-trapped");
      d.extra.rescue = Math.max(d.extra.rescue || 0, 1);
      d.extra.ladder = Math.max(d.extra.ladder || 0, 1);
      if (d.patients.length < 30)
        d.patients.push(
          newPatient(s, m, "Rauchgasexposition nach Brandausbreitung"),
        );
      announce(
        s,
        m,
        "SECONDARY_EVENT",
        "Rauch erreicht bewohnte Bereiche. Eine Person benötigt Hilfe; Menschenrettung und Rettungsdienst nachfordern.",
        true,
      );
    }
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
    const responder = d.responders?.find(
      (r) =>
        r.state === "GEFÄHRDET" &&
        !r.patient &&
        s.vehicles.some(
          (v) =>
            v.id === r.vehicle &&
            v.mission === m.id &&
            v.status === "scene" &&
            (!r.assignment || r.assignment === v.assignment),
        ),
    );
    if (
      capabilitiesUnlocked(s, { medical: 2, transport: 1, doctor: 1 }) &&
      d.patients.length < 30 &&
      (responder || !d.scenario)
    ) {
      const patient = newPatient(s, m, "Verletzung einer Einsatzkraft", true);
      patient.health = 30;
      patient.condition = "critical";
      patient.consciousness = "bewusstlos";
      patient.pulse = 136;
      patient.breathing = 30;
      patient.systolic = 88;
      patient.oxygen = 78;
      patient.priority = "urgent";
      d.patients.push(patient);
      if (responder) {
        responder.state = d.hazards.some(
          (h) => ["visibility", "darkness"].includes(h.kind) && !h.resolved,
        )
          ? "VERMISST"
          : "EINGESCHLOSSEN";
        responder.since = s.time;
        responder.patient = patient.id;
        injureResponder(s, m, responder.person, patient);
      }
    }
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
    record(
      s,
      m,
      "HAZARD_CREATED",
      "Explosionsfolge: zusätzliche Gasgefahr an der Einsatzstelle.",
    );
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
    sample(seed, "secondary", n) <
      (d.scenario ? 0.45 : DYNAMICS.secondaryChance)
  ) {
    const followup = d.scenario?.followups.find((f) =>
      d.hazards.some(
        (h) => h.kind === f.trigger && !h.resolved && h.value >= f.threshold,
      ),
    );
    if (d.scenario && !followup) return;
    d.pending = {
      template:
        followup?.template ??
        (level(s) >= 2 && s.vehicles.some((v) => v.type === "rtw")
          ? "sick"
          : "bin"),
      due: s.time + (followup?.delay ?? 120),
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
  ensureMissionTasks(s, m);
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
    const skills: Skills = {};
    for (const v of s.vehicles.filter(
      (v) =>
        v.mission === m.id &&
        v.status === "scene" &&
        v.arrive <= t &&
        (!v.fault || v.fault.state === "repaired"),
    ))
      for (const [k, n] of Object.entries(workingSkills(m, v)))
        skills[k] = (skills[k] || 0) + n;
    for (const [k, n] of Object.entries(remote))
      skills[k] = (skills[k] || 0) + n;
    for (const v of remoteUnits.filter(
      (v) => v.status === "scene" && v.arrive <= t,
    )) {
      const working = workingSkills(m, v);
      for (const [k, n] of Object.entries(effectiveSkills(m, v)))
        skills[k] = Math.max(0, (skills[k] || 0) - n + (working[k] || 0));
    }
    if (d.tactic === "defensive") {
      skills.hazmat = Math.max(skills.hazmat || 0, (skills.fire || 0) * 0.5);
    }
    majorTick(s, m, skills, DYNAMICS.quantum, remoteUnits);
    organizationsTick(s, m, skills, DYNAMICS.quantum);
    bystanderTick(s, m);
    responderTick(s, m, skills);
    hazardTick(s, m, skills, DYNAMICS.quantum);
    fireTick(s, m, skills, DYNAMICS.quantum);
    patientTick(s, m, skills, DYNAMICS.quantum, carriers);
    taskTick(s, m, skills, DYNAMICS.quantum);
    syncResponderRecovery(s, m);
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
    } else {
      // A previous all-clear is invalid as soon as a new hazard or an unstable
      // patient appears. The next stabilization starts a fresh observation period.
      d.aftermath = 0;
      if (d.hazards.every((h) => h.value < 40) && !critical) {
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
    }
    d.last = t;
  }
  s.time = now;
}
export function dynamicsComplete(m: Mission, time: number) {
  return (
    tasksComplete(m) &&
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
  // Time pacing is independent of the count of open incidents; no catch-up burst.
  if (s.missionWait > 0) return;
  const available = fleetCapabilities(s);
  const parent = [...s.missions, ...s.archive].find(
    (m) =>
      m.dynamics?.pending &&
      m.dynamics.pending.due <= s.time &&
      m.dynamics.children.length < DYNAMICS.followups &&
      canGenerate(s, mt(m.dynamics.pending.template), available),
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
