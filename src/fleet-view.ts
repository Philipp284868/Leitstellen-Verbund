import { readiness } from "./engine";
import type { Save, Vehicle } from "./model";
import { stationProfile } from "./simulation/staffing";

type Readiness = (vehicle: Vehicle) => string;
const snapshots = new WeakMap<Save, Readiness>();

/** Read-only client snapshots are replaced atomically by store.accept.
 * Index their rosters once; keep the authoritative readiness rules unchanged.
 * Never use this cache for an engine save that is mutated in place.
 */
export function fleetReadiness(snapshot: Save): Readiness {
  const cached = snapshots.get(snapshot);
  if (cached) return cached;
  const vehicles = new Map(snapshot.vehicles.map((v) => [v.id, v]));
  const crew = new Map<string, Save["people"]>();
  const homeCrew = new Map<string, Save["people"]>();
  for (const person of snapshot.people) {
    if (!person.vehicle) continue;
    const vehicle = vehicles.get(person.vehicle);
    if (!vehicle) continue;
    const own = crew.get(vehicle.id) ?? [];
    own.push(person);
    crew.set(vehicle.id, own);
    const station = homeCrew.get(vehicle.home) ?? [];
    station.push(person);
    homeCrew.set(vehicle.home, station);
  }
  const reserveHomes = new Set(
    snapshot.buildings
      .filter((b) => stationProfile(b).reserve > 0)
      .map((b) => b.id),
  );
  const reasons = new Map<string, string>();
  const lookup: Readiness = (vehicle) => {
    // A reserve rule compares other vehicles of the same station, so retain
    // those crews too. Unassigned and other-station people cannot affect it.
    if (vehicles.get(vehicle.id) !== vehicle)
      return readiness(snapshot, vehicle);
    if (!reasons.has(vehicle.id))
      reasons.set(
        vehicle.id,
        readiness(
          {
            ...snapshot,
            people: reserveHomes.has(vehicle.home)
              ? (homeCrew.get(vehicle.home) ?? [])
              : (crew.get(vehicle.id) ?? []),
          },
          vehicle,
        ),
      );
    return reasons.get(vehicle.id)!;
  };
  snapshots.set(snapshot, lookup);
  return lookup;
}
