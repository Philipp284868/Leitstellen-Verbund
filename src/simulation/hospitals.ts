import { germanyProvider } from "../germany/world";
import type { Mission, Save, Vehicle } from "../model";
import { distance, type Point } from "../world";
import {
  publicHospitalProfile,
  type HospitalOption,
} from "./hospital-profiles";
import { specialties } from "./organizations-schema";
import { transportCandidates } from "./patients";
import { routePlan } from "./traffic";
export function hospitalOptions(
  s: Save,
  origin: Point,
  seats: number,
  m?: Mission,
  vehicle?: Vehicle,
) {
  const publicOptions = germanyProvider()
    .hospitals(origin, 20)
    .map(publicHospitalProfile);
  return assessHospitals(
    s,
    [
      ...publicOptions,
      ...s.buildings
        .filter(
          (b) =>
            b.owner === s.player.id &&
            b.type === "hospital" &&
            b.ready <= s.time,
        )
        .map((b) => ({
          id: b.id,
          name: b.name,
          pos: b.pos,
          capacity: b.hospital?.capacity ?? 20 * b.level,
          open: b.hospital?.open ?? true,
          specialties: b.hospital?.specialties ?? Object.keys(specialties),
        })),
    ],
    origin,
    seats,
    m,
    vehicle,
  );
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
  return options
    .map((h) => {
      const occupied = s.beds.filter((b) => b.home === h.id).length;
      const reserved = s.vehicles
        .filter(
          (v) =>
            v.status === "transport" &&
            (v.destination
              ? v.destination === h.id
              : distance(v.path.at(-1)!, h.pos) < 1),
        )
        .reduce((n, v) => n + v.patients, 0);
      const missing = [...needs].filter((n) => !h.specialties.includes(n));
      let seconds = Infinity,
        reachable = true;
      try {
        const plan = routePlan(s, vehicle ?? { type: "rtw" }, origin, h.pos);
        seconds = plan.seconds;
        reachable = !plan.blockedUntil;
      } catch {
        reachable = false;
      }
      const reason = !h.open
        ? "Abgemeldet"
        : missing.length
          ? `Fachbereich fehlt: ${missing.map((x) => specialties[x]).join(", ")}`
          : occupied + reserved + seats > h.capacity
            ? "Keine freie Aufnahme"
            : !reachable
              ? "Kein Fahrweg"
              : "";
      return { ...h, occupied, reserved, seconds, reason };
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
        : h.id === preference,
    ) ?? options[0]
  );
}
