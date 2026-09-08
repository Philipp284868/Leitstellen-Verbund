import { meters, METERS_PER_UNIT, type Point } from "./projection";
export { WORLD_WIDTH, WORLD_HEIGHT, METERS_PER_UNIT } from "./projection";
export type { Point } from "./projection";
export const WORLD: string = "germany-1";
export const LEGACY_WORLD = "falkenried-1";
export type RoadKind = "main" | "street" | "lane" | "country";
export type RoadSection = {
  id: string;
  a: number;
  b: number;
  meters: number;
  limit: number;
  name: string;
  kind: RoadKind;
  direction: "forward" | "both";
  source: "openstreetmap";
  access: "road";
  bridge?: boolean;
  tunnel?: boolean;
  waitSeconds?: number;
};
export type Road = {
  name: string;
  kind: RoadKind;
  ids: number[];
  points: Point[];
};
export type Anchor = Point & { id: number; name: string; roadClass: string };
export type Hospital = Point & {
  id: string;
  name: string;
  osmLocation?: Point;
};
export type RoadProjection = {
  point: Point;
  section: RoadSection;
  fraction: number;
  distance: number;
};
export interface GermanyProvider {
  readonly dataset: string;
  node(id: number): Anchor | undefined;
  nearest(point: Point): Anchor;
  querySites(center: Point, radius: number, limit: number): Anchor[];
  projectRoad(point: Point): RoadProjection;
  sectionBetween(a: Point, b: Point): RoadSection;
  route(
    a: Point,
    b: Point,
    mode: "road" | "air" | "water",
    blocked: ReadonlySet<string>,
    maxSpeed: number,
    delays: ReadonlyMap<string, number>,
    timeFactor: number,
  ): Point[];
  districtAt(point: Point): string;
  addressAt(point: Point): string;
  isLandSite(point: Point): boolean;
  hospitals(point: Point, limit: number): Hospital[];
  close(): void | Promise<void>;
}
let installed: GermanyProvider | undefined;
export function installGermanyProvider(provider: GermanyProvider) {
  installed = provider;
}
export function germanyProvider(): GermanyProvider {
  if (!installed)
    throw Error("Deutschland-Geodaten sind noch nicht verfügbar.");
  return installed;
}
export function clearGermanyProvider(provider: GermanyProvider) {
  if (installed === provider) installed = undefined;
}
export const distance = (a: Point, b: Point) => meters(a, b) / METERS_PER_UNIT;
// Compatibility facade only: numeric access resolves a stable OSM ID in the index.
// Deliberately no nationwide array iteration. World queries use querySites instead.
export const nodes: Point[] = new Proxy([] as Point[], {
  get(target, key, receiver) {
    if (typeof key === "string" && /^(0|[1-9]\d*)$/.test(key)) {
      const anchor = installed?.node(Number(key));
      return anchor && { x: anchor.x, y: anchor.y };
    }
    if (key === "length") return 0;
    return Reflect.get(target, key, receiver);
  },
});
export const roads: Road[] = [];
export const roadSections: RoadSection[] = [];
export const edges: [number, number][] = [];
export const districts: (Point & { name: string })[] = [];
export const originalNodes: Point[] = [];
export const overpasses: {
  x: number;
  y: number;
  upper: string;
  lower: string;
  angle: number;
}[] = [];
export const docks: Point[] = [];
export const nearest = (point: Point) => germanyProvider().nearest(point).id;
export const querySites = (
  center: Point,
  radius: number,
  limit = 512,
): Point[] =>
  germanyProvider()
    .querySites(center, radius, limit)
    .map(({ x, y }) => ({ x, y }));
export const districtAt = (point: Point) => germanyProvider().districtAt(point);
export const addressAt = (point: Point) => germanyProvider().addressAt(point);
export const isLandSite = (point: Point) => germanyProvider().isLandSite(point);
export const isWaterSite = (_point: Point) => false;
export const projectRoad = (point: Point) =>
  germanyProvider().projectRoad(point);
export const roadSectionBetween = (a: Point, b: Point) =>
  germanyProvider().sectionBetween(a, b);
export function hospitalAt(point: Point): Hospital {
  const found = germanyProvider().hospitals(point, 1)[0];
  if (!found)
    throw Error(
      "Keine erreichbare öffentliche Klinik in den Geodaten gefunden.",
    );
  return found;
}
// Kept only for historical consumers; actual Germany hospital selection uses hospitalAt(origin).
export const publicHospital: Point = new Proxy({} as Point, {
  get(_target, key) {
    if (key === "x" || key === "y")
      throw Error("Deutschland benötigt eine regional gewählte Klinik.");
    return undefined;
  },
});
export function route(
  a: Point,
  b: Point,
  mode: "road" | "air" | "water" = "road",
  blocked: ReadonlySet<string> = new Set(),
  maxSpeed = 120,
  delays: ReadonlyMap<string, number> = new Map(),
  timeFactor = 1,
) {
  return germanyProvider().route(
    a,
    b,
    mode,
    blocked,
    maxSpeed,
    delays,
    timeFactor,
  );
}
export const length = (path: Point[]) =>
  path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0);
export function along(path: Point[], fraction: number): Point {
  let left = length(path) * Math.max(0, Math.min(1, fraction));
  for (let i = 1; i < path.length; i++) {
    const segment = distance(path[i - 1], path[i]);
    if (left <= segment) {
      const f = segment ? left / segment : 0;
      return {
        x: path[i - 1].x + (path[i].x - path[i - 1].x) * f,
        y: path[i - 1].y + (path[i].y - path[i - 1].y) * f,
      };
    }
    left -= segment;
  }
  const last = path.at(-1);
  if (!last) throw Error("Fahrzeugroute hat keine Position.");
  return last;
}
