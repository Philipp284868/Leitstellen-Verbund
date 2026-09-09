import type { Save, Vehicle } from "./model";
import { crewSummaries } from "./simulation/staffing";
import { vehicleAvailability } from "./simulation/availability";
type Readiness = (vehicle: Vehicle) => string;
const snapshots = new WeakMap<Save, Readiness>();
/** Only immutable client snapshots may use this cache; the server derives every decision afresh. */
export function fleetReadiness(snapshot: Save): Readiness {
  const cached = snapshots.get(snapshot);
  if (cached) return cached;
  const vehicles = new Map(snapshot.vehicles.map((v) => [v.id, v]));
  const crews = snapshot.vehicles.some((v) => !v.availability)
    ? crewSummaries(snapshot)
    : undefined;
  const reasons = new Map<string, string>();
  const lookup: Readiness = (vehicle) => {
    if (vehicles.get(vehicle.id) !== vehicle) {
      const state = vehicleAvailability(snapshot, vehicle);
      return state.alarmable ? "" : state.reason;
    }
    const authoritative = vehicle.availability;
    if (authoritative)
      return authoritative.alarmable ? "" : authoritative.reason;
    if (!reasons.has(vehicle.id)) {
      const state = vehicleAvailability(
        snapshot,
        vehicle,
        crews?.get(vehicle.id),
      );
      reasons.set(vehicle.id, state.alarmable ? "" : state.reason);
    }
    return reasons.get(vehicle.id)!;
  };
  snapshots.set(snapshot, lookup);
  return lookup;
}
