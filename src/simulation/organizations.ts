import type { Save, Mission } from "../model";
import { mt, vt, type Skills } from "../catalog";
import { nodes } from "../world";
import { writable, record } from "./events";
import { taskNames, type OrganizationAction } from "./organizations-schema";
import { crewRequired, personAvailable, stationProfile } from "./staffing";
export function attachOrganizations(m: Mission) {
  if (m.organization) return;
  const r = mt(m.template).requirements;
  const kinds: (keyof typeof taskNames)[] = [];
  if (r.police || r.crowd) kinds.push("secure");
  if (r.police) kinds.push("investigate");
  if (r.technical) kinds.push("shore");
  if (r.logistics || ["collapse", "rail"].includes(m.template))
    kinds.push("power");
  if (r.pump && (r.technical || r.logistics)) kinds.push("pump");
  if (mt(m.template).patients) kinds.push("triage");
  m.organization = {
    tasks: kinds.map((kind) => ({
      kind,
      ordered: false,
      progress: 0,
      seconds: kind === "secure" ? 30 : 60,
      done: false,
    })),
  };
}
export const taskSkills = {
  secure: "police",
  investigate: "police",
  shore: "technical",
  power: "logistics",
  pump: "pump",
  triage: "medical",
};
export function organizationsTick(
  s: Save,
  m: Mission,
  skills: Skills,
  dt: number,
) {
  for (const t of m.organization?.tasks || []) {
    if (t.done || !t.ordered || !m.control?.briefed) continue;
    if (
      t.kind !== "secure" &&
      m.organization?.tasks.some((x) => x.kind === "secure" && !x.done)
    )
      continue;
    if (!(skills[taskSkills[t.kind]] > 0)) continue;
    t.progress = Math.min(t.seconds, t.progress + dt);
    if (t.progress >= t.seconds) {
      t.done = true;
      record(
        s,
        m,
        "ORGANIZATION_TASK_DONE",
        `${taskNames[t.kind]} abgeschlossen.`,
      );
    }
  }
  if (m.organization?.tasks.some((t) => t.kind === "secure" && !t.done)) {
    skills.medical = 0;
    skills.doctor = 0;
  }
}
export const organizationsComplete = (m: Mission) =>
  !m.organization || m.organization.tasks.every((t) => t.done);
export function organizationCommand(
  s: Save,
  a: OrganizationAction,
  actor: string,
) {
  if (a.type === "station-profile" || a.type === "hospital-profile") {
    const b = s.buildings.find((b) => b.id === a.home);
    if (!b) throw Error("Eigene Wache fehlt.");
    if (a.type === "hospital-profile") {
      if (b.type !== "hospital" || a.profile.capacity > b.level * 20)
        throw Error("Krankenhauskapazität überschritten.");
      b.hospital = a.profile;
    } else {
      const allowed =
        b.type === "fire"
          ? ["bf", "ff", "works", "company", "airport"]
          : [b.type === "heli" ? "ems" : b.type];
      if (!allowed.includes(a.profile.kind))
        throw Error("Organisation passt nicht zur Wache.");
      const previous = stationProfile(b);
      const changesTurnout =
        a.profile.kind !== previous.kind ||
        a.profile.turnout !== previous.turnout ||
        a.profile.crew !== previous.crew;
      if (
        changesTurnout &&
        s.vehicles.some((v) => v.home === b.id && v.status !== "ready")
      )
        throw Error(
          "Profil nur bei vollständig zurückgekehrtem Fuhrpark ändern.",
        );
      b.organization = a.profile;
    }
  } else if (a.type === "person-duty") {
    const p = s.people.find((p) => p.id === a.person);
    if (!p) throw Error("Eigene Einsatzkraft fehlt.");
    if (
      p.vehicle &&
      s.vehicles.some((v) => v.id === p.vehicle && v.status !== "ready")
    )
      throw Error("Einsatzkraft ist bereits gebunden.");
    if (!nodes[a.duty.homeNode] || !nodes[a.duty.workNode])
      throw Error("Wohn- oder Arbeitsort ungültig.");
    if (IS_GERMANY && (!isLandSite(nodes[a.duty.homeNode]) || !isLandSite(nodes[a.duty.workNode])))
      throw Error("Wohn- und Arbeitsorte benötigen eine zugängliche Straße an Land.");
    p.duty = { ...a.duty, load: p.duty?.load || 0 };
  } else if (a.type === "vehicle-reserve") {
    const v = s.vehicles.find((v) => v.id === a.vehicle);
    if (!v || v.status !== "ready")
      throw Error("Reserve nur an der Wache änderbar.");
    v.reserve = a.reserve;
  } else if (a.type === "crew-transfer") {
    const from = s.vehicles.find((v) => v.id === a.from),
      to = s.vehicles.find((v) => v.id === a.to);
    if (
      !from ||
      !to ||
      from === to ||
      from.home !== to.home ||
      from.status !== "ready" ||
      to.status !== "ready"
    )
      throw Error("Umbesetzung benötigt zwei freie Fahrzeuge derselben Wache.");
    const crew = s.people.filter(
      (p) =>
        (p.vehicle === from.id || p.vehicle === to.id) &&
        !personAvailable(s, p) &&
        (!vt(to.type).training || p.skills.includes(vt(to.type).training)),
    );
    const needed = crewRequired(s, to);
    if (crew.length < needed)
      throw Error("Auch für das Zielfahrzeug fehlt geeignetes Personal.");
    for (const p of s.people.filter(
      (p) => p.vehicle === from.id || p.vehicle === to.id,
    ))
      p.vehicle = null;
    for (const p of crew.slice(0, vt(to.type).crew)) p.vehicle = to.id;
  } else {
    const m = s.missions.find((m) => m.id === a.mission);
    if (!m) throw Error("Eigener Einsatz fehlt.");
    writable(m);
    if (!m.control?.briefed) throw Error("Zuerst die Lagemeldung bearbeiten.");
    if (a.type === "hospital-select") {
      if (
        a.home !== "auto" &&
        a.home !== "public" &&
        !s.buildings.some((b) => b.id === a.home && b.type === "hospital")
      )
        throw Error("Eigenes Krankenhaus fehlt.");
      m.organization ??= { tasks: [] };
      if (a.home === "auto") delete m.organization.hospital;
      else m.organization.hospital = a.home;
      record(
        s,
        m,
        "HOSPITAL_SELECTED",
        `Transportziel: ${a.home === "auto" ? "automatische geeignete Aufnahme" : a.home === "public" ? "Regionalklinik" : s.buildings.find((b) => b.id === a.home)!.name}. Bereits fahrende Transporte behalten ihre Aufnahmezusage.`,
        actor,
      );
    } else {
      const t = m.organization?.tasks.find((t) => t.kind === a.task);
      if (!t || t.ordered)
        throw Error("Auftrag fehlt oder wurde bereits erteilt.");
      t.ordered = true;
      record(s, m, "ORGANIZATION_TASK_ORDERED", taskNames[t.kind], actor);
    }
  }
}
import { IS_GERMANY } from "../world-choice";
import { isLandSite } from "../germany/world";
