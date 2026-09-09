import type { Incident } from "./schema";

export type RadioRequest = Incident["radio"][number];
export const RADIO_LEASE_SECONDS = 180;

/** Uses the authoritative clock in snapshots; reconnects never extend a lease. */
export function radioHandler(r: RadioRequest, now: number) {
  return r.state === "open" && r.handling && r.handling.until > now
    ? r.handling
    : undefined;
}
