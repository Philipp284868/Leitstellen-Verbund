import type { Save, Vehicle } from "../shared/model";
import { equipmentProfile } from "./vehicle-equipment";
import { beginTrip } from "./trip-start";
import { setFms } from "./fms";
import { drawWater } from "./water-authority";
import { germanyProvider } from "../shared/germany/world";
import { GermanyRoutingError } from "../shared/germany/errors";
/** Uses the existing road, traffic, delay, mileage and vehicle position machinery. */
export function waterTripTick(s: Save, v: Vehicle) {
  const trip = v.waterTrip;
  if (!trip) return false;
  if (!v.mission || !v.assignment) {
    delete v.waterTrip;
    return false;
  }
  if (trip.stage === "inbound") {
    if (!v.journey?.blockedUntil && v.arrive <= s.time) {
      v.status = "scene";
      delete v.waterTrip;
      setFms(s, v, 4, "server", "Löschwasser wieder an der Einsatzstelle");
    }
    return true;
  }
  if (
    trip.stage === "outbound" &&
    (v.journey?.blockedUntil || v.arrive > s.time)
  )
    return true;
  try {
    // An old pre-migration journey finishes physically before choosing a validated source.
    if (!trip.source && s.time >= trip.readyAt) {
      trip.source = germanyProvider()
        .waterSources?.(v.path.at(-1)!, 1200, 16)
        .find(
          (source) =>
            source.kind === "hydrant" &&
            germanyProvider().waterConnection?.(source, trip.target),
        );
      if (!trip.source) {
        trip.readyAt = s.time + 30;
        return true;
      }
      trip.stage = "queued";
    }
    if (!trip.source) return true;
    if (trip.stage === "queued") {
      if (s.time < trip.readyAt) return true;
      beginTrip(s, v, trip.source.access, "travel", "normal");
      trip.stage = "outbound";
      setFms(
        s,
        v,
        7,
        "server",
        "Wasserpendel: Fahrt zur bestätigten Entnahmestelle",
      );
    } else if (trip.stage === "outbound") {
      v.status = "scene";
      trip.stage = "refilling";
      delete v.journey;
      trip.last = s.time;
      trip.readyAt = s.time + 15;
      setFms(
        s,
        v,
        8,
        "server",
        "Wasserpendel: Anschluss an die Entnahmestelle",
      );
    } else if (trip.stage === "refilling" && s.time >= trip.readyAt) {
      const profile = equipmentProfile(v);
      v.supplies ??= { water: 0, refilledAt: s.time };
      const seconds = Math.max(0, Math.min(5, s.time - (trip.last ?? s.time)));
      trip.last = s.time;
      const missing = Math.max(0, profile.water - v.supplies.water);
      if (seconds && missing)
        v.supplies.water += drawWater(
          trip.source,
          `shuttle:${v.id}`,
          s.time,
          Math.min(missing, (profile.pumpLpm * seconds) / 60),
          seconds,
        );
      if (v.supplies.water + 0.001 >= profile.water) {
        beginTrip(s, v, trip.target, "travel");
        trip.stage = "inbound";
        v.supplies.refilledAt = s.time;
        setFms(s, v, 3, "server", "Wasserpendel: Rückkehr mit gefülltem Tank");
      }
    }
  } catch (error) {
    if (!(error instanceof GermanyRoutingError)) throw error;
    trip.readyAt = s.time + 30;
  }
  return true;
}
