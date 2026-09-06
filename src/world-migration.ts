import type { Save } from "./model";
import { vt, mt, bt } from "./catalog";
import {
  originalNodes,
  distance,
  route,
  docks,
  publicHospital,
  type Point,
} from "./world";
export const legacyNodes: Point[] = Array.from({ length: 117 }, (_, i) => ({
  x: 60 + (i % 13) * 95,
  y: 65 + Math.floor(i / 13) * 85,
}));
const legacyDocks = [legacyNodes[76], legacyNodes[89], legacyNodes[102]];
const closest = (p: Point, points: Point[]) =>
  points.reduce((a, b) => (distance(a, p) < distance(b, p) ? a : b));
export function validLegacySite(p: Point, water: boolean) {
  return (
    distance(p, closest(p, legacyNodes)) <= 1 &&
    (!water || legacyDocks.some((d) => distance(d, p) < 55))
  );
}
// Allocate each old parcel a distinct roadside location. Shared coordinates remain
// identical for every account, without collapsing neighboring old stations.
const reserved = [publicHospital, ...docks];
const mapped = legacyNodes.map((p, i) => {
  if (i === 58) return publicHospital;
  const dock = [76, 89, 102].indexOf(i);
  if (dock >= 0) return docks[dock];
  const candidate = [...originalNodes]
    .sort((a, b) => distance(a, p) - distance(b, p))
    .find((n) => reserved.every((q) => distance(n, q) >= 22));
  if (!candidate) throw Error("Kartenmigration: Kein freier Ersatzbauplatz.");
  reserved.push(candidate);
  return candidate;
});
/** Coordinate-only migration: IDs, ownership, rewards, assignments and trip clocks stay intact. */
export function migrateMap(s: Save): Save {
  const relocate = (p: Point, water = false): Point => {
    const dock = legacyDocks.findIndex((d) => distance(d, p) < 1);
    if (water || dock >= 0) {
      const i = dock >= 0 ? dock : legacyDocks.indexOf(closest(p, legacyDocks));
      return { ...docks[i] };
    }
    if (distance(p, legacyNodes[58]) < 1) return { ...publicHospital };
    return { ...mapped[legacyNodes.indexOf(closest(p, legacyNodes))] };
  };
  // The same old coordinate always becomes the same new coordinate, including remote mission targets.
  for (const b of s.buildings) b.pos = relocate(b.pos, !!bt(b.type).water);
  for (const m of [...s.missions, ...s.archive])
    m.pos = relocate(m.pos, mt(m.template).water);
  for (const v of s.vehicles) {
    const mode = vt(v.type).mode;
    if (v.status === "ready")
      v.path = [{ ...s.buildings.find((b) => b.id === v.home)!.pos }];
    else {
      const first = relocate(v.path[0], mode === "water");
      const last =
        v.status === "return"
          ? s.buildings.find((b) => b.id === v.home)!.pos
          : relocate(v.path.at(-1)!, mode === "water");
      v.path = v.status === "scene" ? [last] : route(first, last, mode);
    }
  }
  return s;
}
