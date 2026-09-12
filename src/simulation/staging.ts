import type { Save } from "../shared/model";

/** A staged person is at the station only after their actual journey. Vehicle
 * bindings are checked by the roster allocator, never replaced by this flag. */
export function stagedArrival(s: Save, p: Save["people"][number]) {
  return s.buildings
    .find((b) => b.id === p.home)
    ?.civilProtection?.staging?.find(
      (a) =>
        a.person === p.id &&
        a.available &&
        (a.returnAt === undefined || a.returnAt > s.time),
    );
}
export function presentAtStation(s: Save, p: Save["people"][number]) {
  const staged = stagedArrival(s, p);
  return staged ? staged.at <= s.time : !!p.professional;
}
