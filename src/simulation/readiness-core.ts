import { z } from "zod";
import type { Building, Save } from "../shared/model";
import { sample } from "./random";

export const readinessCoreSchema = z
  .object({
    version: z.literal(1),
    count: z.number().int().min(4).max(6),
    created: z.number().finite().nonnegative(),
  })
  .strict();

/** Commission existing identities into the game's professional FF core once.
 * A stronger historical standby is retained, including bound or injured people.
 * This never creates people, clears assignments or changes an existing journey.
 */
export function reconcileReadinessCore(s: Save, b: Building) {
  if (b.organization?.kind !== "ff" || b.ready > s.time) return 0;
  b.readinessCore ??= {
    version: 1,
    count:
      4 + Math.floor(sample(s.seed, `ff-core:${s.generation}:${b.id}`) * 3),
    created: s.time,
  };
  const pool = s.people.filter((p) => p.home === b.id);
  for (const p of pool) if (p.duty?.standby) p.professional = true;
  let missing =
    b.readinessCore.count - pool.filter((p) => p.professional).length;
  let changed = 0;
  for (const p of [...pool].sort(
    (a, b) =>
      Number(!!a.vehicle) - Number(!!b.vehicle) ||
      b.skills.length - a.skills.length ||
      a.id.localeCompare(b.id),
  )) {
    if (missing <= 0) break;
    if (p.professional) continue;
    p.professional = true;
    missing--;
    changed++;
  }
  return changed;
}
