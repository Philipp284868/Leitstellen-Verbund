import type { FacilityOwner } from "./facilities/purchase";
import type { ClinicSnapshot } from "../simulation/clinic-capacity";
export type InfrastructureSnapshot = {
  revision: number;
  facilities: string[];
  ownership: FacilityOwner[];
  clinics: Record<string, Omit<ClinicSnapshot, "revision">>;
};
