import { createId } from "./ids";
import { useEffect, useSyncExternalStore } from "react";
import type { InfrastructureSnapshot } from "../shared/infrastructure";
const listeners = new Set<() => void>(),
  interests = new Map<string, string[]>();
let state: InfrastructureSnapshot = {
    revision: 0,
    facilities: [],
    ownership: [],
    clinics: {},
  },
  connected = false;
let send: ((ids: string[]) => void) | undefined,
  timer: ReturnType<typeof setTimeout> | undefined;
export function infrastructureState() {
  return state;
}
export function subscribeInfrastructure(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function receiveInfrastructure(value: InfrastructureSnapshot) {
  state = value;
  listeners.forEach((f) => f());
}
function publish() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (connected)
      send?.(
        [...new Set([...interests.values()].flat())].sort().slice(0, 2000),
      );
  }, 250);
}
export function connectInfrastructure(
  sender: ((ids: string[]) => void) | undefined,
) {
  send = sender;
  connected = !!sender;
  if (connected) publish();
}
export function watchInfrastructure(key: string, ids: string[]) {
  interests.set(key, ids);
  publish();
  return () => {
    interests.delete(key);
    publish();
  };
}
export function useInfrastructure(ids: string[], enabled = true) {
  const key = ids.slice().sort().join("|");
  useEffect(() => {
    if (enabled)
      return watchInfrastructure(createId(), key ? key.split("|") : []);
  }, [key, enabled]);
  return useSyncExternalStore(subscribeInfrastructure, infrastructureState);
}

export function resetInfrastructure() {
  clearTimeout(timer);
  state = { revision: 0, facilities: [], ownership: [], clinics: {} };
  listeners.forEach((f) => f());
}
