import { z } from "zod";
import type { Building, Save, Vehicle } from "../model";
import { extensions, vehicles, vt } from "../catalog";
import { progress } from "../progression";
import {
  crewSummary,
  personAvailable,
  stationCapacity,
  stationProfile,
} from "./staffing";
import { simId } from "./events";
import { injuryReason } from "./responder-recovery";

export const staffingModelSchema = z
  .object({
    version: z.literal(1),
    migratedAt: z.number().finite().nonnegative().max(1e12),
  })
  .strict();

export type StaffingChange = {
  migrated: boolean;
  added: number;
  assigned: number;
  qualifications: number;
  completedTraining: number;
};
type Person = Save["people"][number];

/** Physical vehicles retain their crew throughout an operation, transport and return.
 * A standby replacement can join only at its own commissioned station.
 */
function boundVehicle(v: Vehicle) {
  return v.status !== "ready" || v.patients > 0 || !!v.postIncident;
}

export function buildingStaffingPlan(s: Save, b: Building) {
  const rank = progress(s.xp).level;
  const allowed = vehicles.filter((v) => {
    if (v.home !== b.type || v.level > rank) return false;
    const extension = extensions.find((e) => e.types.includes(v.id));
    return !extension || b.extensions.some((id) => id === extension.id);
  });
  // An old legally owned vehicle keeps its qualification entitlement after migration.
  const owned = s.vehicles
    .filter((v) => v.home === b.id)
    .map((v) => vt(v.type));
  return {
    capacity: stationCapacity(b),
    basicCrew: Math.max(
      0,
      ...allowed.map((v) => v.crew),
      ...owned.map((v) => v.crew),
    ),
    qualifications: [
      ...new Set(
        [...allowed, ...owned].flatMap((v) => (v.training ? [v.training] : [])),
      ),
    ].sort(),
  };
}

/** Idempotent, server-only provisioning. It never charges money, mutates injuries,
 * resets routes, moves people between stations or adds people to a bound vehicle.
 * Spare capacity is materialized only when an actual vehicle needs cover.
 */
