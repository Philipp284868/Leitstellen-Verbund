import { germanyProvider } from "../shared/germany/world";
import type { Mission, Save, Vehicle } from "../shared/model";
import type { Point } from "../shared/world";
import {
  publicHospitalProfile,
  type HospitalOption,
} from "./hospital-profiles";
import { specialties } from "./organizations-schema";
import { transportCandidates } from "./patients";
import { routePlan } from "./traffic";
import { clinicSnapshot, patientDepartments } from "./clinic-capacity";
import { vehiclePosition } from "../shared/vehicle-position";
export function hospitalOptions(
  s: Save,
  origin: Point,
  seats: number,
  m?: Mission,
  vehicle?: Vehicle,
) {
  if (m && vehicle?.status === "transport") {
    const cohort = structuredClone(m);
    if (cohort.dynamics) {
      cohort.dynamics.patients = cohort.dynamics.patients.filter(
        (p) => p.vehicle === vehicle.id,
      );
      for (const p of cohort.dynamics.patients) p.transport = "scene";
    }
    m = cohort;
    origin = vehiclePosition(vehicle, s.time);
  }
  const publicOptions = germanyProvider()
    .hospitals(origin, 40)
    .map(publicHospitalProfile);
  const preferred =
    (m?.major ? transportCandidates(m)[0]?.hospital : undefined) ??
    m?.organization?.hospital;
  if (preferred?.startsWith("public:")) {
    const facility = germanyProvider().facilities?.get(preferred.slice(7));
    if (
      facility?.kind === "hospital" &&
      facility.status === "active" &&
      facility.access &&
      !publicOptions.some((h) => h.id === `public:${facility.id}`)
    )
      publicOptions.unshift(
        publicHospitalProfile({
          id: facility.id,
          name: facility.name,
          ...facility.access.pos,
          emergency: facility.emergency,
          aliases: facility.sources,
          facilityId: facility.id,
        }),
      );
    publicOptions.sort(
      (a, b) => Number(b.id === preferred) - Number(a.id === preferred),
    );
  }
  return assessHospitals(s, publicOptions, origin, seats, m, vehicle);
}
export function assessHospitals(
  s: Save,
  options: HospitalOption[],
  origin: Point,
  seats: number,
  m?: Mission,
  vehicle?: Vehicle,
) {
  const patients = m?.dynamics?.active
    ? transportCandidates(m).slice(0, seats)
    : [];
  const needs = new Set<keyof typeof specialties>(["general"]);
  for (const p of patients) {
    if (p.age < 18) needs.add("pediatric");
    if (
      p.condition === "critical" ||
      p.condition === "cpr" ||
      p.cprCycles ||
      m?.dynamics?.scenario?.patient.intensive
    )
      needs.add("intensive");
    if (/brand|feuer|rauch|verbrennung/i.test(p.injury)) needs.add("burns");
    if (/unfall|verletzung|sturz/i.test(p.injury)) needs.add("trauma");
  }
  const requests = patientDepartments(m, seats);
  let routeChecks = 0;
  return options
    .map((h) => {
      const occupancy = clinicSnapshot(s, h);
      const departmentFull = requests.some((r) =>
        r.departments.some(
          (d) =>
            (occupancy.departmentFree[d] ?? 0) <
            requests.filter((p) => p.departments.includes(d)).length,
        ),
      );
      const missing = [...needs].filter((n) => !h.specialties.includes(n));
      let seconds = Infinity,
        reachable = true;
      if (
        h.open &&
        !missing.length &&
        occupancy.free >= seats &&
        !departmentFull
      ) {
        if (routeChecks++ < 8)
          try {
            const plan = routePlan(
              s,
              vehicle ?? { type: "rtw" },
              origin,
              h.pos,
            );
            seconds = plan.seconds;
            reachable = !plan.blockedUntil;
          } catch {
            reachable = false;
          }
        else reachable = false;
      }
      const reason = !h.open
        ? "Abgemeldet"
        : missing.length
          ? `Fachbereich fehlt: ${missing.map((x) => specialties[x]).join(", ")}`
          : occupancy.free < seats || departmentFull
            ? "Keine freie Aufnahme"
            : !reachable
              ? routeChecks > 8
                ? "Weitere Klinik: Fahrweg noch nicht geprüft"
                : "Kein Fahrweg"
              : "";
      return { ...h, ...occupancy, seconds, reason };
    })
    .sort((a, b) => a.seconds - b.seconds || a.id.localeCompare(b.id));
}
export function selectHospital(
  s: Save,
  origin: Point,
  seats: number,
  m?: Mission,
  v?: Vehicle,
) {
  const options = hospitalOptions(s, origin, seats, m, v).filter(
    (h) => !h.reason,
  );
  // A closed/full/inappropriate preferred facility never strands a stable patient.
  const preference = m?.major
    ? transportCandidates(m)[0]?.hospital || m.organization?.hospital
    : m?.organization?.hospital;
  return (
    options.find((h) =>
      preference === "public"
        ? h.id.startsWith("public:")
        : h.id === preference || !!h.aliases?.includes(preference ?? ""),
    ) ?? options[0]
  );
}
