import { pointAlong, polylineLength } from "../geometry";
import type { FacilityCatalog } from "../facilities/types";
import { meters, METERS_PER_UNIT, type Point } from "./projection";
export { METERS_PER_UNIT, WORLD_HEIGHT, WORLD_WIDTH } from "./projection";
export type { Point } from "./projection";
export const WORLD: string = "germany-1";
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
export type Anchor = Point & { id: number; name: string; roadClass: string };
export type IncidentSiteKind =
  | "street"
  | "residential"
  | "commercial"
  | "industrial"
  | "forest"
  | "field"
  | "rail"
  | "public"
  | "water"
  | "construction";
export type Hospital = Point & {
  id: string;
  name: string;
  osmLocation?: Point;
  facilityId?: string;
  aliases?: string[];
  emergency?: "yes" | "no" | "unknown";
};
export type RoadProjection = {
  point: Point;
  section: RoadSection;
  fraction: number;
  distance: number;
};
export interface GermanyProvider {
  readonly facilities?: FacilityCatalog;
  readonly dataset: string;
  node(id: number): Anchor | undefined;
  nearest(point: Point): Anchor;
  querySites(center: Point, radius: number, limit: number): Anchor[];
  queryIncidentSites?(
    center: Point,
    radius: number,
    kind: IncidentSiteKind,
    limit: number,
  ): Anchor[];
  incidentEvidence?(
    point: Point,
    kind: IncidentSiteKind,
  ): { reference: string; distanceMeters: number } | undefined;
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
  isWaterSite?(point: Point): boolean;
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
export const queryIncidentSites = (
  center: Point,
  radius: number,
  kind: IncidentSiteKind,
  limit = 32,
): Point[] => {
  const provider = germanyProvider();
  const sites = provider.queryIncidentSites
    ? provider.queryIncidentSites(center, radius, kind, limit)
    : kind === "street"
      ? provider.querySites(center, radius, limit)
      : [];
  return sites.map(({ x, y }) => ({ x, y }));
};
export const addressAt = (point: Point) => germanyProvider().addressAt(point);
export const isLandSite = (point: Point) => germanyProvider().isLandSite(point);
export const isWaterSite = (point: Point) =>
  germanyProvider().isWaterSite?.(point) ?? false;
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
export const length = (path: Point[]) => polylineLength(path, distance);
export const along = (path: Point[], fraction: number) =>
  pointAlong(path, fraction, distance);
