import type { Mission, Save } from "../model";
import { mt, type Skills } from "../catalog";
import type { MissionTaskState } from "./mission-task-schema";
import { record } from "./events";

const fireResources = new Set(["fire", "water", "foam"]);
const patientResources = new Set([
  "medical",
  "doctor",
  "transport",
  "intensive",
  "medicalCommand",
]);
export function fireExtinguished(m: Mission) {
  const d = m.dynamics;
  return (
    !!d?.fire &&
    (d.fire.extinguishedAt !== undefined ||
      d.hazards.some((h) => h.kind === "fire" && h.resolved && h.value === 0))
  );
}
function patientsPrepared(m: Mission) {
  return (
    !m.major?.pending?.remaining &&
    !!m.dynamics &&
    m.dynamics.patients.every(
      (p) =>
        p.condition === "dead" ||
        p.transport !== "scene" ||
        (p.health >= 55 && p.treatment >= 80),
    )
  );
}
function physicalTaskDone(m: Mission, skill: string) {
  if (m.dynamics?.fire && fireResources.has(skill)) return fireExtinguished(m);
  // Readiness must precede boarding: the existing transport phase starts only
  // after the scene tasks finish. Ongoing care is enforced separately below.
  if (m.dynamics?.active && patientResources.has(skill))
    return patientsPrepared(m);
  const hazards = m.dynamics?.hazards.filter((h) => h.skill === skill) ?? [];
  return hazards.length > 0 && hazards.every((h) => h.resolved);
}
function task(
  id: string,
  skill: string,
  required: number,
  seconds: number,
  progress = 0,
) {
  return {
    id,
    skill,
    required,
    seconds,
    progress: Math.min(seconds, progress),
    done: false,
    completedAt: 0,
  };
}
/** Additive, idempotent upgrade: retain earned work and already-resolved physical states. */
export function ensureMissionTasks(s: Save, m: Mission): MissionTaskState {
  if (m.tasks) return m.tasks;
  const source =
    m.dynamics?.scenario?.requirements ?? mt(m.template).requirements;
  const entries = Object.entries(source).map(([skill, required]) => {
    const entry = task(
      `capability:${skill}`,
      skill,
      required,
      mt(m.template).seconds,
      m.progress,
    );
    if (m.phase === "done" || physicalTaskDone(m, skill)) {
      entry.done = true;
      entry.progress = entry.seconds;
      entry.completedAt = m.completed || s.time;
    }
    return entry;
  });
  if (m.dynamics?.fire) {
    const aftercare = task("fire-aftercare", "fire", 1, 15);
    if (
      m.phase === "done" ||
      (m.dynamics.aftermath > 0 && m.dynamics.aftermath <= s.time)
    ) {
      aftercare.done = true;
      aftercare.progress = 15;
      aftercare.completedAt = m.completed || m.dynamics.aftermath;
    }
    entries.push(aftercare);
  }
  m.tasks = { version: 1, initializedAt: s.time, entries };
  return m.tasks;
}

export function taskTick(s: Save, m: Mission, skills: Skills, dt: number) {
  const state = ensureMissionTasks(s, m);
  if (m.control && !m.control.briefed) return;
  // Extra physical hazards already have their own durable completion state.
  // A newly requested capability without a matching hazard needs real work too.
  for (const [skill, required] of Object.entries(m.dynamics?.extra ?? {})) {
    if (m.dynamics?.hazards.some((h) => h.skill === skill)) continue;
    const id = `additional:${skill}:${required}`;
    if (!state.entries.some((entry) => entry.id === id))
      state.entries.push(task(id, skill, required, 20));
  }
  for (const entry of state.entries) {
    if (entry.done) continue;
    const aftercare = entry.id === "fire-aftercare";
    if (
      aftercare &&
      (!fireExtinguished(m) ||
        m.dynamics?.hazards.some(
          (h) => ["fire", "smoke", "heat"].includes(h.kind) && !h.resolved,
        ))
    )
      continue;
    if ((skills[entry.skill] ?? 0) >= entry.required)
      entry.progress = Math.min(entry.seconds, entry.progress + dt);
    const hasHazard = m.dynamics?.hazards.some((h) => h.skill === entry.skill);
    const physical = physicalTaskDone(m, entry.skill);
    const complete = aftercare
      ? entry.progress >= entry.seconds
      : physical ||
        (!hasHazard &&
          !(m.dynamics?.active && patientResources.has(entry.skill)) &&
          entry.progress >= entry.seconds);
    if (!complete) continue;
    entry.done = true;
    entry.progress = entry.seconds;
    entry.completedAt = s.time;
    record(
      s,
      m,
      "MISSION_TASK_COMPLETED",
      aftercare
        ? "Brandnachkontrolle abgeschlossen."
        : `Aufgabe ${entry.skill} abgeschlossen.`,
    );
  }
}
export function taskRequirements(m: Mission): Skills {
  if (!m.tasks)
    return {
      ...(m.dynamics?.scenario?.requirements ?? mt(m.template).requirements),
    };
  const required: Skills = {};
  for (const task of m.tasks.entries)
    if (!task.done && !(task.id === "fire-aftercare" && !fireExtinguished(m)))
      required[task.skill] = Math.max(required[task.skill] ?? 0, task.required);
  return required;
}
export function tasksComplete(m: Mission) {
  return (
    !m.dynamics?.active ||
    !m.tasks ||
    m.tasks.entries.every((task) => task.done)
  );
}
