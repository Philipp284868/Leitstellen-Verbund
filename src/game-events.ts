import type { Save } from "./model";

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
};
/** One projection for live UI and durable server history; never exposes an entire save. */
export function projectEvents(s: Save): GameEvent[] {
  const out: GameEvent[] = [],
    eventTypes = new Map<string, string>();
  for (const m of [...s.missions, ...s.archive]) {
    for (const e of m.control?.events ?? []) eventTypes.set(e.id, e.type);
    for (const r of m.control?.radio ?? [])
      out.push({
        id: r.id,
        at: r.created,
        sender:
          s.vehicles.find((v) => v.id === r.vehicle)?.name ?? "Einsatzmittel",
        type: "Sprechwunsch",
        priority: r.priority === "NOTFALL" ? "critical" : "important",
        text: r.details,
        mission: m.id,
        unresolved: r.state === "open",
      });
    for (const e of (m.control?.events ?? []).slice(-150)) {
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
    if (
      e.state === "queued" ||
      eventTypes.get(e.id.replace(/^tx:/, "")) === "SPEAK_REQUESTED"
    )
      continue;
    out.push({
      id: e.id,
      at: e.started ?? e.created,
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
  return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
