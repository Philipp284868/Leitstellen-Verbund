import { expect } from "vitest";
import type { Save } from "../../src/shared/model";
import { fireGameProfile } from "../../src/shared/facilities/fire-profile";
import { stationCapacity } from "../../src/simulation/staffing";

/** Historical migration tests still compare every protected field. Validate the
 * separate v29 additions before removing them from those older expectations. */
export function withoutFireMigration(actual: Save, before: Save) {
  const copy = structuredClone(actual);
  for (const b of copy.buildings) {
    const old = before.buildings.find((x) => x.id === b.id);
    if (
      !old ||
      !b.fireProfile ||
      b.fireProfile.revision === old.fireProfile?.revision
    )
      continue;
    expect(b.fireCapacityRetained).toEqual(
      old.fireCapacityRetained ?? stationCapacity(old),
    );
    expect(b.purchaseReceipt).toEqual(old.purchaseReceipt);
    expect(b.facility).toEqual(old.facility);
    const bound = before.vehicles.some(
      (v) =>
        v.home === b.id &&
        (v.status !== "ready" || v.patients > 0 || v.postIncident),
    );
    expect(b.fireProfilePending).toBe(bound);
    const game = fireGameProfile(b.fireProfile);
    if (bound || !game) {
      expect(b.organization).toEqual(old.organization);
    } else {
      const kind = b.fireProfile.kind;
      expect(b.organization?.kind).toBe(
        kind === "shared" || kind === "ff-paid" ? "ff" : kind,
      );
      const pool = copy.people
        .filter((p) => p.home === b.id)
        .sort((a, b) => a.id.localeCompare(b.id));
      for (const [index, p] of pool.entries()) {
        expect(p.professional).toBe(index < game.paid * b.level);
        const original = before.people.find((x) => x.id === p.id);
        if (original?.professional === undefined) delete p.professional;
        else p.professional = original.professional;
      }
    }
    for (const key of [
      "fireProfile",
      "fireProfilePending",
      "fireRosterRevision",
      "fireCapacityRetained",
      "organization",
      "readinessCore",
    ] as const) {
      if (old[key] === undefined) delete b[key];
      else Object.assign(b, { [key]: structuredClone(old[key]) });
    }
  }
  return copy;
}
