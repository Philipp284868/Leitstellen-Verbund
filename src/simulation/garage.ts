import type { Save, Vehicle } from "../model";
import { vehiclePosition } from "../vehicle-position";
import { distance } from "../world";
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
    (distance(pos, b.pos) <= 1 ? group.inside : group.away).push(v);
  }
  return index;
}
