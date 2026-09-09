import { taskSkills } from "./organizations";
import type { Mission, Save } from "../model";
import { mt, type Skills } from "../catalog";
import { hazardKinds, type Hazard } from "./dynamics-schema";
import { record } from "./events";
import { clamp } from "./random";
import { fireExtinguished, taskRequirements } from "./mission-tasks";
export const hazardNames: Record<Hazard["kind"], string> = {
  fire: "Feuer",
  smoke: "Rauch",
  heat: "Hitze",
  collapse: "Einsturzgefahr",
  electricity: "Elektrizität",
  gas: "Gas",
  hazmat: "Gefahrstoffe",
  water: "Wasser",
  traffic: "Verkehr",
  violence: "Gewalt",
  crowd: "Menschenmenge",
  weather: "Witterung",
  visibility: "Schlechte Sicht",
  darkness: "Dunkelheit",
  technical: "Technische Gefahren",
  fuel: "Brennstoffausbreitung",
  uncertainty: "Ungeklärter Gefahrstoff",
  contamination: "Kontamination",
  security: "Ungesicherter Einsatzbereich",
  exposure: "Ungeschützte Betroffene",
};
export function hazard(
  kind: Hazard["kind"],
  skill: string,
  initial = 30,
  growth = 0.025,
  required = 1,
): Hazard {
  return {
    kind,
    initial,
    value: initial,
    growth,
    reduction: 0.7,
    threshold: 70,
    skill,
    required,
    resolved: false,
  };
}
export function initialHazards(s: Save, m: Mission): Hazard[] {
  const t = mt(m.template),
    r = t.requirements,
    result: Hazard[] = [];
  if (t.profile) {
    for (const definition of t.profile.hazards) {
      if (!hazardKinds.includes(definition.kind as Hazard["kind"]))
        throw Error("Unbekannte Gefahr im Einsatzprofil.");
      result.push(
        hazard(
          definition.kind as Hazard["kind"],
          definition.skill,
          definition.initial,
          definition.growth,
          definition.required,
        ),
      );
    }
    const skill =
      Object.keys(r).find(
        (k) => !["transport", "command", "medicalCommand"].includes(k),
      ) || "medical";
    if ((s.environment?.wind ?? 0) >= 60)
      result.push(hazard("weather", skill, 20, 0.008));
    if ((s.environment?.visibility ?? 15000) < 1000)
      result.push(hazard("visibility", skill, 20, 0.005));
    const hour = new Date(s.time * 1000).getUTCHours();
    if (hour < 6 || hour >= 21) result.push(hazard("darkness", skill, 12, 0));
    return result;
  }
  if (r.fire && m.template !== "bma-false")
    result.push(
      hazard("fire", "fire", 24, 0.035, r.fire),
      hazard("smoke", "fire", 15),
      hazard("heat", "fire", 10),
    );
  if (["flat", "roof", "factory", "silo", "collapse"].includes(t.id))
    result.push(
      hazard("collapse", r.technical ? "technical" : "fire", 15, 0.015),
    );
  if (r.hazmat)
    result.push(
      hazard("hazmat", "hazmat", 30, 0.03, r.hazmat),
      hazard("gas", "hazmat", 20),
    );
  if (r.pump) result.push(hazard("water", "pump", 30, 0.025, r.pump));
  if (r.police)
    result.push(
      hazard(
        t.id === "traffic" ? "traffic" : "violence",
        "police",
        25,
        0.01,
        r.police,
      ),
    );
  if (r.crowd) result.push(hazard("crowd", "crowd", 25));
  if (r.rescue || r.technical)
    result.push(hazard("technical", r.technical ? "technical" : "rescue", 25));
  if (t.id === "power") result.push(hazard("electricity", "technical", 40));
  // Environmental hazards are mitigated by the mission's primary service, with a time cost.
  const skill = Object.keys(r).find((k) => k !== "transport") || "medical";
  if ((s.environment?.wind ?? 0) >= 60)
    result.push(hazard("weather", skill, 20, 0.008));
  if ((s.environment?.visibility ?? 15000) < 1000)
    result.push(hazard("visibility", skill, 20, 0.005));
  const hour = new Date(s.time * 1000).getUTCHours();
  if (hour < 6 || hour >= 21) result.push(hazard("darkness", skill, 12, 0));
  return result;
}
export function hazardTick(s: Save, m: Mission, skills: Skills, dt: number) {
  const d = m.dynamics!;
  for (const h of d.hazards) {
    if (h.resolved) continue;
    let ratio = Math.min(2, (skills[h.skill] || 0) / h.required);
    if (h.kind === "fire") {
      const source = d.scenario?.requirements ?? mt(m.template).requirements;
      // A declared supply requirement is part of the actual extinguishing
      // operation, not a timer that can be skipped after the flames disappear.
      if (
        ["water", "foam"].some((key) => (source[key] || 0) > (skills[key] || 0))
      )
        ratio = 0;
    }
    const environment =
      h.kind === "fire"
        ? 1 +
          (s.environment?.wind ?? 0) / 150 -
          (s.environment?.rain ?? 0) / 250
        : h.kind === "water"
          ? 1 + (s.environment?.rain ?? 0) / 100
          : 1;
    const tactical =
      d.tactic === "defensive"
        ? h.kind === "collapse" || h.kind === "smoke"
          ? 1.4
          : 0.65
        : d.tactic === "rescue"
          ? 0.8
          : 1;
    h.value = clamp(
      h.value + dt * (h.growth * environment - h.reduction * ratio * tactical),
    );
    if (h.value <= 0.01) {
      h.value = 0;
      h.resolved = true;
      if (m.control?.briefed)
        record(s, m, "HAZARD_RESOLVED", `${hazardNames[h.kind]} beherrscht.`);
    }
  }
}
export function requirements(m: Mission): Skills {
  const r = taskRequirements(m);
  if (
    m.major &&
    (!m.major.sections.every((s) => s.done) ||
      m.major.evacuated < m.major.evacuees)
  )
    r.command = Math.max(r.command || 0, 1);
  if (!m.dynamics?.active) {
    for (const task of m.organization?.tasks || [])
      if (!task.done)
        r[taskSkills[task.kind]] = Math.max(r[taskSkills[task.kind]] || 0, 1);
    return r;
  }
  // Resolved hazards keep their persisted state. Only current hazards can add work.
  for (const h of m.dynamics.hazards)
    if (!h.resolved) r[h.skill] = Math.max(r[h.skill] || 0, h.required);
  for (const [k, n] of Object.entries(m.dynamics.extra))
    if (
      !(fireExtinguished(m) && ["fire", "water", "foam"].includes(k)) &&
      (!m.tasks ||
        !m.tasks.entries.some(
          (t) => t.id === `additional:${k}:${n}` && t.done,
        )) &&
      (!m.dynamics.hazards.some((h) => h.skill === k) ||
        m.dynamics.hazards.some((h) => h.skill === k && !h.resolved))
    )
      r[k] = Math.max(r[k] || 0, n);
  const waiting = m.dynamics.patients.filter(
    (p) => p.transport === "scene" && p.condition !== "dead",
  );
  if (!waiting.length && !m.major?.pending?.remaining) {
    delete r.medical;
    delete r.doctor;
    delete r.transport;
    delete r.intensive;
    delete r.medicalCommand;
  }
  if (waiting.length) {
    r.medical = Math.max(r.medical || 0, 2);
    r.transport = Math.max(r.transport || 0, 1);
  }
  if (waiting.some((p) => ["critical", "cpr"].includes(p.condition)))
    r.doctor = Math.max(r.doctor || 0, 1);
  for (const task of m.organization?.tasks || [])
    if (!task.done)
      r[taskSkills[task.kind]] = Math.max(r[taskSkills[task.kind]] || 0, 1);
  return r;
}
