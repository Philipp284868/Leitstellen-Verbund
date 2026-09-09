import type { Save } from "../model";
import type { Transmission } from "./transmission-schema";

export const RADIO_POLICY = {
  expiry: 180,
  aging: 60,
  pending: 160,
  retained: 2000,
} as const;
export function radioNetwork(s: Save) {
  return (s.radioNetwork ??= { version: 1, sequence: 0, entries: [] });
}
export function compareTransmissions(
  a: Transmission,
  b: Transmission,
  at: number,
) {
  const agedA = at - a.created >= RADIO_POLICY.aging;
  const agedB = at - b.created >= RADIO_POLICY.aging;
  return (
    Number(b.state === "transmitting") - Number(a.state === "transmitting") ||
    Number(agedB) - Number(agedA) ||
    (agedA && agedB ? 0 : b.priority - a.priority) ||
    a.sequence - b.sequence
  );
}
function transition(
  entry: Transmission,
  at: number,
  state: Transmission["state"],
  reason: string,
) {
  entry.state = state;
  entry.history.push({ at, state, reason });
  entry.history = entry.history.slice(-8);
}
/** Each centre owns its channels. No browser acknowledgement can lock a channel. */
export function advanceRadio(s: Save) {
  const network = radioNetwork(s);
  for (const entry of network.entries) {
    if (entry.state === "transmitting" && entry.ends! <= s.time)
      transition(entry, entry.ends!, "delivered", "Übertragung beendet");
    if (
      entry.state === "queued" &&
      s.time - entry.created > RADIO_POLICY.expiry
    )
      transition(
        entry,
        s.time,
        "missed",
        "Zeitfenster abgelaufen; im Funkverlauf erneut abrufbar",
      );
  }
  const channels = new Set(
    network.entries.filter((e) => e.state === "queued").map((e) => e.channel),
  );
  for (const channel of channels) {
    const queued = network.entries
      .filter((e) => e.channel === channel && e.state === "queued")
      .sort((a, b) => compareTransmissions(a, b, s.time));
    const next = queued[0];
    const active = network.entries.find(
      (e) => e.channel === channel && e.state === "transmitting",
    );
    if (active) {
      if (
        next.priority < 100 ||
        active.priority >= 100 ||
        active.interrupted ||
        s.time - active.created >= RADIO_POLICY.aging
      )
        continue;
      active.interrupted = true;
      transition(
        active,
        s.time,
        "queued",
        "Durch Notfall unterbrochen; Meldung bleibt erhalten",
      );
      delete active.ends;
    }
    next.started = s.time;
    next.ends = s.time + next.seconds;
    transition(
      next,
      s.time,
      "transmitting",
      next.interrupted ? "Unterbrochene Meldung wiederholt" : "Kanal zugeteilt",
    );
  }
}
export function transmit(
  s: Save,
  input: Pick<
    Transmission,
    "id" | "channel" | "sender" | "vehicle" | "mission" | "text" | "priority"
  >,
) {
  const network = radioNetwork(s);
  if (network.entries.some((e) => e.id === input.id)) return;
  advanceRadio(s);
  const overloaded =
    network.entries.filter((e) => e.state === "queued").length >=
    RADIO_POLICY.pending;
  const entry: Transmission = {
    ...input,
    text: input.text.slice(0, 600),
    sequence: ++network.sequence,
    created: s.time,
    seconds: Math.max(2, Math.min(30, 1.5 + input.text.length / 14)),
    state: overloaded ? "missed" : "queued",
    interrupted: false,
    history: [],
  };
  transition(
    entry,
    s.time,
    entry.state,
    overloaded
      ? "Kanal überlastet; Meldung im Verlauf erhalten"
      : "Zur Übertragung vorgemerkt",
  );
  network.entries.push(entry);
  // Never evict an active or waiting message to make room for historical records.
  while (network.entries.length > RADIO_POLICY.retained) {
    const index = network.entries.findIndex(
      (e) => e.state === "delivered" || e.state === "missed",
    );
    if (index < 0) break;
    network.entries.splice(index, 1);
  }
  advanceRadio(s);
}
