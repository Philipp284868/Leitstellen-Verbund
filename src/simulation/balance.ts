import { BALANCE } from "../catalog";
/** Stable, staggered real-time arrivals; a reconnect never catches up missed calls. */
export const nextCallDelay = (seed: number) =>
  BALANCE.callIntervalMin +
  ((seed >>> 0) % (BALANCE.callIntervalMax - BALANCE.callIntervalMin + 1));
