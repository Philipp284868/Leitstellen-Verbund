import type { z } from "zod";
import type { eventSchema } from "./schema";
import type { Save, Mission } from "../model";
import { telemetry } from "./reports";
import { transmit } from "./transmissions";
export const simId = (s: Save) => `${s.generation}-${++s.desk.sequence}`;
export function record(
  s: Save,
  m: Mission,
  type: string,
  text: string,
  actor = "server",
  vehicle = "",
) {
  if (!m.control) return;
  telemetry(s, m);
  const event: z.infer<typeof eventSchema> = {
    id: simId(s),
    at: s.time,
    type,
    text: text.length > 600 ? text.slice(0, 597) + "…" : text,
    actor,
    vehicle,
  };
  const assignment = s.vehicles.find((v) => v.id === vehicle)?.assignment;
  if (assignment) event.assignment = assignment;
  m.control.events.push(event);
  if (
    ["SPEAK_REQUESTED", "SPEAK_HANDLED", "REPORT_RECEIVED", "AID_FMS"].includes(
      type,
    )
  ) {
    const unit = s.vehicles.find((v) => v.id === vehicle);
    const request =
      type === "SPEAK_REQUESTED" ? m.control.radio.at(-1) : undefined;
    transmit(s, {
      id: `tx:${event.id}`,
      channel:
        s.desk.fleet[vehicle]?.channel ||
        (type === "AID_FMS" ? "Nachbarfunk" : "Leitstelle"),
      sender: unit?.name || (vehicle ? "Unterstützung" : "Leitstelle"),
      vehicle,
      mission: m.id,
      text: event.text,
      priority:
        request?.priority === "NOTFALL"
          ? 100
          : request && request.priority !== "NORMAL"
            ? 80
            : 50,
    });
  }
  return event;
}
export function writable(m: Mission) {
  if (m.control && m.control.events.length > 15000)
    throw Error(
      "Die maximale Zahl manueller Vorgänge für diesen Einsatz ist erreicht.",
    );
}