export function reconcileBuildingStaffing(s: Save): StaffingChange {
  const change: StaffingChange = {
    migrated: !s.staffing,
    added: 0,
    assigned: 0,
    qualifications: 0,
    completedTraining: 0,
  };
  if (!s.staffing) {
    for (const person of s.people) {
      // Historical recruitment was immediate; these are the only paid personnel jobs.
      // Preserve the already purchased skill and finish it once, without a second bill.
      if (person.training) {
        if (!person.skills.includes(person.training))
          person.skills.push(person.training);
        person.training = "";
        person.ready = Math.min(person.ready, s.time);
        change.completedTraining++;
      }
    }
    s.staffing = { version: 1, migratedAt: s.time };
  }
  const homes = new Map<string, Person[]>(),
    fleets = new Map<string, Vehicle[]>();
  const bound = new Set<string>();
  const vehicleIndex = new Map(s.vehicles.map((v) => [v.id, v]));
  for (const v of s.vehicles) {
    const group = fleets.get(v.home) ?? [];
    group.push(v);
    fleets.set(v.home, group);
    if (boundVehicle(v))
      for (const arrival of v.turnout?.arrivals ?? []) {
        if (arrival.available) bound.add(arrival.person);
      }
  }
  for (const p of s.people) {
    const group = homes.get(p.home) ?? [];
    group.push(p);
    homes.set(p.home, group);
    if (
      p.vehicle &&
      vehicleIndex.has(p.vehicle) &&
      boundVehicle(vehicleIndex.get(p.vehicle)!)
    )
      bound.add(p.id);
  }
  const ids = new Set(
    [
      ...s.people,
      ...s.buildings,
      ...s.vehicles,
      ...s.missions,
      ...s.archive,
    ].map((o) => o.id),
  );
  for (const b of s.buildings) {
    if (b.owner !== s.player.id || b.ready > s.time) continue;
    const plan = buildingStaffingPlan(s, b),
      fleet = fleets.get(b.id) ?? [],
      pool = homes.get(b.id) ?? [];
    if (!plan.capacity.slots) continue; // Hospitals/schools operate their built-in services; no dispatch crew.
    for (const p of pool) {
      if (bound.has(p.id)) continue;
      for (const skill of plan.qualifications)
        if (!p.skills.includes(skill)) {
          p.skills.push(skill);
          change.qualifications++;
        }
    }
    const desired = Math.max(
      plan.basicCrew,
      fleet.reduce((sum, v) => sum + vt(v.type).crew, 0),
    );
    const usable = (p: Person) => bound.has(p.id) || !personAvailable(s, p);
    let usableCount = pool.filter(usable).length;
    // A bounded extra crew per station can cover real absence at the station.
    // Injured/bound identities are retained and never healed to make the count fit.
    while (usableCount < desired && pool.length < plan.capacity.people) {
      if (s.people.length >= 12000) break;
      let id = simId(s);
      while (ids.has(id)) id = simId(s);
      ids.add(id);
      const person: Person = {
        id,
        home: b.id,
        vehicle: null,
        skills: [...plan.qualifications],
        training: "",
        ready: s.time,
      };
      pool.push(person);
      s.people.push(person);
      usableCount++;
      change.added++;
    }
    const volunteer = stationProfile(b).kind === "ff";
    // FF crews are called from their station pool by planTurnout; professional
    // crews receive a stable standby assignment, avoiding a manual assign action.
    for (const p of pool) {
      if (bound.has(p.id) || !p.vehicle) continue;
      const v = vehicleIndex.get(p.vehicle);
      if (
        volunteer ||
        !v ||
        personAvailable(s, p) ||
        (vt(v.type).training && !p.skills.includes(vt(v.type).training))
      )
        p.vehicle = null;
    }
    if (volunteer) continue;
    const assigned = new Map<string, Person[]>();
    for (const p of pool)
      if (p.vehicle) {
        const group = assigned.get(p.vehicle) ?? [];
        group.push(p);
        assigned.set(p.vehicle, group);
      }
    for (const v of fleet) {
      if (boundVehicle(v)) continue;
      const type = vt(v.type),
        own = assigned.get(v.id) ?? [];
      for (const p of own.slice(type.crew)) p.vehicle = null;
      let count = Math.min(own.length, type.crew);
      for (const p of pool) {
        if (count >= type.crew) break;
        if (
          bound.has(p.id) ||
          p.vehicle ||
          personAvailable(s, p) ||
          (type.training && !p.skills.includes(type.training))
        )
          continue;
        p.vehicle = v.id;
        count++;
        change.assigned++;
      }
    }
  }
  return change;
}

/** Database v14 runs this on a validated copy inside its backed-up transaction.
 * The returned counters also serve the non-mutating caller's cloned dry run.
 */
export function migrateBuildingStaffing(s: Save) {
  return reconcileBuildingStaffing(s);
}

export function buildingStaffingStatus(s: Save, b: Building) {
  if (b.ready > s.time)
    return {
      state: "construction" as const,
      label: "Bauarbeiten",
      reason: "Inbetriebnahme nach Bauabschluss",
    };
  const fleet = s.vehicles.filter(
    (v) => v.home === b.id && v.status === "ready",
  );
  for (const v of fleet) {
    const crew = crewSummary(s, v);
    if (crew.eligible < crew.required) {
      const injured = s.people.some(
        (p) => p.home === b.id && !!injuryReason(s, p),
      );
      return {
        state: "exception" as const,
        label: "Betriebliche Einschränkung",
        reason: injured
          ? "Verletzte Besatzung; verfügbare Vertretung wird an der Wache eingesetzt."
          : "Verfügbare Besatzung am Standort gebunden; Rückkehr oder Abschluss laufender Aufgaben abwarten.",
      };
    }
  }
  return { state: "ready" as const, label: "Betriebsbereit", reason: "" };
}
