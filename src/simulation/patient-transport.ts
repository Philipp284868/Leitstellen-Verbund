import type { Mission, Save, Vehicle } from "../shared/model";
import { mt, vt } from "../shared/catalog";
import { simId } from "./events";
import {
  boardPatients,
  deliverPatients,
  transportCandidates,
} from "./patients";

export type TransportOrder = Mission["transports"][number];
export const transportIdentity = (order: TransportOrder) =>
  order.id ?? order.assignment;

/** Additive upgrade based on existing carrier evidence; never infer a delivery
 * from a timer or a patient count. Can also run on a history snapshot. */
export function migratePatientTransports(m: Mission) {
  const patients = m.dynamics?.patients ?? [];
  for (const order of m.transports) {
    order.id ??= order.assignment;
    if (!order.patientIds) {
      order.patientIds = patients
        .filter(
          (p) =>
            p.vehicle === order.vehicle &&
            !p.transportOrder &&
            (order.status === "delivered"
              ? p.transport === "delivered"
              : p.transport === "aboard"),
        )
        .slice(0, order.patients)
        .map((p) => p.id);
      for (const id of order.patientIds)
        patients.find((p) => p.id === id)!.transportOrder = order.id;
    }
  }
  for (const p of patients) if (p.transport === "delivered") p.vehicle = "";
}

export function transportSeatsAvailable(m: Mission, v: Vehicle) {
  if (
    m.transports.some(
      (t) => t.assignment === v.assignment && t.status === "ordered",
    )
  )
    return 0;
  const remaining = m.dynamics?.active
    ? transportCandidates(m).length
    : Math.max(
        0,
        mt(m.template).patients -
          m.transports.reduce((n, t) => n + t.patients, 0),
      );
  return Math.min(remaining, vt(v.type).capacity);
}

/** Route and hospital reservation must have succeeded before committing boarding. */
export function registerPatientTransport(
  s: Save,
  m: Mission,
  v: Vehicle,
  count: number,
  owner = s.player.id,
) {
  if (
    !v.assignment ||
    v.status !== "transport" ||
    count < 1 ||
    count > transportSeatsAvailable(m, v)
  )
    throw Error("Ungültige oder doppelte Patientenzuordnung.");
  const id = simId(s);
  const patientIds = m.dynamics?.active
    ? transportCandidates(m)
        .slice(0, count)
        .map((p) => p.id)
    : [];
  const order: TransportOrder = {
    id,
    assignment: v.assignment,
    owner,
    vehicle: v.id,
    patients: count,
    patientIds,
    hospital: v.destination,
    status: "ordered",
  };
  m.transports.push(order);
  boardPatients(s, m, v, count, id);
  return order;
}

export function completePatientTransport(
  s: Save,
  m: Mission,
  order: TransportOrder,
) {
  if (order.status === "delivered") return;
  deliverPatients(
    s,
    m,
    { id: order.vehicle, name: order.vehicle },
    transportIdentity(order),
  );
  order.status = "delivered";
  order.deliveredAt = s.time;
  for (const p of m.dynamics?.patients ?? [])
    if (order.patientIds?.includes(p.id)) {
      p.hospital = order.hospital ?? p.hospital;
    }
}

export function validatePatientTransports(m: Mission) {
  const patients = m.dynamics?.patients;
  if (!patients) return;
  const assigned = new Set<string>();
  const orders = new Set<string>();
  if (new Set(patients.map((p) => p.id)).size !== patients.length)
    throw Error("Doppelte Patientenkennung.");
  for (const order of m.transports) {
    if (orders.has(transportIdentity(order)))
      throw Error("Doppelter Transportauftrag.");
    orders.add(transportIdentity(order));
    for (const id of order.patientIds ?? []) {
      const p = patients.find((p) => p.id === id);
      if (
        !p ||
        assigned.has(id) ||
        p.transportOrder !== transportIdentity(order) ||
        (order.status === "ordered" &&
          (p.transport !== "aboard" || p.vehicle !== order.vehicle)) ||
        (order.status === "delivered" && p.transport !== "delivered")
      )
        throw Error("Widersprüchliche Patiententransport-Zuordnung.");
      assigned.add(id);
    }
  }
  for (const p of patients)
    if (p.transportOrder && !assigned.has(p.id))
      throw Error("Patient ohne zugehörigen Transportauftrag.");
}

/** Clinical readiness permits departure; only an actual handover permits closure. */
export function patientTransportsComplete(m: Mission) {
  if (m.transports.some((t) => t.status !== "delivered")) return false;
  if (m.dynamics?.active)
    return m.dynamics.patients.every(
      (p) =>
        p.transport === "delivered" ||
        (p.transport === "none" && p.condition === "dead"),
    );
  return (
    m.transports.reduce((n, t) => n + t.patients, 0) >= mt(m.template).patients
  );
}
