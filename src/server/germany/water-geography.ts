import type { GermanyProvider } from "../../shared/germany/world";
import {
  meters,
  METERS_PER_UNIT,
  inBounds,
  type Point,
} from "../../shared/germany/projection";
import type {
  WaterSource,
  WaterArea,
  WaterConnection,
} from "../../shared/germany/water";
import { WaterIndex } from "./water-index";
import { WORLD_SEED } from "../../shared/product";
import { sample } from "../../simulation/random";
import { GermanyRoutingError } from "../../shared/germany/errors";
import { setImmediate as yieldRead } from "node:timers/promises";
const CELL = 180 / METERS_PER_UNIT;
const flow: Record<WaterArea, number> = {
  center: 900,
  residential: 700,
  industrial: 1000,
  village: 450,
  farm: 300,
  unbuilt: 0,
  unknown: 0,
};
const density: Record<WaterArea, number> = {
  center: 1,
  residential: 0.8,
  industrial: 0.85,
  village: 0.4,
  farm: 0.08,
  unbuilt: 0,
  unknown: 0,
};
export class WaterGeography {
  private cells = new Map<string, WaterSource[]>();
  private paths = new Map<string, WaterConnection | undefined>();
  private index?: WaterIndex;
  private evaluated = new Map<string, WaterSource>();
  constructor(
    private provider: GermanyProvider,
    private clearAccess: (a: Point, b: Point) => boolean,
    path?: string,
  ) {
    if (path) this.index = new WaterIndex(path, provider.dataset);
  }
  private cell(x: number, y: number, nearby?: ReturnType<WaterIndex["query"]>) {
    const key = `${x}:${y}`;
    const cached = this.cells.get(key);
    if (cached) return cached;
    const center = { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL };
    if (!inBounds(center)) return [];
    const real = nearby ?? this.index?.query(center, 400, 1024) ?? [];
    const result: WaterSource[] = [];
    for (const mapped of real) {
      if (
        Math.floor(mapped.pos.x / CELL) !== x ||
        Math.floor(mapped.pos.y / CELL) !== y
      )
        continue;
      result.push({
        id: `osm:${mapped.id}`,
        pos: mapped.pos,
        access: mapped.pos,
        kind:
          mapped.properties.emergency === "suction_point" ||
          mapped.properties["fire_hydrant:pressure"] === "suction"
            ? "open-water"
            : "hydrant",
        origin: "openstreetmap",
        snapshot: this.index!.snapshot,
        dataset: this.provider.dataset,
        area: "unknown",
        flowLpm: 600,
        flowSource: "simulation-v1",
        properties: mapped.properties,
        quality: [
          "Lage und eingetragene Eigenschaften aus OSM; Förderleistung ist ein endlicher Spielwert, keine Messung.",
        ],
      });
    }
    // A cell with mapped intakes is not a mapping gap. Its real sources win;
    // access geometry is evaluated only for an actual detail or simulation query.
    const environment = result.length
      ? undefined
      : this.provider.waterEnvironment?.(center);
    const candidates = (
      !environment || !density[environment.area]
        ? []
        : this.provider.querySites(center, 300 / METERS_PER_UNIT, 128)
    )
      .filter(
        (p) =>
          Math.floor(p.x / CELL) === x &&
          Math.floor(p.y / CELL) === y &&
          !/motorway|trunk|track/.test(p.roadClass),
      )
      .sort((a, b) => meters(center, a) - meters(center, b) || a.id - b.id)
      .slice(0, 8);
    for (const anchor of candidates) {
      const area = this.provider.waterEnvironment?.(anchor);
      if (
        !area ||
        area.blocked ||
        sample(WORLD_SEED, `water-v1:${this.provider.dataset}:${x}:${y}`) >
          density[area.area]
      )
        continue;
      if (real.some((r) => meters(r.pos, anchor) < 140)) break;
      // Side of a mapped local road; polygon validation rejects buildings, rail and water.
      const pos = { x: anchor.x + 2 / METERS_PER_UNIT, y: anchor.y };
      if (!this.clearAccess(pos, anchor)) continue;
      result.push({
        id: `sim:water-v1:${anchor.id}`,
        pos,
        access: { x: anchor.x, y: anchor.y },
        kind: "hydrant",
        origin: "simulation-v1",
        snapshot: "water-v1",
        dataset: this.provider.dataset,
        area: area.area,
        flowLpm: flow[area.area],
        flowSource: "simulation-v1",
        properties: {
          road: `osm-anchor:${anchor.id}`,
          environment: area.reference,
        },
        quality: [
          "Simulierte Ergänzung einer Kartierungslücke; kein real erfasster Hydrant.",
          "Dichte und Förderleistung sind Spielannahmen, keine örtliche Versorgungszusage.",
        ],
      });
      break;
    }
    this.cells.set(key, result);
    if (this.cells.size > 20000)
      this.cells.delete(this.cells.keys().next().value!);
    return result;
  }
  private evaluate(source: WaterSource): WaterSource {
    if (source.origin !== "openstreetmap") return source;
    const cached = this.evaluated.get(source.id);
    if (cached) return cached;
    const properties = source.properties,
      unavailable =
        properties.disused === "yes" ||
        ["no", "private"].includes(properties.access) ||
        ["broken", "out_of_service"].includes(properties.operational_status);
    let access: Point = source.pos,
      area: WaterArea = "unknown",
      reason = unavailable
        ? "OSM meldet einen gesperrten oder nicht betriebsfähigen Zugang."
        : "";
    try {
      const road = this.provider.nearest(source.pos);
      access = { x: road.x, y: road.y };
      if (
        meters(access, source.pos) > 80 ||
        /motorway|trunk/.test(road.roadClass) ||
        !this.clearAccess(source.pos, access)
      )
        reason ||= "Geeigneter Zugang ist nicht belegt.";
      area = this.provider.waterEnvironment?.(access)?.area ?? "unknown";
    } catch (error) {
      if (!(error instanceof GermanyRoutingError)) throw error;
      reason ||= "Geeigneter Zugang ist nicht belegt.";
    }
    const value = {
      ...source,
      access,
      area,
      usable: !reason,
      reason,
      flowLpm: flow[area] || 600,
    };
    this.evaluated.set(source.id, value);
    if (this.evaluated.size > 8192)
      this.evaluated.delete(this.evaluated.keys().next().value!);
    return value;
  }
  detail(point: Point, id: string) {
    const source = this.query(point, 250, 1024, false).find((s) => s.id === id);
    return source ? this.evaluate(source) : undefined;
  }
  query(point: Point, radiusMeters: number, limit: number, verify = true) {
    const sorted = this.select(
      [...this.scan(point, radiusMeters, limit)].flat(),
      point,
      radiusMeters,
      limit,
    );
    return verify ? sorted.map((source) => this.evaluate(source)) : sorted;
  }
  async mapQuery(
    point: Point,
    radiusMeters: number,
    limit: number,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const result: WaterSource[] = [];
    let slice = performance.now();
    for (const sources of this.scan(point, radiusMeters, limit)) {
      signal?.throwIfAborted();
      result.push(...sources);
      if (performance.now() - slice >= 4) {
        await yieldRead(undefined, { signal });
        slice = performance.now();
      }
    }
    return this.select(result, point, radiusMeters, limit);
  }
  private select(
    result: WaterSource[],
    point: Point,
    radiusMeters: number,
    limit: number,
  ) {
    return [
      ...new Map(
        result
          .filter((r) => meters(r.pos, point) <= radiusMeters)
          .map((r) => [r.id, r]),
      ).values(),
    ]
      .sort(
        (a, b) =>
          meters(point, a.pos) - meters(point, b.pos) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, limit);
  }
  private *scan(
    point: Point,
    radiusMeters: number,
    limit: number,
  ): Generator<WaterSource[]> {
    if (radiusMeters < 1 || radiusMeters > 10000 || limit < 1 || limit > 50000)
      throw Error("Wasserquellenabfrage außerhalb des erlaubten Bereichs.");
    const radius = radiusMeters / (METERS_PER_UNIT * 0.85),
      cells: { x: number; y: number }[] = [];
    for (
      let x = Math.floor((point.x - radius) / CELL);
      x <= Math.floor((point.x + radius) / CELL);
      x++
    )
      for (
        let y = Math.floor((point.y - radius) / CELL);
        y <= Math.floor((point.y + radius) / CELL);
        y++
      )
        if (
          meters(point, { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL }) <=
          radiusMeters + 180
        )
          cells.push({ x, y });
    // One spatial index read per uncached viewport, not one SQL range scan per cell.
    const mapped = new Map<string, ReturnType<WaterIndex["query"]>>();
    if (this.index && cells.some(({ x, y }) => !this.cells.has(`${x}:${y}`)))
      for (const row of this.index.query(point, radiusMeters + 600, 50000)) {
        const key = `${Math.floor(row.pos.x / CELL)}:${Math.floor(row.pos.y / CELL)}`,
          group = mapped.get(key) ?? [];
        group.push(row);
        mapped.set(key, group);
      }
    for (const { x, y } of cells) {
      const nearby: ReturnType<WaterIndex["query"]> = [];
      if (!this.cells.has(`${x}:${y}`))
        for (let dx = -3; dx <= 3; dx++)
          for (let dy = -3; dy <= 3; dy++)
            nearby.push(...(mapped.get(`${x + dx}:${y + dy}`) ?? []));
      // Yield even for empty countryside cells so cancelled views stop promptly.
      yield this.cell(x, y, nearby);
    }
  }
  connection(source: WaterSource, target: Point) {
    if (source.usable === false) return;
    const key = `${source.id}:${target.x}:${target.y}`;
    if (this.paths.has(key)) return this.paths.get(key);
    let result: WaterConnection | undefined;
    try {
      const path = this.provider.route(
        source.access,
        target,
        "road",
        new Set(),
        40,
        new Map(),
        1,
      );
      if (
        path.length &&
        meters(source.access, path[0]) < 15 &&
        meters(target, path.at(-1)!) < 15 &&
        this.clearAccess(path.at(-1)!, target)
      ) {
        const length =
          meters(source.pos, source.access) +
          path.slice(1).reduce((n, p, i) => n + meters(path[i], p), 0) +
          meters(path.at(-1)!, target);
        if (length <= 3000)
          result = {
            source,
            path: [source.pos, ...path, target],
            meters: length,
          };
      }
      this.paths.set(key, result);
      if (this.paths.size > 256)
        this.paths.delete(this.paths.keys().next().value!);
    } catch (error) {
      if (
        !(error instanceof GermanyRoutingError) ||
        error.code === "unavailable"
      )
        throw error;
      this.paths.set(key, undefined);
    }
    return result;
  }
  close() {
    this.index?.close();
    this.cells.clear();
    this.paths.clear();
    this.evaluated.clear();
  }
}
