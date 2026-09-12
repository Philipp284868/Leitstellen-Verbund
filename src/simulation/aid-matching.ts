import { vt } from "../shared/catalog";

/** A free-text name never participates in authorization or vehicle matching. */
export function matchingAidType(requested: string[], candidate: string) {
  const exact = requested.indexOf(candidate);
  if (exact >= 0) return exact;
  const actual = vt(candidate);
  return requested.findIndex((id) => {
    const desired = vt(id);
    return (
      actual.mode === desired.mode &&
      actual.capacity >= desired.capacity &&
      Object.entries(desired.skills).every(
        ([skill, n]) => (actual.skills[skill] ?? 0) >= n,
      )
    );
  });
}
