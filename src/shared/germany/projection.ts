/** Display projection: spherical Mercator scaled at 51°N, 12 projected metres per unit.
 * Route lengths always use geodesy/GH section distances, never Mercator distance.
 */
import type { Point } from "../geometry";
export type { Point } from "../geometry";
export interface Geographic {
  lon: number;
  lat: number;
}
export const BOUNDS = [5.5, 47.1, 15.6, 55.2] as const;
export const METERS_PER_UNIT = 12;
const R = 6371008.8;
const radians = Math.PI / 180;
const scale = Math.cos(51 * radians);
const north = Math.log(Math.tan(Math.PI / 4 + (BOUNDS[3] * radians) / 2));
export function project({ lon, lat }: Geographic): Point {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) >= 85)
    throw Error("Ungültige geografische Koordinate.");
  return {
    x: (R * scale * (lon - BOUNDS[0]) * radians) / METERS_PER_UNIT,
    y:
      (R *
        scale *
        (north - Math.log(Math.tan(Math.PI / 4 + (lat * radians) / 2)))) /
      METERS_PER_UNIT,
  };
}
export function unproject({ x, y }: Point): Geographic {
  return {
    lon: BOUNDS[0] + (x * METERS_PER_UNIT) / (R * scale * radians),
    lat:
      (2 * Math.atan(Math.exp(north - (y * METERS_PER_UNIT) / (R * scale))) -
        Math.PI / 2) /
      radians,
  };
}
export function meters(a: Point, b: Point): number {
  const p = unproject(a),
    q = unproject(b);
  const dlat = (q.lat - p.lat) * radians,
    dlon = (q.lon - p.lon) * radians;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(p.lat * radians) *
      Math.cos(q.lat * radians) *
      Math.sin(dlon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export const WORLD_WIDTH = project({ lon: BOUNDS[2], lat: BOUNDS[1] }).x;
export const WORLD_HEIGHT = project({ lon: BOUNDS[2], lat: BOUNDS[1] }).y;
export const WORLD_CENTER = project({ lon: 13.405, lat: 52.52 });
export function inBounds(p: Point): boolean {
  return (
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    p.x >= 0 &&
    p.y >= 0 &&
    p.x <= WORLD_WIDTH &&
    p.y <= WORLD_HEIGHT
  );
}
