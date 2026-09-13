import { useSyncExternalStore } from "react";
import { projectEvents, type GameEvent } from "../shared/game-events";
import type { Save } from "../shared/model";
import { gameToasts } from "./toast-queue";
const listeners = new Set<() => void>();
let entries: GameEvent[] = [],
  owner = "",
  serial = 0;
let baseline = true;
export function suppressEventReplay() {
  baseline = true;
}
export function eventSnapshot() {
  return entries;
}
export function mergeEvents(incoming: GameEvent[], complete = false) {
  const known = new Set(entries.map((e) => e.id));
  if (!baseline)
    for (const e of incoming) {
      if (
        known.has(e.id) ||
        (!e.local &&
          !e.incidentRadio &&
          !["Notruf", "Abschluss"].includes(e.type))
      )
        continue;
      gameToasts.add({
        id: e.id,
        text: e.connection ? "Serververbindung verloren" : e.text,
        priority: e.priority,
        group: e.incidentRadio
          ? `incident:${e.mission}`
          : e.type === "Notruf"
            ? `call:${e.mission}`
            : undefined,
      });
    }
  const consolidated = new Set(
    [...incoming, ...entries]
      .filter((e) => e.incidentRadio)
      .map((e) => e.mission),
  );
  const merged = new Map(
    entries
      .filter(
        (e) =>
          e.id !== "local:overflow" &&
          !(
            consolidated.has(e.mission) &&
            !e.incidentRadio &&
            ["Funk", "Sprechwunsch", "Einsatz"].includes(e.type)
          ),
      )
      .map((e) => [e.id, e]),
  );
  for (const e of incoming)
    if (
      !(
        consolidated.has(e.mission) &&
        !e.incidentRadio &&
        ["Funk", "Sprechwunsch", "Einsatz"].includes(e.type)
      )
    )
      merged.set(e.id, e);
  const all = [...merged.values()].sort(
    (a, b) => a.at - b.at || a.id.localeCompare(b.id),
  );
  const unresolved = all
    .filter((e) => e.unresolved)
    .sort(
      (a, b) =>
        Number(!!b.connection) - Number(!!a.connection) ||
        Number(b.priority === "critical") - Number(a.priority === "critical") ||
        b.at - a.at,
    );
  const pinned = unresolved.slice(0, 1000);
  if (
    unresolved.length > 1000 ||
    (!complete && entries.some((e) => e.id === "local:overflow"))
  )
    pinned.push({
      id: "local:overflow",
      at: all.at(-1)!.at,
      sender: "System",
      type: "Offene Meldungen",
      priority: "critical",
      unresolved: true,
      text: "Weitere offene Meldungen. Im Einsatz bearbeiten oder in den Einsatzdetails prüfen.",
    });
  const recent = all.filter((e) => !e.unresolved).slice(-600);
  entries = [...pinned, ...recent].sort(
    (a, b) => a.at - b.at || a.id.localeCompare(b.id),
  );
  listeners.forEach((f) => f());
}
export function observeEvents(save: Save, external: GameEvent[] = []) {
  if (owner !== save.player.id + save.generation) {
    owner = save.player.id + save.generation;
    entries = [];
    baseline = true;
  }
  mergeEvents([...projectEvents(save), ...external], true);
  baseline = false;
}
export function localEvent(
  text: string,
  type = "System",
  critical = false,
  connection = false,
) {
  if (!text) return;
  const at = Date.now() / 1000;
  const last = [...entries]
    .reverse()
    .find((e) => e.local && e.text === text && at - e.at < 30);
  mergeEvents([
    {
      id: last?.id ?? `local:${Date.now()}:${++serial}`,
      at: last?.at ?? at,
      sender: "System",
      type,
      text,
      priority: critical ? "critical" : "normal",
      unresolved: critical,
      local: true,
      connection,
      count: (last?.count ?? 0) + 1,
    },
  ]);
}
export function resolveConnectionEvents() {
  mergeEvents(
    entries
      .filter((e) => e.connection && e.unresolved)
      .map((e) => ({ ...e, unresolved: false })),
  );
}
export function clearEvents() {
  baseline = true;
  owner = "";
  entries = [];
  listeners.forEach((f) => f());
}
export const useEvents = () =>
  useSyncExternalStore((f) => {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, eventSnapshot);
