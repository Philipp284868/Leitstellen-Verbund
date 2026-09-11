import type { Save } from "../model";
import { crewSummaries } from "./staffing";
import { vehicleAvailability } from "./availability";
import { sample } from "./random";
import { situationDemand } from "./world-situation";

export const CALL_PACING = {
  version: 3,
  initialMin: 90,
  initialMax: 180,
  minimum: 20,
  maximum: 360,
  retry: 20,
  additionalSpacing: 120,
  recoverySpacing: 45,
  maxCallsPerIncident: 4,
} as const;

export function callLoad(s: Save) {
  const homes = new Set(
    s.buildings
      .filter((b) => b.owner === s.player.id && b.ready <= s.time)
      .map((b) => b.id),
  );
  const fleet = s.vehicles.filter(
    (v) => v.owner === s.player.id && homes.has(v.home),
  );
  const crews = crewSummaries(s);
  const available = fleet.filter(
    (v) => vehicleAvailability(s, v, crews.get(v.id)).alarmable,
  ).length;
  const readyHomes = new Set(fleet.map((v) => v.home)).size;
  const scale =
    1 +
    Math.log2(Math.max(1, fleet.length)) * 0.25 +
    Math.log2(Math.max(1, readyHomes)) * 0.1;
  const open = s.missions.filter((m) => m.phase !== "done").length;
  const waiting = s.missions.filter((m) =>
    m.control?.calls.some((c) => c.state === "ringing" || c.state === "active"),
  ).length;
  return {
    fleet: fleet.length,
    available,
    scale,
    open,
    waiting,
    busy: fleet.length ? 1 - available / fleet.length : 1,
  };
}
export function pacedDelay(seed: number, s?: Save) {
  const base =
    CALL_PACING.initialMin +
    sample(seed, "call-interval", s?.callPacing?.sequence ?? 0) *
      (CALL_PACING.initialMax - CALL_PACING.initialMin);
  if (!s) return Math.round(base);
  const load = callLoad(s);
  const demand = situationDemand(s);
  const hour = new Date(s.time * 1000).getUTCHours();
  const night = hour < 6 || hour >= 23;
  const loadFactor =
    1 +
    Math.min(0.6, Math.log2(1 + load.open) * 0.12) +
    Math.min(0.8, Math.log2(1 + load.waiting) * 0.16) +
    load.busy * 0.3;
  return Math.round(
    Math.min(
      CALL_PACING.maximum,
      Math.max(
        CALL_PACING.minimum,
        ((base / load.scale) * loadFactor * (night ? 1.2 : 1)) / demand,
      ),
    ),
  );
}

/** Optional pacing state is migrated once, without editing any incident.
 * Absolute simulation deadlines survive reload/reconnect. Missed time is never replayed. */
export function prepareCallPacing(s: Save, elapsed: number, activeDesk = true) {
  if (!s.callPacing) {
    const lastCreated = s.archive.reduce(
      (last, m) => Math.max(last, m.created),
      s.missions.reduce((last, m) => Math.max(last, m.created), 0),
    );
    s.callPacing = {
      version: CALL_PACING.version,
      lastCreated,
      sequence: 0,
      notBefore: s.time + Math.max(s.missionWait, pacedDelay(s.seed, s)),
    };
  }
  if (s.callPacing.version < CALL_PACING.version) {
    // Preserve seed and elapsed wait while replacing the old low-frequency policy.
    s.callPacing.notBefore = Math.min(
      s.callPacing.notBefore,
      s.time + pacedDelay(s.seed, s),
    );
    s.callPacing.version = CALL_PACING.version;
  }
  if (
    elapsed > 60 ||
    !activeDesk ||
    !s.vehicles.some((v) =>
      s.buildings.some((b) => b.id === v.home && b.ready <= s.time),
    )
  ) {
    s.callPacing.notBefore = Math.max(
      s.callPacing.notBefore,
      s.time + pacedDelay(s.seed, s),
    );
  }
  s.missionWait = Math.max(0, s.callPacing.notBefore - s.time);
  s.nextMission = s.callPacing.notBefore;
}
export function mayCreateIncident(s: Save) {
  const load = callLoad(s);
  return !!s.callPacing && s.time >= s.callPacing.notBefore && load.fleet > 0;
}
export function recordIncidentCreated(s: Save) {
  if (!s.callPacing) prepareCallPacing(s, 0);
  s.callPacing!.lastCreated = s.time;
  s.callPacing!.sequence++;
  s.missionWait = pacedDelay(s.seed, s);
  s.callPacing!.notBefore = s.time + s.missionWait;
  s.nextMission = s.callPacing!.notBefore;
}
export function retryCallLater(s: Save) {
  if (!s.callPacing) return;
  s.callPacing.notBefore = Math.max(
    s.callPacing.notBefore,
    s.time + CALL_PACING.retry,
    s.time + s.missionWait,
  );
  s.missionWait = s.callPacing.notBefore - s.time;
  s.nextMission = s.callPacing.notBefore;
}
export function mayReceiveAdditionalCall(s: Save, recovery: boolean) {
  const ringing = s.missions.some((m) =>
    m.control?.calls.some((c) => c.state === "ringing"),
  );
  if (ringing) return false;
  let last = 0;
  for (const missions of [s.missions, s.archive])
    for (const m of missions)
      for (const call of m.control?.calls || [])
        last = Math.max(last, call.created);
  return (
    s.time - last >=
    (recovery ? CALL_PACING.recoverySpacing : CALL_PACING.additionalSpacing)
  );
}
