import type { Save, Vehicle } from "./model";
import { vt } from "./catalog";
import { along, length, route, METERS_PER_UNIT, type Point } from "./world";

export const travelling = (v: Vehicle) =>
  ["travel", "transport", "return"].includes(v.status);
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
  const total = length(v.path) * METERS_PER_UNIT;
  return {
    seconds,
    total,
    remaining:
      total *
      Math.max(0, Math.min(1, seconds / Math.max(1, v.arrive - v.depart))),
  };
}
export function approach(s: Save, v: Vehicle, target: Point) {
  const origin = travelling(v)
    ? along(v.path, (s.time - v.depart) / Math.max(1, v.arrive - v.depart))
    : (v.path.at(-1) ?? s.buildings.find((b) => b.id === v.home)!.pos);
  try {
    const meters =
      length(route(origin, target, vt(v.type).mode)) * METERS_PER_UNIT;
    return `${kilometers(meters)} · ca. ${duration(Math.max(3, meters / (vt(v.type).speed / 3.6)))}`;
  } catch {
    return "Kein erreichbarer Fahrweg";
  }
}
export function tripLabel(v: Vehicle, time: number) {
  if (!travelling(v))
    return v.status === "scene" ? "Am Einsatzort" : "Alarmierung läuft";
  const t = trip(v, time);
  return `${kilometers(t.remaining)} verbleibend · ${duration(t.seconds)} bis Ziel · Strecke ${kilometers(t.total)}`;
}
