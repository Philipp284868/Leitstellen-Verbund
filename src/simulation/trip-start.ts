import type { Save, Vehicle } from "../shared/model";
import type { Point } from "../shared/world";
import type { TravelMode } from "./dynamics-schema";
import { vehiclePosition } from "../shared/vehicle-position";
import { routePlan, routeWeatherKey } from "./traffic";
export function beginTrip(
  s: Save,
  v: Vehicle,
  target: Point,
  status: Vehicle["status"],
  mode: TravelMode = status === "return" ? "normal" : "priority",
) {
  const origin = ["travel", "return", "transport"].includes(v.status)
    ? vehiclePosition(v, s.time)
    : v.status === "alarmed"
      ? v.path[0]
      : (v.path.at(-1) ?? s.buildings.find((b) => b.id === v.home)!.pos);
  const plan = routePlan(s, v, origin, target, mode);
  v.path = plan.path;
  v.depart = s.time;
  v.arrive = s.time + plan.seconds;
  v.journey = {
    motion: plan.motion,
    motionVersion: 1,
    wait: plan.wait,
    mode,
    planned: plan.planned,
    plannedSeconds: plan.plannedSeconds,
    delay: plan.delay,
    distanceDone: 0,
    events: [...plan.events, routeWeatherKey(s)],
    nextCheck: s.time + 60,
    serial: 0,
    target,
    blockedUntil: plan.blockedUntil,
    reason:
      plan.reason ||
      (plan.blockedUntil
        ? "Fahrt wetter- oder verkehrsbedingt ausgesetzt; warte auf Freigabe"
        : ""),
  };
  v.status = status;
}
