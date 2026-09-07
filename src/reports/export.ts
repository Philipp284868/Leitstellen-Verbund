import type { Mission } from "../model";
import { mt } from "../catalog";
import { buildReport } from "../simulation/reports";
export const timeLabels = {
  reaction: "Reaktionszeit",
  disposition: "Disposition bis Alarmierung",
  turnout: "Ausrückzeit",
  travel: "Erste Anfahrt",
  recon: "Erkundung bis Lagemeldung",
  work: "Arbeit bis erstem Transport / Abschluss",
  transport: "Erster Transport bis Abschluss",
  total: "Gesamteinsatzzeit",
};
export function reportDocument(m: Mission) {
  return {
    format: "leitstellen-einsatzbericht",
    version: 1,
    mission: m.id,
    title: mt(m.template).name,
    created: m.created,
    completed: m.completed,
    position: m.pos,
    report: m.report ?? buildReport(m),
    events: m.control?.events ?? [],
    calls: m.control?.calls ?? [],
    patients: m.dynamics?.patients ?? [],
    transports: m.transports,
  };
}
const cell = (v: unknown) => {
  let text = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
export function reportsCSV(missions: Mission[]) {
  const rows: unknown[][] = [
    [
      "Einsatz",
      "Meldebild",
      "Meldezeit",
      "Abschluss",
      "Dauer (s)",
      "Notrufe",
      "Nachforderungen",
      "Patienten übergeben",
      "Verstorben",
      "Eigene erfasste km",
      "Credits",
      "XP",
      "Erfassung",
    ],
  ];
  for (const m of missions) {
    const r = m.report ?? buildReport(m);
    rows.push([
      m.id,
      mt(m.template).name,
      m.created,
      m.completed,
      r.timings.total,
      r.calls,
      r.requests,
      r.patients.delivered,
      r.patients.dead,
      (r.meters / 1000).toFixed(3),
      r.credits,
      r.xp,
      r.partial ? "teilweise" : "vollständig",
    ]);
  }
  return "\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}
export function saveFile(
  name: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
