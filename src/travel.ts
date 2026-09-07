import { routePlan } from "./simulation/traffic";
import type { TravelMode } from "./simulation/dynamics-schema";
import type { Save, Vehicle } from "./model";
import { along, length, METERS_PER_UNIT, type Point } from "./world";

export const travelling = (v: Vehicle) =>
  ["travel", "transport", "return"].includes(v.status) &&
  (!v.fault || v.fault.state === "repaired");
export function duration(seconds: number) {
  const n = Math.max(0, Math.ceil(seconds));
  return n >= 3600
    ? `${Math.floor(n / 3600)} h ${Math.floor((n % 3600) / 60)} min`
    : n >= 60
      ? `${Math.floor(n / 60)} min ${n % 60} s`
      : `${n} s`;
}
export const kilometers = (meters: number) =>
  `${(meters / 1000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
export function trip(v: Vehicle, time: number) {
  const seconds = travelling(v) ? Math.max(0, v.arrive - time) : 0;
  const leg = length(v.path) * METERS_PER_UNIT;
  const total = leg + (v.journey?.distanceDone || 0);
  return {
    seconds,
    total,
    remaining:
      leg *
      Math.max(0, Math.min(1, seconds / Math.max(1, v.arrive - v.depart))),
  };
}
export function approach(
  s: Save,
  v: Vehicle,
  target: Point,
  mode: TravelMode = "priority",
) {
  const origin = travelling(v)
    ? along(v.path, (s.time - v.depart) / Math.max(1, v.arrive - v.depart))
    : (v.path.at(-1) ?? s.buildings.find((b) => b.id === v.home)!.pos);
  try {
    const plan = routePlan(s, v, origin, target, mode);
    const meters = length(plan.path) * METERS_PER_UNIT;
    return `${kilometers(meters)} · ca. ${duration(plan.seconds)}${plan.blockedUntil ? " · Straße gesperrt" : ""}`;
  } catch {
    return "Kein erreichbarer Fahrweg";
  }
}
export function tripLabel(v: Vehicle, time: number) {
  if (v.fault && v.fault.state !== "repaired")
    return v.fault.state === "repairing"
      ? `Fahrzeugdefekt · Reparatur noch ${duration(v.fault.repairAt - time)}`
      : "Fahrzeugdefekt · Reparatur erforderlich";
  if (v.journey?.blockedUntil)
    return `Wartet auf Freigabe · frühestens in ${duration(v.journey.blockedUntil - time)}`;
  if (!travelling(v))
    return v.status === "scene" ? "Am Einsatzort" : "Alarmierung läuft";
  const t = trip(v, time);
  return `${kilometers(t.remaining)} verbleibend · ${duration(t.seconds)} bis Ziel · Strecke ${kilometers(t.total)}`;
}
