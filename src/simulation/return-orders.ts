import type { Save, Vehicle } from "../shared/model";
import { recall } from "../shared/engine";
import { GermanyRoutingError } from "../shared/germany/errors";
import { record } from "./events";

/** Authorization belongs to the caller's owner-world transaction, never to a force flag. */
export function orderReturn(s: Save, v: Vehicle, actor: string) {
  if (!s.vehicles.includes(v) || v.owner !== s.player.id)
    throw Error("Eigenes Fahrzeug fehlt.");
  if (v.status === "ready" || v.status === "return") return;
  if (
    v.returnOrder?.assignment === v.assignment &&
    v.returnOrder.mission === v.mission
  )
    return;
  v.returnOrder = {
    assignment: v.assignment,
    mission: v.mission,
    actor,
    requested: s.time,
    retryAt: s.time,
    reason: "Rückkehr angeordnet",
    state: "pending",
  };
  const m = s.missions.find((m) => m.id === v.mission);
  if (m)
    record(
      s,
      m,
      "RETURN_ORDERED",
      `${v.name}: verbindliche Rückkehr angeordnet; Patientenübergabe und Fahrfähigkeit bleiben erforderlich.`,
      actor,
      v.id,
    );
  advanceReturn(s, v);
}

/** Retry only the deferred order; preserve its assignment across restart and reject stale work. */
export function advanceReturn(s: Save, v: Vehicle) {
  const order = v.returnOrder;
  if (!order) return;
  if (order.state === "returning" && v.status === "return") return;
  if (v.assignment !== order.assignment || v.mission !== order.mission) {
    delete v.returnOrder;
    return;
  }
  if (v.patients > 0) {
    order.state = "clinic";
    order.reason =
      "Patienten zuerst zur Klinik bringen und tatsächlich übergeben; anschließend Rückkehr.";
    return;
  }
  if (s.time < order.retryAt) return;
  order.retryAt = s.time + 30;
  order.state = "pending";
  if (v.fault && v.fault.state !== "repaired") {
    order.reason = "Rückkehr wartet auf Behebung des Fahrzeugdefekts.";
    return;
  }
  const staged = structuredClone(s),
    unit = staged.vehicles.find((u) => u.id === v.id)!;
  try {
    recall(staged, unit);
    if (unit.journey?.blockedUntil) {
      order.reason =
        "Rückroute derzeit blockiert; erneute Prüfung in 30 Sekunden.";
      return;
    }
  } catch (error) {
    if (!(error instanceof GermanyRoutingError)) throw error;
    order.reason = "Keine nutzbare Rückroute; erneute Prüfung in 30 Sekunden.";
    return;
  }
  unit.returnOrder = {
    ...order,
    state: "returning",
    reason: "Auf Rückfahrt zur Wache",
  };
  // Keep object identities used by this tick's patient/vehicle iteration.
  Object.assign(v, unit);
  s.contributions = staged.contributions;
  s.desk = staged.desk;
  const mission = [...s.missions, ...s.archive].find(
    (m) => m.id === order.mission,
  );
  const stagedMission = [...staged.missions, ...staged.archive].find(
    (m) => m.id === order.mission,
  );
  if (mission && stagedMission) {
    if (stagedMission.major) {
      stagedMission.major.placements = stagedMission.major.placements.filter(
        (p) => p.vehicle !== v.id || p.assignment !== order.assignment,
      );
      for (const section of stagedMission.major.sections)
        if (
          section.leader?.vehicle === v.id &&
          section.leader.assignment === order.assignment
        )
          delete section.leader;
    }
    Object.assign(mission, stagedMission);
  }
  // Object.assign does not remove optional fields released by recall.
  delete v.waterTrip;
  delete v.turnout;
  delete v.destination;
}
