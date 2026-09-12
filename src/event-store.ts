import { useSyncExternalStore } from "react";
import { projectEvents, type GameEvent } from "./game-events";
import type { Save } from "./model";
const listeners = new Set<() => void>();
let entries: GameEvent[] = [],
  owner = "",
  serial = 0;
export function eventSnapshot() {
  return entries;
}
export function mergeEvents(incoming: GameEvent[]) {
  const merged = new Map(entries.map((e) => [e.id, e]));
  for (const e of incoming) merged.set(e.id, e);
  const all = [...merged.values()].sort(
    (a, b) => a.at - b.at || a.id.localeCompare(b.id),
  );
  const pinned = all.filter((e) => e.unresolved);
  const recent = all.filter((e) => !e.unresolved).slice(-600);
  entries = [...pinned, ...recent].sort(
    (a, b) => a.at - b.at || a.id.localeCompare(b.id),
  );
  listeners.forEach((f) => f());
}
export function observeEvents(save: Save) {
  if (owner !== save.player.id + save.generation) {
    owner = save.player.id + save.generation;
    entries = [];
  }
  mergeEvents(projectEvents(save));
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
