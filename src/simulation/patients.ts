import type { Mission, Save, Vehicle } from "../model";
import { vt, type Skills } from "../catalog";
import type { Patient } from "./dynamics-schema";
import { clamp, sample } from "./random";
import { simId, record } from "./events";
export const conditionNames = {
  stable: "Stabil",
  deteriorating: "Verschlechternd",
  critical: "Kritisch",
  cpr: "Reanimation",
  recovering: "Stabilisiert",
  dead: "Verstorben",
};
export const careNames = {
  standard: "Erstversorgung",
  oxygen: "Atemunterstützung",
  bleeding: "Blutstillung / Schockversorgung",
  cpr: "Reanimationsmaßnahmen",
  temperature: "Wärme- / Kälteschutz",
};
export function newPatient(
  s: Save,
  m: Mission,
  injury = "Medizinischer Notfall",
): Patient {
  const n = m.dynamics?.patients.length || 0,
    seed = m.control?.secret?.seed ?? s.seed;
  return {
    id: simId(s),
    age: 8 + Math.floor(sample(seed, "age", n) * 80),
    sex: sample(seed, "sex", n) < 0.5 ? "weiblich" : "männlich",
    condition: "stable",
    health: 80,
    consciousness: "wach",
    breathing: 18,
    pulse: 85,
    systolic: 120,
    oxygen: 97,
    temperature: 37,
    pain: 3,
    bloodLoss: 0,
    injury,
    treatment: 0,
    prognosis: 80,
    priority: "normal",
    care: "standard",
    cprCycles: 0,
    nextCpr: 0,
    transport: "scene",
    vehicle: "",
    history: [
      {
        at: s.time,
        text: "Erstmeldung: medizinische Hilfe erforderlich. Befund nach Erkundung.",
      },
    ],
  };
}
function note(s: Save, m: Mission, p: Patient, text: string) {
  p.history.push({ at: s.time, text });
  p.history = p.history.slice(-100);
  record(s, m, "PATIENT_CHANGED", `${p.id.slice(-6)}: ${text}`);
}
export function patientTick(
  s: Save,
  m: Mission,
  skills: Skills,
  dt: number,
  carriers: Record<string, Skills> = {},
) {
  const d = m.dynamics!;
  let medical = skills.medical || 0;
  const order = [...d.patients].sort(
    (a, b) =>
      Number(b.priority === "urgent") - Number(a.priority === "urgent") ||
      a.health - b.health ||
      a.id.localeCompare(b.id),
  );
  for (const p of order) {
    if (p.transport === "delivered" || p.condition === "dead") continue;
    const previous = p.condition;
    const carrier =
      p.transport === "aboard"
        ? s.vehicles.find((v) => v.id === p.vehicle)
        : undefined;
    const transportSkills = carrier
      ? vt(carrier.type).skills
      : carriers[p.vehicle];
    const care =
      p.transport === "aboard"
        ? transportSkills?.medical || 0
        : Math.min(p.health >= 85 && p.treatment >= 80 ? 0.2 : 2, medical);
    if (p.transport !== "aboard") medical = Math.max(0, medical - care);
    const doctor =
      p.transport === "aboard"
        ? transportSkills?.doctor || 0
        : skills.doctor || 0;
    const smoke = p.transport === "scene" ? (d.fire?.smoke || 0) / 1500 : 0;
    const protection = d.tactic === "rescue" ? 1.2 : 1;
    const bonus =
      (p.care === "oxygen" && (smoke > 0 || p.oxygen < 94)) ||
      (p.care === "bleeding" && p.bloodLoss > 10) ||
      (p.care === "temperature" && Math.abs(p.temperature - 37) > 1)
        ? 1.3
        : 1;
    if (p.health <= 12 || p.condition === "cpr") {
      p.condition = "cpr";
      if (!p.nextCpr) p.nextCpr = s.time + 30;
      if (s.time >= p.nextCpr) {
        p.nextCpr = s.time + 30;
        p.cprCycles++;
        const chance =
          care >= 2 ? (doctor ? 0.75 : p.care === "cpr" ? 0.5 : 0.25) : 0;
        if (sample(d.random || 0, `cpr-${p.id}`, p.cprCycles) < chance) {
          p.health = 45;
          p.condition = "recovering";
          p.nextCpr = 0;
          note(
            s,
            m,
            p,
            "Kreislauf wiederhergestellt (ROSC); weitere Stabilisierung erforderlich.",
          );
        } else if (p.cprCycles >= 4) {
          p.health = 0;
          p.condition = "dead";
          p.transport = p.transport === "aboard" ? "aboard" : "none";
          note(s, m, p, "Reanimation ohne Erfolg beendet; Tod dokumentiert.");
        } else
          note(
            s,
            m,
            p,
            `Reanimationszyklus ${p.cprCycles} ohne Stabilisierung.`,
          );
      }
    } else {
      const severe = p.health < 35;
      p.health = clamp(
        p.health +
          dt *
            (care * (severe && !doctor ? 0.01 : 0.32) * bonus * protection +
              doctor * 0.12 -
              0.025 -
              smoke),
      );
      p.treatment = clamp(
        p.treatment + dt * care * (severe && !doctor ? 0.03 : 1.4),
      );
      p.condition =
        p.health <= 12
          ? "cpr"
          : p.health < 35
            ? "critical"
            : p.health < 65
              ? "deteriorating"
              : care > 0 && p.treatment >= 80
                ? "recovering"
                : "stable";
    }
    p.consciousness =
      p.health < 35 ? "bewusstlos" : p.health < 65 ? "eingetrübt" : "wach";
    p.pulse =
      p.condition === "dead" || p.condition === "cpr"
        ? 0
        : Math.round(80 + (100 - p.health) * 0.8);
    p.breathing = p.pulse ? Math.round(16 + (100 - p.health) * 0.2) : 0;
    p.systolic = p.pulse ? Math.round(70 + p.health * 0.6) : 0;
    p.oxygen = p.pulse ? Math.round(70 + p.health * 0.28) : 0;
    p.pain = Math.min(10, Math.round((100 - p.health) / 10));
    p.bloodLoss = clamp(
      p.bloodLoss +
        dt * (p.injury.includes("Verletzung") ? 0.01 : 0) -
        dt * (p.care === "bleeding" ? care * 0.2 : 0),
    );
    const ambient = s.environment?.temperature || 15;
    p.temperature = Math.max(
      30,
      Math.min(
        41,
        p.temperature +
          dt *
            (care
              ? (37 - p.temperature) * 0.02
              : ambient > 30
                ? 0.0006
                : ambient < 0
                  ? -0.0006
                  : 0),
      ),
    );
    p.prognosis = Math.round(p.health);
    if (previous !== p.condition) note(s, m, p, conditionNames[p.condition]);
  }
}
export function patientsReady(m: Mission) {
  return (
    !m.dynamics?.active ||
    m.dynamics.patients.every(
      (p) =>
        p.condition === "dead" ||
        p.transport !== "scene" ||
        (p.health >= 55 && p.treatment >= 80),
    )
  );
}
export function patientSeats(m: Mission) {
  return m.dynamics?.active
    ? m.dynamics.patients.filter((p) => p.transport !== "none").length
    : undefined;
}
export function boardPatients(s: Save, m: Mission, v: Vehicle, count: number) {
  if (!m.dynamics?.active) return;
  for (const p of m.dynamics.patients
    .filter((p) => p.transport === "scene" && p.condition !== "dead")
    .sort(
      (a, b) =>
        Number(b.priority === "urgent") - Number(a.priority === "urgent") ||
        a.health - b.health,
    )
    .slice(0, count)) {
    p.transport = "aboard";
    p.vehicle = v.id;
    note(s, m, p, `Transport mit ${v.name} begonnen.`);
  }
}
export function deliverPatients(s: Save, m: Mission, v: Vehicle) {
  for (const p of m.dynamics?.patients.filter(
    (p) => p.vehicle === v.id && p.transport === "aboard",
  ) || []) {
    p.transport = "delivered";
    note(s, m, p, `Im Krankenhaus übergeben (${v.name}).`);
  }
}
