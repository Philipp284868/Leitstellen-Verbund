import { expect } from "vitest";
import type { Save } from "../../src/shared/model";
/** Assert the added migration metadata, then compare the protected payload
 * separately. No field of the original mission/player/fleet is ignored. */
export function withoutLocationMigration(actual: Save, before: Save) {
  const copy = structuredClone(actual);
  expect(copy.locationReview?.pending).toEqual(
    before.missions.filter((m) => !m.location).map((m) => m.id),
  );
  expect(copy.locationReview?.checked).toBe(0);
  for (const m of copy.missions) {
    const original = before.missions.find((old) => old.id === m.id)!;
    if (original.location) continue;
    expect(m.location?.original).toEqual(original.pos);
    expect(m.location?.access).toEqual(original.pos);
    expect(m.location?.state).toBe("repair-pending");
    delete m.location;
  }
  delete copy.locationReview;
  return copy;
}
