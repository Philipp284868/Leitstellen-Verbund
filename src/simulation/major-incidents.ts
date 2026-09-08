import type { Save, Mission, Vehicle } from "../model";
import { mt, vt, BALANCE, type Skills } from "../catalog";
import { nodes, distance } from "../world";
import { record, simId } from "./events";
import { sample } from "./random";
import { newPatient } from "./patients";
import { request } from "./incidents";
import { sectionNames, majorNames, type SectionKind } from "./major-schema";
import { placement, effectiveSkills, sectionSkills } from "./major-resources";

export function majorKind(m: Mission): keyof typeof majorNames | undefined {
  if (["rail", "crash", "bus", "collapse"].includes(m.template)) return "manv";
  if (["cellar", "flood", "pump"].includes(m.template)) return "flood";
  if (["tree", "debris", "supply"].includes(m.template)) return "storm";
  if (
    ["field", "factory", "roof", "flat", "silo", "warehouse"].includes(
      m.template,
    )
  )
    return "fire";
  if (
    ["crowd", "event", "riot", "demo"].includes(m.template) ||
    mt(m.template).requirements.crowd
  )
    return "crowd";
}
export function declareMajor(s: Save, m: Mission, actor = "server") {
  if (
    m.major ||
    !m.dynamics?.active ||
    !["offered", "working"].includes(m.phase)
  )
    throw Error("Großlage bereits aktiv oder historischer Einsatz.");
  const kind = majorKind(m);
  if (!kind) throw Error("Dieses Grundereignis ist keine geeignete Großlage.");
  const sections = new Set<SectionKind>(["command"]);
  for (const skill of Object.keys(mt(m.template).requirements)) {
    const section = (Object.keys(sectionSkills) as SectionKind[]).find((k) =>
      sectionSkills[k].includes(skill),
    );
    if (section) sections.add(section);
  }
  if (kind === "manv" || kind === "crowd") sections.add("medical");
  if (kind === "fire") {
    sections.add("fire");
    sections.add("water");
    sections.add("rescue");
  }
  if (kind === "storm" || kind === "flood") {
    sections.add("technical");
    sections.add("logistics");
    sections.add("evacuation");
  }
  if (kind === "crowd") {
    sections.add("security");
    sections.add("evacuation");
  }
  if (m.dynamics.patients.length) sections.add("medical");
  m.major = {
    kind,
    declared: s.time,
    level: 1,
    sections: [...sections].map((kind) => ({
      kind,
      ordered: kind === "command",
      priority: kind === "medical" || kind === "rescue" ? 1 : 2,
      progress: 0,
      seconds: kind === "command" ? 30 : 120,
      done: false,
    })),
    placements: [],
    transports: false,
    evacuees: sections.has("evacuation") ? 24 : 0,
    evacuated: 0,
    water: 5000,
    demand: 0,
    shortage: "Einsatzleitung und Abschnittskräfte fehlen.",
    campaign: "",
    pending: {
      next: s.time + 240,
      remaining: kind === "manv" || kind === "crowd" ? 2 : 0,
      batch: kind === "manv" ? 3 : 2,
    },
  };
  if (kind === "manv" || kind === "crowd") {
    while (m.dynamics.patients.length < (kind === "manv" ? 5 : 3))
      m.dynamics.patients.push(newPatient(s, m, "Verletzung bei Großereignis"));
    m.dynamics.patients.forEach((p, i) => {
      if (p.transport !== "scene") return;
      p.health = i === 0 ? 40 : i % 3 === 0 ? 60 : 80;
      p.priority = i === 0 ? "urgent" : "normal";
    });
  }
  if (kind === "fire" && m.dynamics.fire) {
    m.dynamics.fire.area = Math.max(80, m.dynamics.fire.area);
    for (const section of m.dynamics.fire.sections.slice(0, 3))
      section.burning = 50;
    for (const h of m.dynamics.hazards.filter(
      (h) => h.kind === "fire" || h.kind === "smoke",
    )) {
      h.value = Math.max(h.value, 55);
      h.initial = Math.max(h.initial, 55);
      h.resolved = false;
    }
  }
  m.dynamics.aftermath = 0;
  if (m.control) m.control.priority = "NOTFALL";
  record(
    s,
    m,
    "MAJOR_DECLARED",
    `${majorNames[kind]} ausgerufen. Kräfte sammeln zunächst im Bereitstellungsraum; Abschnitte bewusst zuweisen.`,
    actor,
  );
  if ((kind === "storm" || kind === "flood") && !s.operations.campaign) {
    const id = simId(s);
    s.operations.campaign = {
      id,
      kind,
      started: s.time,
      next: s.time + 240,
      remaining: 4,
      missions: [m.id],
      closed: 0,
    };
    m.major.campaign = id;
  }
  s.operations.cooldown = s.time + 7200;
}
export function maybeMajor(s: Save, m: Mission) {
  if (
    s.time < s.operations.cooldown ||
    s.operations.campaign ||
    s.vehicles.length < 8 ||
    !s.vehicles.some((v) => vt(v.type).skills.command)
  )
    return;
  if (
    majorKind(m) &&
    sample(m.control?.secret?.seed || s.seed, "rare-major", 0) < 0.004
  )
    declareMajor(s, m);
}
export function majorTick(
  s: Save,
  m: Mission,
  skills: Skills,
  dt: number,
  remoteUnits: Vehicle[] = [],
) {
  const g = m.major;
  if (!g || !m.dynamics || !m.control?.briefed) return;
  const units = [
    ...s.vehicles.filter((v) => v.mission === m.id),
    ...remoteUnits,
  ].filter(
    (v) =>
      v.status === "scene" &&
      v.arrive <= s.time &&
      (!v.fault || v.fault.state === "repaired"),
  );
  const groups = new Map<SectionKind, Skills>();
  for (const v of units) {
    const key = placement(m, v),
      group = groups.get(key) || {};
    for (const [k, n] of Object.entries(effectiveSkills(m, v)))
      group[k] = (group[k] || 0) + n;
    groups.set(key, group);
  }
  const command = (groups.get("command")?.command || 0) > 0;
  const missing: string[] = [];
  if (!command) missing.push("Einsatzleitung");
  for (const section of [...g.sections].sort(
    (a, b) => a.priority - b.priority,
  )) {
    const resources = groups.get(section.kind) || {};
    const power = Object.values(resources).reduce((a, b) => a + b, 0);
    const led =
      !section.leader ||
      units.some(
        (v) =>
          v.id === section.leader!.vehicle &&
          v.assignment === section.leader!.assignment &&
          [section.kind, "command"].includes(placement(m, v)),
      );
    if (!section.ordered || !power || !command || !led) {
      if (
        !section.done ||
        (section.kind === "evacuation" && g.evacuated < g.evacuees)
      )
        missing.push(sectionNames[section.kind]);
      continue;
    }
    if (!section.done) {
      section.progress = Math.min(
        section.seconds,
        section.progress +
          dt *
            Math.min(2, power / 2) *
            (section.priority === 1 ? 1.2 : section.priority === 3 ? 0.8 : 1),
      );
      if (section.progress >= section.seconds) {
        section.done = true;
        record(
          s,
          m,
          "MAJOR_SECTION_DONE",
          `${sectionNames[section.kind]}: Aufbau / Erstauftrag abgeschlossen.`,
        );
      }
    }
    if (section.kind === "evacuation")
      g.evacuated = Math.min(g.evacuees, g.evacuated + dt * power * 0.08);
  }
  if (g.kind === "fire") {
    const supply = groups.get("water") || {};
    const burning = m.dynamics.hazards.some(
      (h) => h.kind === "fire" && !h.resolved,
    );
    g.demand = burning ? (groups.get("fire")?.fire || 0) * 12 : 0;
    g.water = Math.max(
      0,
      Math.min(
        20000,
        g.water +
          dt * ((supply.water || 0) * 20 + (supply.pump || 0) * 12 - g.demand),
      ),
    );
    if (g.water < g.demand * dt) {
      skills.fire = (skills.fire || 0) * 0.15;
      missing.push("Löschwassernachschub");
    }
  }
  const pending = g.pending;
  if (pending?.remaining && m.dynamics.patients.length >= 30) {
    pending.remaining = 0;
    record(
      s,
      m,
      "MAJOR_ASSESSMENT_DONE",
      "Nacherkundung abgeschlossen; maximale Zahl individueller Patienten erreicht.",
    );
  }
  if (
    pending?.remaining &&
    s.time >= pending.next &&
    m.dynamics.patients.length < 30
  ) {
    for (let i = 0; i < pending.batch && m.dynamics.patients.length < 30; i++)
      m.dynamics.patients.push(
        newPatient(s, m, "Weitere Verletzung nach Nacherkundung"),
      );
    pending.remaining--;
    pending.next = s.time + 240;
    g.level = Math.min(3, 1 + Math.floor(m.dynamics.patients.length / 5));
    m.dynamics.aftermath = 0;
    const text = `Weitere Betroffene gefunden: ${m.dynamics.patients.length} Patienten, MANV-Stufe ${g.level}. Sichtung und Transportmittel nachfordern.`;
    record(s, m, "MAJOR_PATIENTS_FOUND", text);
    const first = units[0];
    if (first) request(s, m, first.id, "request", text, "NOTFALL");
  }
  g.shortage = [...new Set(missing)].join(" · ").slice(0, 300);
}
// At most one new call, no catch-up burst, and the ordinary two-open-incident cap.
export function campaignTick(
  s: Save,
  create: (template: string, pos: { x: number; y: number }) => Mission,
) {
  const c = s.operations.campaign;
  if (!c) return false;
  if (
    !c.remaining &&
    c.missions.every((id) => s.archive.some((m) => m.id === id))
  ) {
    c.closed = s.time;
    s.operations.history.unshift(c);
    s.operations.history = s.operations.history.slice(0, 30);
    delete s.operations.campaign;
    return false;
  }
  if (
    !c.remaining ||
    s.time < c.next ||
    s.missions.length >= BALANCE.activeMax ||
    s.missionWait > 0
  )
    return false;
  const first = [...s.missions, ...s.archive].find(
    (m) => m.id === c.missions[0],
  );
  if (!first) return false;
  const candidates =
    c.kind === "flood"
      ? ["cellar", "supply", "tree", "crash"]
      : ["tree", "supply", "cellar", "debris"];
  const index = 4 - c.remaining;
  const near = (IS_GERMANY ? querySites(first.pos, 200) : nodes).filter(
    (n) => distance(n, first.pos) < 200 && distance(n, first.pos) > 15,
  );
  const pos =
    near[Math.floor(sample(s.seed, c.id, index) * near.length)] || first.pos;
  const m = create(candidates[index], pos);
  c.missions.push(m.id);
  c.remaining--;
  c.next =
    s.time + 240 + Math.floor(sample(s.seed, "major-spacing", index) * 121);
  record(
    s,
    m,
    "CAMPAIGN_LINKED",
    `Zugehöriger Einsatz zur ${majorNames[c.kind]}.`,
  );
  s.missionWait = 120;
  return true;
}
import { IS_GERMANY } from "../world-choice";
import { querySites } from "../germany/world";
