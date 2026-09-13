import type { Save } from "../../src/shared/model";
import type { Database } from "../../src/server/database";
import { facilityBinding } from "../../src/server/facilities/migration";
import { logicFacilityCatalog } from "../fixtures/germany/facilities";
import { meters } from "../../src/shared/germany/projection";
/** Seed separate legal stations for independent fixture accounts. The actual
 * purchase/race tests intentionally do not use this setup helper. */
export function saveIndependentFixture(db: Database, owner: string, s: Save) {
  const occupied = new Set(
    [...db.all()]
      .filter(([id]) => id !== owner)
      .flatMap(([, other]) =>
        other.buildings.flatMap((b) => (b.facility ? [b.facility.id] : [])),
      ),
  );
  for (const b of s.buildings) {
    if (!b.facility) continue;
    if (occupied.has(b.facility.id)) {
      const next = logicFacilityCatalog
        .query({ limit: 2000 })
        .filter(
          (f) =>
            f.kind === b.type &&
            !occupied.has(f.id) &&
            !s.buildings.some(
              (other) => other.id !== b.id && other.facility?.id === f.id,
            ),
        )
        .sort(
          (a, c) =>
            meters(b.pos, a.pos) - meters(b.pos, c.pos) ||
            a.id.localeCompare(c.id),
        )[0];
      if (!next) throw Error("Separate Fixture-Wache fehlt.");
      b.pos = { ...next.pos };
      b.facility = facilityBinding(next);
      for (const v of s.vehicles.filter(
        (v) => v.home === b.id && v.status === "ready",
      ))
        v.path = [{ ...b.pos }];
    }
    occupied.add(b.facility.id);
  }
  db.save(owner, s);
}
