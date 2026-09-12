import { configuredSkills } from "./vehicle-equipment";
import type { Save, Mission, Vehicle } from "../shared/model";
import { mt, type Skills } from "../shared/catalog";
import { requirements } from "./hazards";
import { effectiveSkills } from "./major-resources";

export const missionStatusLabels = {
  unassigned: "Keine Kräfte disponiert",
  partial: "Teilweise disponiert",
  alarmed: "Alarmiert",
  enroute: "Kräfte unterwegs",
  scene: "Kräfte an Einsatzstelle",
  report: "Lagemeldung ausstehend",
  reinforcement: "Nachforderung offen",
  stable: "Lage stabilisiert",
  transport: "Patiententransport",
  completed: "Abgeschlossen",
} as const;
type Code = keyof typeof missionStatusLabels;
type Support = { mission: string; round: string; vehicle: Vehicle };

/** Read-only presentation of facts already visible to this dispatch center.
 * No secret scenario, future RNG result, FMS override, or unalarmed AAO proposal
 * can turn into an operational vehicle state here. */
export function missionStatus(
  s: Save,
  m: Mission,
  support: readonly Support[] = [],
) {
  const c = m.control;
  const status = (code: Code, detail: string, attention = false) => ({
    code,
    label: missionStatusLabels[code],
    detail,
    attention,
  });
  if (m.phase === "done" || c?.stage === "closed")
    return status(
      "completed",
      "Einsatz abgeschlossen; vollständiger Verlauf im Archiv.",
    );
  const units = [
    ...new Map(
      [
        ...s.vehicles.filter((v) => v.mission === m.id),
        ...support
          .filter((f) => f.mission === m.id && f.round === m.round)
          .map((f) => f.vehicle),
      ]
        .filter((v) =>
          ["alarmed", "travel", "scene", "transport"].includes(v.status),
        )
        .map((v) => [v.id, v]),
    ).values(),
  ];
  const operational = units.filter(
    (v) => !v.fault || v.fault.state === "repaired",
  );
  const counts = { alarmed: 0, travel: 0, scene: 0, transport: 0 };
  for (const v of operational) counts[v.status as keyof typeof counts]++;
  const deployment = [
    counts.alarmed && `${counts.alarmed} alarmiert`,
    counts.travel && `${counts.travel} unterwegs`,
    counts.scene && `${counts.scene} vor Ort`,
    counts.transport && `${counts.transport} im Patiententransport`,
    units.length - operational.length &&
      `${units.length - operational.length} ausgefallen`,
  ]
    .filter(Boolean)
    .join(" · ");
  if (c?.radio.some((r) => r.state === "open" && r.reason === "request"))
    return status(
      "reinforcement",
      `Offene Nachforderung im Funk bearbeiten. ${deployment}`.trim(),
      true,
    );
  if (
    c?.radio.some((r) => r.state === "open" && r.reason === "arrival") ||
    (c?.stage === "recon" && !c.briefed)
  )
    return status(
      "report",
      `Erste Lagemeldung annehmen. ${deployment}`.trim(),
      true,
    );
  const revealed = !c || c.briefed;
  if (revealed && ["aftermath", "resolved"].includes(m.dynamics?.state ?? ""))
    return status(
      "stable",
      `Lage beherrscht; Nachkontrolle und gegebenenfalls Klinikübergaben laufen. ${deployment}`.trim(),
    );
  if (m.phase === "transport" || c?.stage === "transport" || counts.transport)
    return status(
      "transport",
      deployment || "Patienten werden zur Klinik gebracht.",
    );
  if (!operational.length)
    return status(
      "unassigned",
      units.length
        ? "Gebundene Fahrzeuge sind ausgefallen; Ersatzkräfte alarmieren."
        : c?.proposal
          ? "AAO-Vorschlag vorhanden; Fahrzeuge sind noch nicht alarmiert."
          : c?.stage === "incoming"
            ? "Notruf annehmen und Einsatzort erfragen."
            : c?.stage === "interview"
              ? "Notrufgespräch läuft; anschließend Kräfte alarmieren."
              : "Geeignete Fahrzeuge auswählen und alarmieren.",
      true,
    );
  // Before reconnaissance compare only the reported keyword, never m.template/secret.
  const need: Skills | undefined = revealed
    ? requirements(m)
    : c?.reportedTemplate
      ? mt(c.reportedTemplate).requirements
      : undefined;
  if (need) {
    const supplied: Skills = {};
    for (const v of operational)
      for (const [k, n] of Object.entries(
        v.status === "scene" && revealed
          ? effectiveSkills(m, v)
          : configuredSkills(v),
      ))
        supplied[k] = (supplied[k] || 0) + n;
    if (Object.entries(need).some(([k, n]) => (supplied[k] || 0) < n))
      return status(
        "partial",
        `Bekannte Anforderungen noch nicht vollständig disponiert. ${deployment}`,
        true,
      );
  }
  if (counts.scene) return status("scene", deployment);
  if (counts.travel) return status("enroute", deployment);
  return status(
    "alarmed",
    deployment || "Alarmierung läuft; Besatzung und Ausrücken abwarten.",
  );
}
