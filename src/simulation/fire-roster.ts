import type { Save, Building } from "../shared/model";
import { fireGameProfile } from "../shared/facilities/fire-profile";

export function activeFireGameProfile(b: Building) {
  return b.fireProfilePending ? undefined : fireGameProfile(b.fireProfile);
}
/** Apply only at a quiet station; retain every occupied crew and historical identity. */
export function reconcileFireRoster(s: Save, b: Building) {
  if (!b.fireProfile || b.type !== "fire") return;
  if (
    s.vehicles.some(
      (v) =>
        v.home === b.id &&
        (v.status !== "ready" || v.patients > 0 || v.postIncident),
    )
  )
    return;
  b.fireProfilePending = false;
  const game = fireGameProfile(b.fireProfile);
  if (!game) return; // Unresolved historical sites retain their operational profile.
  const people = s.people
    .filter((p) => p.home === b.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  const revision = `${b.fireProfile.revision}:${b.level}:${people.length}`;
  if (b.fireRosterRevision === revision) return;
  const kind = b.fireProfile.kind;
  b.organization = {
    kind:
      kind === "shared" || kind === "ff-paid"
        ? "ff"
        : (kind as "ff" | "bf" | "works" | "company" | "airport"),
    turnout: game.turnout,
    crew: b.organization?.crew ?? "normal",
    reserve: b.organization?.reserve ?? 0,
  };
  for (const [index, p] of people.entries()) {
    p.professional = index < game.paid * b.level;
  }
  delete b.readinessCore;
  b.fireRosterRevision = revision;
}
