import { bt, vehicles, type Skills, type Template } from "../shared/catalog";
import { configuredSkills } from "./vehicle-equipment";
import { level, type Save } from "../shared/model";

/** Strategic fleet capacity, including units temporarily busy with another call. */
export function fleetCapabilities(s: Save): Skills {
  const result: Skills = {};
  for (const v of s.vehicles)
    for (const [skill, amount] of Object.entries(configuredSkills(v)))
      result[skill] = (result[skill] || 0) + amount;
  return result;
}

/** Include hidden initial needs; callers may still describe an incomplete picture. */
export function generationRequirements(t: Template): Skills {
  const result = { ...(t.profile?.requirements ?? t.requirements) };
  const need = (skill: string, amount = 1) => {
    result[skill] = Math.max(result[skill] || 0, amount);
  };
  for (const h of t.profile?.hazards ?? []) need(h.skill, h.required);
  if ((t.profile?.patientCount ?? t.patients) > 0) {
    need("medical", 2);
    need("transport");
    if ((t.profile?.patient.health ?? 80) < 35) need("doctor");
    if (t.profile?.patient.intensive) need("intensive");
  }
  if (result.crowd) need("police");
  if (["collapse", "rail"].includes(t.id)) need("logistics");
  if (t.profile?.major) need("command");
  return result;
}

/** New consequences cannot demand a service that cannot yet be acquired. */
export function capabilitiesUnlocked(s: Save, required: Skills) {
  const current = level(s);
  return Object.keys(required).every((skill) =>
    vehicles.some(
      (v) =>
        v.level <= current &&
        bt(v.home).level <= current &&
        (v.skills[skill] || 0) > 0,
    ),
  );
}

export function canGenerate(
  s: Save,
  t: Template,
  available = fleetCapabilities(s),
) {
  const required = generationRequirements(t);
  return (
    t.level <= level(s) &&
    capabilitiesUnlocked(s, required) &&
    Object.entries(required).every(
      ([skill, amount]) => (available[skill] || 0) >= amount,
    )
  );
}
