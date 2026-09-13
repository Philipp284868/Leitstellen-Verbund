import type { Save } from "./model";
import {
  PRE_RECON_EVENTS,
  visibleRadioConcern,
} from "../simulation/incident-visibility";

export type GameEvent = {
  id: string;
  at: number;
  sender: string;
  type: string;
  priority: "normal" | "important" | "critical";
  text: string;
  mission?: string;
  unresolved?: boolean;
  count?: number;
  local?: boolean;
  connection?: boolean;
  incidentRadio?: boolean;
  version?: number;
};
/** One projection for live UI and durable server history; never exposes an entire save. */
export function projectEvents(s: Save): GameEvent[] {
  const out: GameEvent[] = [],
    eventTypes = new Map<string, string>(),
    hidden = new Set<string>(),
    fmsIds = new Map<string, string>();
  for (const m of [...s.missions, ...s.archive]) {
    const earned =
      m.xpPolicy?.awarded[`owner:${s.player.id}`] ??
      m.xpPolicy?.awarded[`helper:${s.player.id}`];
    if (m.phase === "done" && earned !== undefined)
      out.push({
        id: `completed:${m.id}:${s.player.id}`,
        at: m.completed,
        sender: "Leitstelle",
        type: "Abschluss",
        priority: "normal",
        mission: m.id,
        text: `Einsatz beendet · +${earned.toLocaleString("de-DE")} XP`,
      });
    const summary = m.control?.radioSummary;
    if (summary)
      out.push({
        id: summary.id,
        at: summary.at,
        sender: summary.sender,
        type: "Funk",
        text: summary.text,
        priority:
          summary.priority >= 100
            ? "critical"
            : summary.priority >= 80
              ? "important"
              : "normal",
        mission: m.id,
        unresolved: summary.unresolved,
        incidentRadio: true,
        version: summary.version,
      });
    const beforeReport = !!m.control && !m.control.briefed && !m.control.legacy;
    if (beforeReport) hidden.add(m.id);
    for (const e of m.control?.events ?? []) {
      eventTypes.set(e.id, e.type);
      if (e.type === "FMS_CHANGED")
        fmsIds.set(`${m.id}:${e.at}:${e.vehicle}:${e.text}`, e.id);
    }
    for (const r of m.control?.radio ?? [])
      if (!summary && visibleRadioConcern(!beforeReport, r))
        out.push({
          id: r.id,
          at: r.created,
          sender:
            s.vehicles.find((v) => v.id === r.vehicle)?.name ?? "Einsatzmittel",
          type: "Sprechwunsch",
          priority: r.priority === "NOTFALL" ? "critical" : "important",
          text:
            beforeReport && r.reason === "arrival"
              ? "Erste Erkundung abgeschlossen. Lagemeldung liegt vor."
              : r.details,
          mission: m.id,
          unresolved: r.state === "open",
        });
    for (const e of (m.control?.events ?? []).slice(-150)) {
      if (
        summary &&
        /^(FMS_|VEHICLE_|FAULT_|MISSION_|PATIENT_|TRANSPORT_|REPORT_|AID_FMS|TURNOUT_|WATER_)/.test(
          e.type,
        )
      )
        continue;
      if (beforeReport && !PRE_RECON_EVENTS.has(e.type)) continue;
      if (
        [
          "SPEAK_REQUESTED",
          "SPEAK_HANDLED",
          "REPORT_RECEIVED",
          "AID_FMS",
        ].includes(e.type)
      )
        continue;
      if (
        !/^(FMS_|VEHICLE_|FAULT_|MISSION_|PATIENT_|TRANSPORT_|REPORT_|CALL_RECEIVED|DISPATCH|ALARM|AID_|CAMPAIGN)/.test(
          e.type,
        )
      )
        continue;
      out.push({
        id: e.id,
        at: e.at,
        sender: e.vehicle
          ? (s.vehicles.find((v) => v.id === e.vehicle)?.name ??
            "Einsatzmittel")
          : "System",
        type: e.type.startsWith("CALL") ? "Notruf" : "Einsatz",
        priority: /FAULT|FAILED/.test(e.type) ? "important" : "normal",
        text: e.text,
        mission: m.id,
      });
    }
  }
  for (const e of s.radioNetwork?.entries ?? []) {
    if (e.supersededBy) continue;
    if (e.consolidated) {
      if (!out.some((x) => x.id === e.id))
        out.push({
          id: e.id,
          at: e.created,
          sender: e.sender,
          type: "Funk",
          text: e.text,
          priority:
            e.priority >= 100
              ? "critical"
              : e.priority >= 80
                ? "important"
                : "normal",
          mission: e.mission,
          unresolved: e.unresolved,
          incidentRadio: true,
          version: e.contentVersion,
        });
      continue;
    }
    const source = e.id.replace(/^tx:/, ""),
      type = eventTypes.get(source),
      fms = fmsIds.get(`${e.mission}:${e.created}:${e.vehicle}:${e.text}`);
    if (
      e.state === "queued" ||
      type === "SPEAK_REQUESTED" ||
      (hidden.has(e.mission) && !fms && (!type || !PRE_RECON_EVENTS.has(type)))
    )
      continue;
    out.push({
      id: fms ?? source,
      at: e.created,
      sender: e.sender,
      type: "Funk",
      priority:
        e.priority >= 100
          ? "critical"
          : e.priority >= 80
            ? "important"
            : "normal",
      text: e.text,
      mission: e.mission || undefined,
    });
  }
  for (const j of s.journal.slice(0, 100))
    out.push({
      id: `money:${j.id}`,
      at: j.at,
      sender: "System",
      type: j.amount < 0 ? "Ausgabe" : "Vergütung",
      priority: "normal",
      text: j.text,
    });
  return [...new Map(out.map((e) => [e.id, e])).values()].sort(
    (a, b) => a.at - b.at || a.id.localeCompare(b.id),
  );
}
