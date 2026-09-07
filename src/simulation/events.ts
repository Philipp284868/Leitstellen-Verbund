import type { z } from "zod";
import type { eventSchema } from "./schema";
import type { Save, Mission } from "../model";
import { telemetry } from "./reports";
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
  return event;
}
export function writable(m: Mission) {
  if (m.control && m.control.events.length > 15000)
    throw Error(
      "Die maximale Zahl manueller Vorgänge für diesen Einsatz ist erreicht.",
    );
}
