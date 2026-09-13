import type { Save, Mission, Vehicle } from "../shared/model";
import { hospitalOptions, selectHospital } from "./hospitals";
import {
  clinicAuthority,
  patientBedRequest,
  reserveClinic,
} from "./clinic-capacity";
import { beginTrip } from "./trip-start";
import { GermanyRoutingError } from "../shared/germany/errors";
import { vehiclePosition } from "../shared/vehicle-position";
export class ClinicUnavailable extends Error {}
/** Explicit rerouting preserves the physical position and exchanges the existing reservation atomically. */
export function retargetClinicTransport(
  s: Save,
  m: Mission,
  v: Vehicle,
  home: string,
) {
  const order = m.transports.find(
    (t) =>
      t.assignment === v.assignment &&
      t.vehicle === v.id &&
      t.owner === s.player.id &&
      t.status === "ordered",
  );
  if (!order || v.status !== "transport" || !v.patients || !v.assignment)
    throw Error("Eigener laufender Patiententransport fehlt.");
  if (v.destination === home) return;
  const cohort = structuredClone(m);
  cohort.organization = {
    ...cohort.organization,
    tasks: cohort.organization?.tasks ?? [],
    hospital: home,
  };
  if (cohort.dynamics)
    cohort.dynamics.patients = cohort.dynamics.patients
      .filter((p) => order.patientIds?.includes(p.id))
      .map((p) => ({ ...p, transport: "scene" as const }));
  const target = hospitalOptions(
    s,
    vehiclePosition(v, s.time),
    v.patients,
    cohort,
    v,
  ).find((h) => h.id === home && !h.reason);
  if (!target)
    throw new ClinicUnavailable(
      "Kein freies passendes Klinikbett mit geprüftem Fahrweg. Die bisherige Aufnahmezusage bleibt erhalten.",
    );
  const proposed = structuredClone(v);
  beginTrip(s, proposed, target.pos, "transport");
  if (proposed.journey?.blockedUntil)
    throw new ClinicUnavailable(
      "Neue Klinikroute ist gesperrt. Die bisherige Aufnahmezusage bleibt erhalten.",
    );
  const requests = (m.dynamics?.patients ?? [])
    .filter((p) => order.patientIds?.includes(p.id))
    .map((p) => patientBedRequest(m, p));
  if (!requests.length)
    for (let i = 0; i < v.patients; i++)
      requests.push({
        patient: `${m.id}:${v.assignment}:${i}`,
        departments: ["general"],
      });
  if (
    clinicAuthority() &&
    !clinicAuthority()!.reserve(
      target,
      requests,
      s.player.id,
      m.id,
      v.assignment,
      s.time,
    )
  )
    throw new ClinicUnavailable(
      "Kein freies passendes Klinikbett. Die bisherige Aufnahmezusage bleibt erhalten.",
    );
  Object.assign(v, proposed);
  v.destination = target.id;
  order.hospital = target.id;
  for (const p of m.dynamics?.patients ?? [])
    if (order.patientIds?.includes(p.id)) p.hospital = target.id;
}
/** Physical route first, atomic reservation second, boarding is committed by the existing order routine. */
export function startClinicTransport(
  s: Save,
  v: Vehicle,
  patients: number,
  m?: Mission,
) {
  const target = selectHospital(s, v.path.at(-1)!, patients, m, v);
  if (!target)
    throw new ClinicUnavailable(
      "Kein freies passendes Klinikbett mit erreichbarer Aufnahme. Patienten bleiben versorgt; weitere Prüfung in 30 Sekunden.",
    );
  const proposed = structuredClone(v);
  proposed.patients = patients;
  proposed.destination = target.id;
  beginTrip(s, proposed, target.pos, "transport");
  if (proposed.journey?.blockedUntil)
    throw new ClinicUnavailable(
      "Klinikroute derzeit gesperrt. Patienten bleiben versorgt; weitere Prüfung in 30 Sekunden.",
    );
  if (!reserveClinic(s, target, m, v, patients))
    throw new ClinicUnavailable(
      "Kein freies passendes Klinikbett. Patienten bleiben versorgt; weitere Prüfung in 30 Sekunden.",
    );
  Object.assign(v, proposed);
}
/** A local capacity/routing failure must never pause the entire server or poll every tick. */
export function attemptClinicTransport(
  s: Save,
  m: Mission,
  v: Vehicle,
  seats: number,
) {
  if (seats < 1 || (m.clinicWait && m.clinicWait.until > s.time)) return false;
  try {
    startClinicTransport(s, v, seats, m);
    delete m.clinicWait;
    return true;
  } catch (error) {
    if (
      !(error instanceof ClinicUnavailable) &&
      !(error instanceof GermanyRoutingError)
    )
      throw error;
    m.clinicWait = {
      until: s.time + 30,
      reason:
        error instanceof ClinicUnavailable
          ? error.message
          : "Klinikfahrt derzeit nicht erreichbar. Patienten bleiben versorgt; weitere Prüfung in 30 Sekunden.",
    };
    return false;
  }
}
