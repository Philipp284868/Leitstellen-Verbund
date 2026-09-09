import type { Save } from "../model";
import { crewSummaries } from "./staffing";
import { vehicleAvailability } from "./availability";
import { sample } from "./random";
import { situationDemand } from "./world-situation";

export const CALL_PACING = {
  version: 1,
  initialMin: 300,
  initialMax: 480,
  minimum: 120,
  maximum: 1200,
  retry: 45,
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
    Math.log2(Math.max(1, fleet.length)) * 0.12 +
    Math.log2(Math.max(1, readyHomes)) * 0.04;
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
    maxOpen:
      s.completed < 3
        ? 1
        : Math.min(
            8,
            1 + Math.floor(Math.log2(Math.max(1, fleet.length)) / 1.5),
          ),
    maxWaiting:
      s.completed < 3
        ? 1
        : Math.min(3, 1 + Math.floor(Math.log2(Math.max(1, fleet.length)) / 3)),
  };
}
export function pacedDelay(seed: number, s?: Save) {
  const base =
    CALL_PACING.initialMin +
    sample(seed, "call-interval", s?.callPacing?.sequence ?? 0) *
      (CALL_PACING.initialMax - CALL_PACING.initialMin);
  if (!s) return Math.round(base);
  const load = callLoad(s);
  // A beginner sees the same storm, with no acceleration until the desk has
  // completed its first three incidents and has at least three usable vehicles.
  const demand = Math.min(
    situationDemand(s),
    load.fleet < 3 || s.completed < 3 ? 1 : 1.8,
  );
  const hour = new Date(s.time * 1000).getUTCHours();
  const night = hour < 6 || hour >= 23;
  const loadFactor =
    1 +
    (load.open / Math.max(1, load.maxOpen)) * 0.35 +
    load.waiting * 0.2 +
    load.busy * 0.3;
  const minimum = Math.max(
    CALL_PACING.minimum,
    CALL_PACING.initialMin / load.scale,
  );
  return Math.round(
    Math.min(
      CALL_PACING.maximum,
      Math.max(
        minimum,
        ((base / load.scale) * loadFactor * (night ? 1.2 : 1)) / demand,
      ),
    ),
  );
}

/** Optional v1 state is migrated once, conservatively, without editing any incident.
 * Absolute simulation deadlines survive reload/reconnect. Missed time is never replayed. */
export function prepareCallPacing(s: Save, elapsed: number, activeDesk = true) {
  if (!s.callPacing) {
    const lastCreated = s.archive.reduce(
      (last, m) => Math.max(last, m.created),
      s.missions.reduce((last, m) => Math.max(last, m.created), 0),
    );
    s.callPacing = {
      version: 1,
      lastCreated,
      sequence: 0,
      notBefore: s.time + Math.max(s.missionWait, pacedDelay(s.seed, s)),
    };
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
  return (
    !!s.callPacing &&
    s.time >= s.callPacing.notBefore &&
    load.fleet > 0 &&
    load.available > 0 &&
    load.open < load.maxOpen &&
    load.waiting < load.maxWaiting
  );
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
