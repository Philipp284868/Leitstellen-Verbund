import type { DatabaseSync } from "node:sqlite";
import { germanyProvider } from "../../shared/germany/world";
import { publicHospitalProfile } from "../../simulation/hospital-profiles";
import { publicOwnership } from "./ownership";
import { SharedClinics } from "./clinics";
import type { InfrastructureSnapshot } from "../../shared/infrastructure";
/** Aggregate public data only. No other dispatch's save, patients, employees or account details. */
export function infrastructureSnapshot(
  sql: DatabaseSync,
  ids: string[],
): InfrastructureSnapshot {
  const catalog = germanyProvider().facilities,
    authority = new SharedClinics(sql);
  const clinics: InfrastructureSnapshot["clinics"] = {};
  for (const id of ids) {
    const f = catalog?.get(id);
    if (f?.kind !== "hospital") continue;
    const h = publicHospitalProfile({
      id: f.id,
      name: f.name,
      ...(f.access?.pos ?? f.pos),
      emergency: f.emergency,
    });
    const { occupied, reserved, free, total, departmentFree } =
      authority.snapshot(h);
    clinics[h.id] = { occupied, reserved, free, total, departmentFree };
  }
  return {
    revision: Number(
      sql.prepare("SELECT revision FROM infrastructure_state WHERE id=1").get()!
        .revision,
    ),
    facilities: ids,
    ownership: publicOwnership(sql, ids),
    clinics,
  };
}
