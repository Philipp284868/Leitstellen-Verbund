import type { Save } from "./model";
import { along, length, METERS_PER_UNIT } from "./world";
import { routePlan } from "./simulation/traffic";
export function migrateTravel(s: Save) {
  if (s.regionVersion === 3) return;
  for (const v of s.vehicles) {
    if (
      !["travel", "return", "transport", "alarmed"].includes(v.status) ||
      v.journey?.motionVersion === 1 ||
      (v.fault && v.fault.state !== "repaired")
    )
      continue;
    const turnout = v.status === "alarmed" ? Math.max(0, v.depart - s.time) : 0;
    const fraction =
      v.status === "alarmed"
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              (s.time - v.depart) / Math.max(1e-9, v.arrive - v.depart),
            ),
          );
    const origin = along(v.path, fraction),
      target = v.journey?.target ?? v.path.at(-1)!;
    const mode =
      v.journey?.mode ?? (v.status === "return" ? "normal" : "priority");
    const plan = routePlan(s, v, origin, target, mode);
    const distanceDone =
      (v.journey?.distanceDone ?? 0) +
      length(v.path) * METERS_PER_UNIT * fraction;
    v.path = plan.path;
    v.depart = s.time + turnout;
    v.arrive = v.depart + plan.seconds;
    v.journey = {
      mode,
      planned: plan.planned,
      plannedSeconds: plan.plannedSeconds,
      delay: plan.delay,
      distanceDone,
      events: plan.events,
      nextCheck: s.time + 60,
      serial: 0,
      target,
      blockedUntil: plan.blockedUntil,
      reason:
        "Fahrtmodell aktualisiert; verbleibende Ankunft ab bisheriger Position neu berechnet",
      motion: plan.motion,
      motionVersion: 1,
      wait: plan.wait,
    };
  }
  s.regionVersion = 3;
}
