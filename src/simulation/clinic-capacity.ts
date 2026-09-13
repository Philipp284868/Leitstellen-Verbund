import type { HospitalOption } from "./hospital-profiles";
import type { Mission, Save, Vehicle } from "../shared/model";
import { transportCandidates } from "./patients";

export type ClinicSnapshot = {
  occupied: number;
  reserved: number;
  free: number;
  total: number;
  revision: number;
  departmentFree: Record<string, number>;
};
export type BedRequest = { patient: string; departments: string[] };
export type ClinicAuthority = {
  snapshot(h: HospitalOption): ClinicSnapshot;
  reserve(
    h: HospitalOption,
    requests: BedRequest[],
    owner: string,
    mission: string,
    assignment: string,
    at: number,
  ): boolean;
  admit(owner: string, assignment: string, clinic: string, at: number): number;
  cancel(owner: string, assignment: string, at: number): void;
  advance(at: number): void;
};
let authority: ClinicAuthority | undefined;
/** Synchronous scope supplied by the existing server transaction, restored even on failure. */
export function withClinicAuthority<T>(
  value: ClinicAuthority,
  run: () => T,
): T {
  const previous = authority;
  authority = value;
  try {
    return run();
  } finally {
    authority = previous;
  }
}
export function clinicAuthority() {
  return authority;
}
export function patientDepartments(m?: Mission, count = 1) {
  const patients = m ? transportCandidates(m).slice(0, count) : [];
  return patients.map((p) => patientBedRequest(m!, p));
}
export function patientBedRequest(
  m: Mission,
  p: NonNullable<Mission["dynamics"]>["patients"][number],
) {
  return {
    patient: `${m!.id}:${p.id}`,
    departments: [
      "general",
      ...(p.age < 18 ? ["pediatric"] : []),
      ...(p.condition === "critical" ||
      p.condition === "cpr" ||
      p.cprCycles ||
      m!.dynamics?.scenario?.patient.intensive
        ? ["intensive"]
        : []),
      ...(/brand|feuer|rauch|verbrennung/i.test(p.injury) ? ["burns"] : []),
      ...(/unfall|verletzung|sturz/i.test(p.injury) ? ["trauma"] : []),
    ],
  };
}
export function clinicSnapshot(s: Save, h: HospitalOption): ClinicSnapshot {
  if (authority) return authority.snapshot(h);
  // The standalone deterministic lab uses the same saved admissions/active journeys;
  // the live multiplayer server always installs its shared SQL authority.
  const aliases = new Set([h.id, ...(h.aliases ?? [])]);
  const occupied = s.beds.filter((b) => aliases.has(b.home)).length;
  const reserved = s.vehicles
    .filter((v) => v.status === "transport" && aliases.has(v.destination ?? ""))
    .reduce((n, v) => n + v.patients, 0);
  const free = Math.max(0, h.capacity - occupied - reserved);
  return {
    occupied,
    reserved,
    free,
    total: h.capacity,
    revision: s.revision,
    departmentFree: Object.fromEntries(h.specialties.map((d) => [d, free])),
  };
}
export function reserveClinic(
  s: Save,
  h: HospitalOption,
  m: Mission | undefined,
  v: Vehicle,
  count: number,
) {
  if (!authority) return true;
  if (!v.assignment) throw Error("Transportzuordnung fehlt.");
  const requests = patientDepartments(m, count);
  if (!requests.length)
    for (let i = 0; i < count; i++)
      requests.push({
        patient: `${m?.id ?? v.mission}:${v.assignment}:${i}`,
        departments: ["general"],
      });
  return authority.reserve(
    h,
    requests,
    s.player.id,
    m?.id ?? v.mission!,
    v.assignment,
    s.time,
  );
}
