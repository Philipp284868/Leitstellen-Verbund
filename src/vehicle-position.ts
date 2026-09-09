import type { Vehicle } from "./model";
import { along, length, METERS_PER_UNIT } from "./world";
import { motionAt } from "./motion";
export function vehicleMotion(v: Vehicle, time: number) {
  if (v.fault && v.fault.state !== "repaired")
    return {
      position: v.fault.position,
      kmh: 0,
      limit: 0,
      meters: 0,
      edge: "stopped",
    };
  if (v.journey?.blockedUntil)
    return {
      position: v.path[0],
      kmh: 0,
      limit: 0,
      meters: 0,
      edge: "blocked",
    };
  if (
    v.journey?.motion &&
    ["travel", "transport", "return", "alarmed"].includes(v.status)
  ) {
    const elapsed = time - v.depart - (v.journey.wait ?? 0);
    const state = motionAt(v.journey.motion, elapsed);
    if (state)
      return {
        ...state,
        kmh: v.journey.blockedUntil || elapsed < 0 ? 0 : state.kmh,
      };
  }
  const f = Math.max(
    0,
    Math.min(1, (time - v.depart) / Math.max(1e-9, v.arrive - v.depart)),
  );
  return {
    position: along(v.path, f),
    kmh: 0,
    limit: 0,
    meters: length(v.path) * METERS_PER_UNIT * f,
    edge: "legacy",
  };
}
export const vehiclePosition = (v: Vehicle, time: number) =>
  vehicleMotion(v, time).position;
