import type { Save, Mission } from "../shared/model";
import { record } from "./events";
import { orderReturn } from "./return-orders";
import { telemetry } from "./reports";
export const outcomeLabels = {
  success: "Erfolgreich",
  failed: "Fehlgeschlagen",
  abandoned: "Aufgegeben",
} as const;
export const unsuccessful = (m: Mission) =>
  !!m.outcome && m.outcome.result !== "success";
/** Abstrahierte Abwicklung in Echtzeit, keine garantierten realen Anfahrtszeiten. */
export const EXTERNAL_SETTLEMENT = {
  arrivalSeconds: 180,
  handoverSeconds: 480,
} as const;
/** Explicit primary rescue scenarios; optional harm or a single death in a mass casualty is not a defeat. */
export const mandatoryRescueScenarios = [
  "reanimation",
  "bewusstlose-person",
] as const;
export function endIncident(
  s: Save,
  m: Mission,
  result: "failed" | "abandoned",
  actor: string,
  reason: string,
) {
  if (!s.missions.includes(m)) throw Error("Eigener laufender Einsatz fehlt.");
  if (m.outcome || m.phase === "done") return;
  const patients = (m.dynamics?.patients ?? [])
    .filter((p) => p.transport === "scene")
    .map((p) => p.id);
  m.outcome = {
    result,
    actor,
    reason,
    at: s.time,
    trigger: result === "abandoned" ? "player" : "mandatory-rescue",
    settlement: {
      state: "mobilizing",
      arrival: s.time + EXTERNAL_SETTLEMENT.arrivalSeconds,
      handover: s.time + EXTERNAL_SETTLEMENT.handoverSeconds,
      patients,
    },
  };
  if (m.control) {
    delete m.control.proposal;
    for (const call of m.control.calls)
      if (call.state !== "ended") {
        if (call.state === "active") call.duration += s.time - call.started;
        call.state = "ended";
        call.ended = s.time;
      }
  }
  const measured = telemetry(s, m);
  measured.credits ??= 0;
  measured.xp ??= 0;
  record(
    s,
    m,
    "MISSION_OUTCOME",
    `${outcomeLabels[result]}: ${reason} Externe Abwicklung angefordert; noch keine Patientenübergabe.`,
    actor,
  );
  for (const v of s.vehicles.filter((v) => v.mission === m.id))
    orderReturn(s, v, actor);
}
export function outcomeTick(s: Save, m: Mission) {
  if (m.phase === "done") return;
  if (
    !m.outcome &&
    m.control?.briefed &&
    m.dynamics?.active &&
    mandatoryRescueScenarios.some(
      (id) => m.template === id || m.template.startsWith(`case-${id}-`),
    )
  ) {
    const patients = m.dynamics.patients.filter(
      (p) => !m.dynamics!.responders?.some((r) => r.patient === p.id),
    );
    if (
      patients.length &&
      patients.every((p) => p.condition === "dead") &&
      !m.control.events.some((e) => e.type === "FALSE_ALARM_CONFIRMED")
    )
      endIncident(
        s,
        m,
        "failed",
        "server",
        "Zwingendes Rettungsziel endgültig unerreichbar: Alle zu rettenden Patienten dieses medizinischen Szenarios sind verstorben.",
      );
  }
  if (!unsuccessful(m)) return;
  const settlement = m.outcome!.settlement!;
  if (settlement.state === "mobilizing" && s.time >= settlement.arrival) {
    settlement.state = "on-scene";
    record(
      s,
      m,
      "EXTERNAL_SETTLEMENT_ARRIVED",
      "Abstrahierte externe Abwicklung an der unveränderten Einsatzstelle eingetroffen; Übernahme der dokumentierten Personen läuft.",
    );
  }
  if (settlement.state === "on-scene" && s.time >= settlement.handover) {
    settlement.state = "accepted";
    for (const p of m.dynamics?.patients ?? [])
      if (settlement.patients.includes(p.id) && p.transport === "scene") {
        p.transport = "external";
        p.history.push({
          at: s.time,
          text: "Am Einsatzort extern übernommen. Nicht durch die Spielerleitstelle erfolgreich versorgt; keine Klinikübergabe gebucht.",
        });
        p.history = p.history.slice(-100);
      }
    record(
      s,
      m,
      "EXTERNAL_SETTLEMENT_ACCEPTED",
      "Externe Abwicklung übernimmt die unveränderte Szene und dokumentierte offene Personen. Keine Spielerbelohnung und keine fiktive Klinikübergabe.",
    );
  }
  if (
    settlement.state === "accepted" &&
    !m.transports.some((t) => t.status === "ordered") &&
    !s.vehicles.some((v) => v.mission === m.id && v.patients > 0)
  ) {
    m.phase = "done";
    m.completed = s.time;
    if (s.callPacing)
      s.callPacing.notBefore = Math.max(s.callPacing.notBefore, s.time + 45);
  }
}
