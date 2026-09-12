import type { Save, Vehicle } from "../shared/model";
import { vehiclePosition } from "../shared/vehicle-position";
import { distance } from "../shared/world";
/** Physical presence, independently of the announced FMS or home assignment. */
export function garageIndex(s: Save) {
  const index = new Map(
    s.buildings.map((b) => [
      b.id,
      { inside: [] as Vehicle[], away: [] as Vehicle[] },
    ]),
  );
  const homes = new Map(s.buildings.map((b) => [b.id, b]));
  for (const v of s.vehicles) {
    const b = homes.get(v.home),
      group = index.get(v.home);
    if (!b || !group) continue;
    const pos = vehiclePosition(v, s.time);
    const parked =
      ["ready", "alarmed"].includes(v.status) ||
      (v.status === "return" && s.time >= v.arrive)
        ? s.buildings.find((station) => distance(pos, station.pos) <= 1)
        : undefined;
    if (parked) index.get(parked.id)!.inside.push(v);
    else group.away.push(v);
  }
  return index;
}
