import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { RoutingBridge } from "./bridge";
import { GermanyIncidentGeography } from "./geography-sites";
import { GermanyRoutingError } from "../../src/germany/errors";
import {
  adaptGraphHopperRoute,
  graphHopperRequest,
  type GermanyRoute,
  type GermanyLeg,
} from "../../src/germany/route";
import {
  project,
  unproject,
  meters,
  METERS_PER_UNIT,
  inBounds,
  type Point,
} from "../../src/germany/projection";
import {
  clearGermanyProvider,
  installGermanyProvider,
  type GermanyProvider,
  type Anchor,
  type Hospital,
  type RoadSection,
  type RoadProjection,
  type RoadKind,
  type IncidentSiteKind,
} from "../../src/germany/world";

type Row = Record<string, unknown>;
const pointKey = (p: Point) => `${p.x},${p.y}`;
const pairKey = (a: Point, b: Point) => `${pointKey(a)}/${pointKey(b)}`;
const kind = (roadClass: string): RoadKind =>
  /motorway|trunk|primary/.test(roadClass)
    ? "main"
    : /secondary|tertiary|unclassified/.test(roadClass)
      ? "country"
      : /service|living_street/.test(roadClass)
        ? "lane"
        : "street";
function boundedCache<K, V>(cache: Map<K, V>, key: K, value: V, max: number) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > max) cache.delete(cache.keys().next().value!);
}
function remaining(deadline: number) {
  const budget = deadline - performance.now();
  if (budget <= 0)
    throw new GermanyRoutingError(
      "Die gemeinsame Zeitgrenze für die Standortprüfung wurde erreicht; bitte erneut versuchen.",
      "unavailable",
    );
  return budget;
}
export interface GermanyOptions {
  indexPath: string;
  mapsPath?: string;
  dataset: string;
  routerUrl?: string;
  timeout?: number;
}
export class LocalGermanyProvider implements GermanyProvider {
  readonly dataset: string;
  private db: DatabaseSync;
  private bridge: RoutingBridge;
  private geography?: GermanyIncidentGeography;
  private incidentSitesCache = new Map<string, Anchor[]>();
  private shoreSitesCache = new Map<number, boolean>();
  private anchorCache = new Map<number, Anchor>();
  private routeCache = new Map<string, GermanyRoute>();
  private sections = new Map<string, RoadSection>();
  private legCache = new Map<string, GermanyLeg>();
  private siteCache = new Map<number, boolean>();
  private projectionCache = new Map<number, RoadProjection>();
  private nearestCache = new Map<string, Anchor>();
  private sitesCache = new Map<string, Anchor[]>();
  private closed = false;
  constructor(options: GermanyOptions) {
    if (!/^[a-f0-9]{64}$/.test(options.dataset))
      throw Error("Ungültige Geodatenversion.");
    this.dataset = options.dataset;
    this.db = new DatabaseSync(resolve(options.indexPath), { readOnly: true });
    try {
      for (const table of [
        "metadata",
        "anchors",
        "anchors_rtree",
        "places",
        "places_rtree",
      ])
        if (
          !this.db
            .prepare("SELECT name FROM sqlite_master WHERE name=?")
            .get(table)
        )
          throw Error(`Geodatenindex fehlt: ${table}.`);
      if (!this.db.prepare("SELECT id FROM anchors LIMIT 1").get())
        throw Error("Deutschland-Straßenindex enthält keine Standorte.");
      const source = this.db
        .prepare("SELECT value FROM metadata WHERE key='source_sha256'")
        .get();
      if (source?.value !== this.dataset)
        throw Error(
          "Geodatenkonflikt: Ortsindex und Routingmanifest gehören nicht zum selben OSM-Datenstand.",
        );
      if (options.mapsPath)
        this.geography = new GermanyIncidentGeography(
          resolve(options.mapsPath),
          this.dataset,
        );
      this.bridge = new RoutingBridge(options.routerUrl, options.timeout);
    } catch (e) {
      this.geography?.close();
      this.db.close();
      throw e;
    }
  }
  private anchor(row: Row): Anchor {
    const id = Number(row.id),
      lon = Number(row.lon),
      lat = Number(row.lat);
    if (
      !Number.isSafeInteger(id) ||
      id < 0 ||
      !Number.isFinite(lon) ||
      !Number.isFinite(lat)
    )
      throw Error("Ungültiger OSM-Standort.");
    const result = {
      ...project({ lon, lat }),
      id,
      name: String(row.name || "Unbenannte Straße"),
      roadClass: String(row.road_class || "unclassified"),
    };
    boundedCache(this.anchorCache, id, result, 4096);
    return result;
  }
  node(id: number): Anchor | undefined {
    if (!Number.isSafeInteger(id) || id < 0) return undefined;
    const cached = this.anchorCache.get(id);
    if (cached) return cached;
    const row = this.db.prepare("SELECT * FROM anchors WHERE id=?").get(id);
    return row ? this.anchor(row) : undefined;
  }
  private nearby(
    table: "anchors" | "places",
    center: Point,
    radius: number,
    limit: number,
    clause = "",
  ): Row[] {
    if (
      !inBounds(center) ||
      !Number.isFinite(radius) ||
      radius < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 20000
    )
      throw Error("Ungültige räumliche Abfrage.");
    const { lon, lat } = unproject(center),
      latitude = radius / 110000,
      longitude = latitude / Math.max(0.1, Math.cos((lat * Math.PI) / 180));
    const cosineSquared = Math.cos((lat * Math.PI) / 180) ** 2;
    return this.db
      .prepare(
        `SELECT p.* FROM ${table}_rtree r JOIN ${table} p ON p.id=r.id WHERE r.min_lon<=? AND r.max_lon>=? AND r.min_lat<=? AND r.max_lat>=? ${clause} ORDER BY ((p.lon-?)*(p.lon-?)*?+(p.lat-?)*(p.lat-?)),p.id LIMIT ?`,
      )
      .all(
        lon + longitude,
        lon - longitude,
        lat + latitude,
        lat - latitude,
        lon,
        lon,
        cosineSquared,
        lat,
        lat,
        limit,
      );
  }
  queryIncidentSites(
    center: Point,
    radius: number,
    kind: IncidentSiteKind,
    limit = 32,
  ): Anchor[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 512)
      throw Error("Einsatzstandorte benötigen ein Limit zwischen 1 und 512.");
    if (kind === "street") return this.querySites(center, radius, limit);
    if (!this.geography) return [];
    const key = JSON.stringify([center.x, center.y, radius, kind, limit]),
      cached = this.incidentSitesCache.get(key);
    if (cached) return [...cached];
    const result: Anchor[] = [];
    const rows = this.nearby(
      "anchors",
      center,
      radius * METERS_PER_UNIT,
      20000,
      "AND COALESCE(p.bridge,0)=0 AND COALESCE(p.tunnel,0)=0 AND p.road_class NOT IN ('motorway','motorway_link','trunk','trunk_link')",
    );
    const deadline = performance.now() + Math.min(this.bridge.timeout, 3000);
    let routeAttempts = 0;
    for (const row of rows) {
      const anchor = this.anchor(row);
      if (
        meters(center, anchor) > radius * METERS_PER_UNIT ||
        result.some((chosen) => meters(chosen, anchor) < 50) ||
        !this.geography.evidence(anchor, kind)
      )
        continue;
      if (kind === "water") {
        // An OSM road beside water is not enough: it must be connected to this
        // dispatch center by the installed car graph. Never invent a boat leg.
        if (++routeAttempts > Math.max(32, limit * 2)) break;
        try {
          const route = this.fetchRoute(
            center,
            anchor,
            50,
            remaining(deadline),
          );
          const endpoint = route.path.at(-1);
          if (
            !endpoint ||
            meters(anchor, endpoint) > 2 ||
            !this.geography.evidence(endpoint, kind)
          )
            continue;
        } catch (error) {
          if (
            error instanceof GermanyRoutingError &&
            (error.code === "no-route" || error.code === "blocked")
          )
            continue;
          throw error;
        }
      }
      result.push(anchor);
      if (result.length >= limit) break;
    }
    result.sort((a, b) => a.id - b.id);
    boundedCache(this.incidentSitesCache, key, result, 128);
    return [...result];
  }
  querySites(center: Point, radius: number, limit: number): Anchor[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 4096)
      throw Error("Standortabfragen benötigen ein Limit zwischen 1 und 4096.");
    const key = JSON.stringify([center.x, center.y, radius, limit]),
      cached = this.sitesCache.get(key);
    if (cached) return [...cached];
    const result = this.nearby(
      "anchors",
      center,
      radius * METERS_PER_UNIT,
      Math.min(20000, Math.max(limit * 8, 512)),
    )
      .map((row) => this.anchor(row))
      .filter((p) => meters(center, p) <= radius * METERS_PER_UNIT)
      .sort((a, b) => a.id - b.id)
      .slice(0, limit);
    boundedCache(this.sitesCache, key, result, 128);
    let count = [...this.sitesCache.values()].reduce(
      (n, sites) => n + sites.length,
      0,
    );
    while (count > 65536 && this.sitesCache.size > 1) {
      const first = this.sitesCache.keys().next().value!;
      count -= this.sitesCache.get(first)!.length;
      this.sitesCache.delete(first);
    }
    return [...result];
  }
  nearest(point: Point): Anchor {
    if (!inBounds(point)) throw Error("Position außerhalb Deutschlands.");
    const key = pointKey(point),
      cached = this.nearestCache.get(key);
    if (cached) return cached;
    for (const radius of [100, 500, 2000, 10000, 50000]) {
      const candidates = this.nearby("anchors", point, radius, 2048).map((r) =>
        this.anchor(r),
      );
      if (!candidates.length) continue;
      candidates.sort(
        (a, b) => meters(point, a) - meters(point, b) || a.id - b.id,
      );
      if (meters(point, candidates[0]) <= radius) {
        boundedCache(this.nearestCache, key, candidates[0], 4096);
        return candidates[0];
      }
    }
    throw Error(
      "Keine motorisiert erreichbare Straße im örtlichen Datenbestand gefunden.",
    );
  }
  private fetchRoute(
    a: Point,
    b: Point,
    maxSpeed: number,
    budget?: number,
  ): GermanyRoute {
    if (!inBounds(a) || !inBounds(b))
      throw Error("Straßenroute außerhalb des Kartengebiets.");
    const key = JSON.stringify([this.dataset, a.x, a.y, b.x, b.y, maxSpeed]),
      cached = this.routeCache.get(key);
    if (cached) {
      this.remember(cached);
      return cached;
    }
    const raw = this.bridge.request(
      "/route",
      graphHopperRequest(unproject(a), unproject(b), maxSpeed),
      budget,
    );
    const result = adaptGraphHopperRoute(raw, this.dataset, maxSpeed);
    if (meters(a, result.path[0]) > 20 || meters(b, result.path.at(-1)!) > 20)
      throw new GermanyRoutingError(
        "Standort hat keine passende Straßenanbindung; Routing darf ihn nicht versetzen.",
        "no-route",
      );
    boundedCache(this.routeCache, key, result, 512);
    // Cap geometry as well as entry count: 512 trans-German routes must not exhaust AMP memory.
    let vertices = [...this.routeCache.values()].reduce(
      (n, r) => n + r.path.length,
      0,
    );
    while (vertices > 200000 && this.routeCache.size > 1) {
      const oldest = this.routeCache.keys().next().value!;
      vertices -= this.routeCache.get(oldest)!.path.length;
      this.routeCache.delete(oldest);
    }
    this.remember(result);
    return result;
  }
  private remember(result: GermanyRoute) {
    for (const leg of result.legs) {
      const key = pairKey(leg.from, leg.to);
      boundedCache(this.legCache, key, leg, 200000);
      boundedCache(
        this.sections,
        key,
        {
          id: leg.edge,
          a: this.coordinateId(leg.from),
          b: this.coordinateId(leg.to),
          meters: leg.meters,
          limit: leg.limit,
          name: leg.name,
          kind: kind(leg.roadClass),
          direction: "forward",
          source: "openstreetmap",
          access: "road",
          bridge: leg.bridge,
          tunnel: leg.tunnel,
          waitSeconds: leg.waitSeconds,
        },
        200000,
      );
    }
  }
  /** Route vertices have a deterministic namespace distinct from OSM node IDs. Never persisted as staff homes. */
  private coordinateId(p: Point) {
    let hash = 14695981039346656037n;
    for (const c of pointKey(p))
      hash = BigInt.asUintN(
        64,
        (hash ^ BigInt(c.charCodeAt(0))) * 1099511628211n,
      );
    return Number(hash & ((1n << 48n) - 1n)) + 2 ** 48;
  }
  route(
    a: Point,
    b: Point,
    mode: "road" | "air" | "water",
    blocked: ReadonlySet<string>,
    maxSpeed: number,
    delays: ReadonlyMap<string, number>,
    timeFactor: number,
  ): Point[] {
    if (
      !Number.isFinite(timeFactor) ||
      timeFactor <= 0 ||
      [...delays.values()].some((n) => !Number.isFinite(n) || n < 0)
    )
      throw Error("Ungültige Verkehrsbedingungen.");
    if (mode === "water")
      throw Error(
        "Für diesen Standort ist keine geprüfte schiffbare Verbindung verfügbar.",
      );
    if (mode === "air") {
      if (!inBounds(a) || !inBounds(b))
        throw Error("Flug außerhalb des Kartengebiets.");
      return [{ ...a }, { ...b }];
    }
    const result = this.fetchRoute(a, b, maxSpeed);
    // GraphHopper's stock API cannot exclude an exact edge ID. Never pretend a polygon is an exact detour.
    // A blocked authoritative edge suspends the trip; the existing traffic scheduler retries after expiry.
    for (const leg of result.legs) {
      const section = this.sectionBetween(leg.from, leg.to);
      if (
        blocked.has(leg.edge) ||
        blocked.has(`${section.a}:${section.b}`) ||
        blocked.has(`${section.b}:${section.a}`)
      )
        throw new GermanyRoutingError(
          "Straßenroute enthält einen gesperrten Abschnitt; bis zur Freigabe warten.",
          "blocked",
        );
    }
    return result.path.map((p) => ({ ...p }));
  }
  sectionBetween(a: Point, b: Point): RoadSection {
    const section = this.sections.get(pairKey(a, b));
    if (!section)
      throw Error(
        "Exakte Straßenabschnittsdaten fehlen; Route muss serverseitig erneuert werden.",
      );
    return section;
  }
  legBetween(a: Point, b: Point): GermanyLeg | undefined {
    return this.legCache.get(pairKey(a, b));
  }
  projectRoad(point: Point): RoadProjection {
    const anchor = this.nearest(point);
    const cached = this.projectionCache.get(anchor.id);
    if (cached)
      return {
        ...cached,
        distance: meters(point, cached.point) / METERS_PER_UNIT,
      };
    const candidates = this.querySites(anchor, 200, 128)
      .filter((p) => p.id !== anchor.id)
      .sort((a, b) => meters(anchor, a) - meters(anchor, b) || a.id - b.id);
    const started = performance.now();
    for (const candidate of candidates.slice(0, 4)) {
      const remaining = this.bridge.timeout - (performance.now() - started);
      if (remaining < 50)
        throw Error("Zeitlimit der Straßenabfrage überschritten.");
      try {
        const result = this.fetchRoute(anchor, candidate, 120, remaining),
          leg = result.legs[0];
        if (!leg) continue;
        const projection = {
          point: leg.from,
          distance: meters(point, leg.from) / METERS_PER_UNIT,
          fraction: 0,
          section: this.sectionBetween(leg.from, leg.to),
        };
        boundedCache(this.projectionCache, anchor.id, projection, 1024);
        return projection;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          /timeout|Zeitlimit|aborted|fetch failed|nicht verfügbar/i.test(
            error.message,
          )
        )
          throw error;
        /* Try another real nearby road endpoint, never invent a connection. */
      }
    }
    throw Error(
      "Keine geprüfte Straßenanbindung für diesen Standort verfügbar.",
    );
  }
  isWaterSite(point: Point): boolean {
    const deadline = performance.now() + Math.min(this.bridge.timeout, 3000);
    if (
      !this.geography ||
      !inBounds(point) ||
      !this.geography.evidence(point, "water")
    )
      return false;
    const anchor = this.nearest(point);
    // A water station is a road-side base with shore access, not a building
    // on a water route. Do not relocate a user-selected shore to a distant road.
    if (
      meters(point, anchor) > 2 ||
      !this.isLandSite(anchor, remaining(deadline))
    )
      return false;
    const cached = this.shoreSitesCache.get(anchor.id);
    if (cached !== undefined) return cached;
    const candidates = this.nearby("anchors", anchor, 2000, 512)
      .map((row) => this.anchor(row))
      .filter((p) => meters(anchor, p) >= 100 && meters(anchor, p) <= 2000)
      .slice(0, 8);
    for (const destination of candidates) {
      try {
        const route = this.fetchRoute(
          anchor,
          destination,
          50,
          remaining(deadline),
        );
        if (route.path.length > 1 && route.meters >= 100) {
          boundedCache(this.shoreSitesCache, anchor.id, true, 4096);
          return true;
        }
      } catch (error) {
        if (
          error instanceof GermanyRoutingError &&
          (error.code === "no-route" || error.code === "blocked")
        )
          continue;
        throw error;
      }
    }
    boundedCache(this.shoreSitesCache, anchor.id, false, 4096);
    return false;
  }
  isLandSite(point: Point, budget?: number): boolean {
    const anchor = this.nearest(point);
    if (meters(anchor, point) > 300) return false;
    const cached = this.siteCache.get(anchor.id);
    if (cached !== undefined) return cached;
    const row = this.db
      .prepare("SELECT * FROM anchors WHERE id=?")
      .get(anchor.id)!;
    if (
      Number(row.bridge || 0) ||
      Number(row.tunnel || 0) ||
      /^(motorway|motorway_link|trunk|trunk_link)$/.test(anchor.roadClass)
    ) {
      boundedCache(this.siteCache, anchor.id, false, 4096);
      return false;
    }
    // A car-profile routing query validates the actual imported graph, unlike /nearest (ALL_EDGES).
    const result = this.fetchRoute(anchor, anchor, 50, budget);
    const valid = meters(anchor, result.path[0]) <= 2;
    boundedCache(this.siteCache, anchor.id, valid, 4096);
    return valid;
  }
  private place(point: Point): Row | undefined {
    for (const radius of [1500, 5000, 20000, 75000]) {
      const candidates = this.nearby(
        "places",
        point,
        radius,
        2048,
        "AND p.kind IN ('city','town','village','hamlet','suburb','neighbourhood','quarter','municipality')",
      );
      if (candidates.length)
        return candidates.sort(
          (a, b) =>
            meters(point, project({ lon: Number(a.lon), lat: Number(a.lat) })) -
              meters(
                point,
                project({ lon: Number(b.lon), lat: Number(b.lat) }),
              ) || Number(a.id) - Number(b.id),
        )[0];
    }
    return undefined;
  }
  districtAt(point: Point): string {
    const p = this.place(point);
    return p ? String(p.display_name || p.name) : "Deutschland";
  }
  addressAt(point: Point): string {
    const anchor = this.nearest(point);
    return `${anchor.name}, ${this.districtAt(point)}`;
  }
  hospitals(point: Point, limit: number): Hospital[] {
    for (const radius of [10000, 40000, 120000, 400000]) {
      const rows = this.nearby(
        "places",
        point,
        radius,
        2048,
        "AND p.kind = 'hospital'",
      );
      const sorted = rows
        .map((r) => ({
          row: r,
          point: project({ lon: Number(r.lon), lat: Number(r.lat) }),
        }))
        .sort(
          (a, b) =>
            meters(point, a.point) - meters(point, b.point) ||
            Number(a.row.id) - Number(b.row.id),
        );
      const result: Hospital[] = [];
      for (const { row, point: site } of sorted.slice(
        0,
        Math.max(limit * 3, 8),
      )) {
        try {
          const anchor = this.nearest(site);
          if (meters(site, anchor) > 300) continue;
          result.push({
            x: anchor.x,
            y: anchor.y,
            id: `${String(row.osm_type)}:${String(row.osm_id)}`,
            name: String(row.name || "Öffentliches Krankenhaus"),
            osmLocation: { x: site.x, y: site.y },
          });
          if (result.length >= limit) break;
        } catch {
          /* An unmapped entrance is not replaced by a fictional location. */
        }
      }
      if (result.length) return result;
    }
    return [];
  }
  health() {
    const info = this.bridge.request("/info");
    if (
      !info ||
      typeof info !== "object" ||
      !("version" in info) ||
      !String(info.version).startsWith("11.")
    )
      throw Error(
        "GraphHopper 11 ist für diesen Geodatenbestand erforderlich.",
      );
    return info;
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    clearGermanyProvider(this);
    this.geography?.close();
    this.incidentSitesCache.clear();
    this.shoreSitesCache.clear();
    this.db.close();
    await this.bridge.close();
  }
}
export async function initializeGermany(
  options: GermanyOptions,
): Promise<LocalGermanyProvider> {
  const provider = new LocalGermanyProvider(options);
  try {
    provider.health();
    installGermanyProvider(provider);
    return provider;
  } catch (e) {
    await provider.close();
    throw e;
  }
}
