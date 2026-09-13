import type { Mission, Save } from "../shared/model";
import type { Incident } from "./schema";
import { record, simId } from "./events";
import { setFms } from "./fms";
import { urgentPriority } from "./priority";

/** One durable concern per semantic topic; vehicle changes do not duplicate it. */
export function request(
  s: Save,
  m: Mission,
  vehicle: string,
  reason: "arrival" | "request" | "question",
  details: string,
  priority: Incident["radio"][number]["priority"] = "NORMAL",
  topic = `${reason}:${details.slice(0, 140)}`,
) {
  const c = m.control!;
  const previous = c.radio.find((r) => r.topic === topic);
  if (
    previous &&
    previous.active !== false &&
    previous.details === details &&
    previous.priority === priority
  )
    return;
  if (previous) {
    Object.assign(previous, {
      vehicle,
      reason,
      details,
      priority,
      state: "open",
      active: true,
      answered: 0,
      version: (previous.version ?? 1) + 1,
    });
    delete previous.handling;
    delete previous.handledBy;
    delete previous.answer;
    delete previous.questioned;
  } else {
    if (c.radio.length >= 2000)
      throw Error(
        "Zu viele fachliche Funkanliegen; Einsatzdaten bleiben erhalten.",
      );
    c.radio.push({
      id: simId(s),
      vehicle,
      reason,
      priority,
      state: "open",
      active: true,
      version: 1,
      topic,
      created: s.time,
      answered: 0,
      details,
    });
  }
  record(s, m, "SPEAK_REQUESTED", details, "server", vehicle);
  const v = s.vehicles.find((v) => v.id === vehicle);
  if (v && (!v.fault || v.fault.state === "repaired"))
    setFms(s, v, urgentPriority(priority) ? 0 : 5);
}
export function resolveRadioTopic(
  s: Save,
  m: Mission,
  topic: string,
  detail: string,
) {
  const r = m.control?.radio.find(
    (r) => r.topic === topic && r.active !== false,
  );
  if (!r) return;
  r.active = false;
  r.state = "handled";
  r.answered ||= s.time;
  r.handledBy ??= "server";
  r.version = (r.version ?? 1) + 1;
  delete r.handling;
  record(s, m, "SPEAK_RESOLVED", detail, "server", r.vehicle);
}
