import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { VectorTile, classifyRings } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import {
  project,
  unproject,
  meters,
  inBounds,
  type Point,
} from "../../src/germany/projection";
import type { IncidentSiteKind } from "../../src/germany/world";

type Shape = {
  reference: string;
  kinds: IncidentSiteKind[];
  layer: string;
  featureClass: string;
  featureSubclass?: string;
  type: number;
  parts: Point[][];
  polygons: Point[][][];
  bounds: [number, number, number, number];
};
type Tile = { shapes: Shape[]; bytes: number };
export type SiteEvidence = {
  reference: string;
  layer: string;
  featureClass: string;
  featureSubclass?: string;
  distanceMeters: number;
};
const ZOOM = 14,
  COUNT = 2 ** ZOOM;
const MAX_COMPRESSED = 4 * 1024 * 1024;
const MAX_DECODED = 16 * 1024 * 1024;
const MAX_CACHE = 48 * 1024 * 1024;
const MAX_GEOMETRY_POINTS = 250000;
// Count protobuf geometry commands before VectorTile allocates any Point arrays.
// Compressed byte limits alone do not bound an unusually detailed feature.
function checkGeometryBudget(raw: Uint8Array) {
  const reader = new PbfReader(raw);
  let points = 0;
  reader.readFields((tag, _, layerReader) => {
    if (tag !== 3) return;
    layerReader.readMessage((field, _, featureReader) => {
      if (field !== 2) return;
      featureReader.readMessage((featureField, _, geometryReader) => {
        if (featureField !== 4) return;
        const bytes = geometryReader.readVarint(),
          end = geometryReader.pos + bytes;
        if (end > raw.byteLength)
          throw Error("Ungültige OSM-Standortgeometrie.");
        while (geometryReader.pos < end) {
          const command = geometryReader.readVarint(),
            count = Math.floor(command / 8),
            operation = command % 8;
          if (!count || ![1, 2, 7].includes(operation))
            throw Error("Ungültiger OSM-Geometriebefehl.");
          points += count;
          if (points > MAX_GEOMETRY_POINTS)
            throw Error(
              "OSM-Standortkachel überschreitet das Geometriebudget.",
            );
          if (operation !== 7)
            for (let i = 0; i < count * 2; i++) geometryReader.readVarint();
          if (geometryReader.pos > end)
            throw Error("Ungültige OSM-Standortgeometrie.");
        }
      }, undefined);
    }, undefined);
  }, undefined);
}
const PUBLIC = new Set([
  "school",
  "college",
  "university",
  "kindergarten",
  "hospital",
  "library",
  "stadium",
  "pitch",
  "playground",
  "park",
  "recreation_ground",
  "sports_centre",
  "museum",
  "town_hall",
  "townhall",
  "place_of_worship",
  "cinema",
  "theatre",
  "community_centre",
  "fire_station",
  "police",
]);
const COMMERCIAL = new Set([
  "commercial",
  "retail",
  "shop",
  "restaurant",
  "cafe",
  "bar",
  "pub",
  "hotel",
  "supermarket",
  "mall",
  "department_store",
  "marketplace",
  "fuel",
]);
const FIELD = new Set([
  "farmland",
  "meadow",
  "grassland",
  "orchard",
  "vineyard",
]);
const RANGE: Record<Exclude<IncidentSiteKind, "street">, number> = {
  residential: 25,
  commercial: 40,
  industrial: 40,
  forest: 80,
  field: 60,
  rail: 60,
  public: 40,
  water: 60,
  construction: 40,
};
const WATER = new Set([
  "lake",
  "river",
  "ocean",
  "sea",
  "pond",
  "dock",
  "reservoir",
  "basin",
]);

function kindsFor(
  layer: string,
  p: Record<string, string | number | boolean>,
): IncidentSiteKind[] {
  const c = String(p.class || ""),
    sub = String(p.subclass || "");
  if (p.brunnel === "tunnel" || ["1", "true"].includes(String(p.intermittent)))
    return [];
  if (layer === "water") return WATER.has(c) ? ["water"] : [];
  if (layer === "waterway")
    return c === "river" || c === "canal" ? ["water"] : [];
  if (layer === "landcover") {
    if (c === "wood") return ["forest"];
    if (FIELD.has(c) || FIELD.has(sub)) return ["field"];
    if (sub === "park" || sub === "recreation_ground") return ["public"];
  }
  if (layer === "landuse") {
    if (c === "residential") return ["residential"];
    if (COMMERCIAL.has(c)) return ["commercial"];
    if (c === "industrial") return ["industrial"];
    if (c === "railway") return ["rail"];
    if (c === "construction") return ["construction"];
    if (PUBLIC.has(c)) return ["public"];
  }
  if (layer === "transportation") {
    if (c.endsWith("_construction") || c === "construction")
      return ["construction"];
    if (
      c === "rail" ||
      (c === "transit" && ["tram", "light_rail"].includes(sub))
    )
      return ["rail"];
  }
  if (layer === "poi") {
    if (PUBLIC.has(c) || PUBLIC.has(sub)) return ["public"];
    if (COMMERCIAL.has(c) || COMMERCIAL.has(sub)) return ["commercial"];
  }
  return [];
}
function insideRing(p: Point, ring: Point[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      result = !result;
  }
  return result;
}
function inside(p: Point, shape: Shape) {
  return shape.polygons.some(
    ([outer, ...holes]) =>
      insideRing(p, outer) && !holes.some((ring) => insideRing(p, ring)),
  );
}
function distance(p: Point, shape: Shape) {
  let squared = Infinity,
    closest: Point | undefined;
  for (const part of shape.parts) {
    for (let i = 0; i < part.length; i++) {
      const a = part[i],
        b = part[Math.min(i + 1, part.length - 1)],
        dx = b.x - a.x,
        dy = b.y - a.y,
        denominator = dx * dx + dy * dy,
        t = denominator
          ? Math.max(
              0,
              Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / denominator),
            )
          : 0,
        q = { x: a.x + dx * t, y: a.y + dy * t },
        d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      if (d < squared) {
        squared = d;
        closest = q;
      }
    }
  }
  return closest ? meters(p, closest) : Infinity;
}
function tilePosition(lon: number, lat: number) {
  return {
    x: ((lon + 180) / 360) * COUNT,
    y:
      ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * COUNT,
  };
}

/** Read-only spatial evidence from the same OSM map build as the road index.
 * Locations remain road access points, not invented building entrances or boat routes. */
export class GermanyIncidentGeography {
  private db: DatabaseSync;
  private cache = new Map<string, Tile>();
  private bytes = 0;
  private reads = 0;
  constructor(path: string, dataset: string) {
    this.db = new DatabaseSync(path, { readOnly: true });
    try {
      if (
        this.db
          .prepare("SELECT value FROM metadata WHERE name='source_sha256'")
          .get()?.value !== dataset
      )
        throw Error(
          "Standortgeometrien und Straßenindex stammen aus unterschiedlichen OSM-Datenständen.",
        );
      if (
        Number(
          this.db
            .prepare("SELECT value FROM metadata WHERE name='maxzoom'")
            .get()?.value,
        ) !== ZOOM
      )
        throw Error(
          "Standortgeometrien benötigen die lokalen Detailkacheln auf Zoomstufe 14.",
        );
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  private tile(x: number, y: number): Shape[] {
    const key = `${x}/${y}`,
      cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.shapes;
    }
    this.reads++;
    const row = this.db
      .prepare(
        "SELECT length(tile_data) AS bytes, CASE WHEN length(tile_data)<=? THEN tile_data ELSE NULL END AS tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?",
      )
      .get(MAX_COMPRESSED, ZOOM, x, COUNT - 1 - y);
    if (row && (!row.tile_data || Number(row.bytes) > MAX_COMPRESSED))
      throw Error("OSM-Standortkachel überschreitet die sichere Lesegröße.");
    const shapes: Shape[] = [];
    let estimated = 64;
    if (row) {
      const compressed = row.tile_data as Uint8Array;
      const raw =
        compressed[0] === 31 && compressed[1] === 139
          ? gunzipSync(compressed, { maxOutputLength: MAX_DECODED })
          : compressed;
      checkGeometryBudget(raw);
      const tile = new VectorTile(new PbfReader(raw));
      for (const name of [
        "water",
        "waterway",
        "landcover",
        "landuse",
        "transportation",
        "poi",
      ]) {
        const layer = tile.layers[name];
        if (!layer) continue;
        for (let i = 0; i < layer.length; i++) {
          const feature = layer.feature(i),
            kinds = kindsFor(name, feature.properties);
          if (!kinds.length || feature.type === 0) continue;
          const geometry = feature.loadGeometry();
          const convert = (p: Point): Point =>
            project({
              lon: ((x + p.x / feature.extent) / COUNT) * 360 - 180,
              lat:
                (Math.atan(
                  Math.sinh(
                    Math.PI * (1 - (2 * (y + p.y / feature.extent)) / COUNT),
                  ),
                ) *
                  180) /
                Math.PI,
            });
          const parts = geometry.map((part) => part.map(convert));
          const converted = new Map(
            geometry.map((ring, index) => [ring, parts[index]]),
          );
          const polygons =
            feature.type === 3
              ? classifyRings(geometry).map((polygon) =>
                  polygon.map((ring) => converted.get(ring)!),
                )
              : [];
          const bounds: Shape["bounds"] = [
            Infinity,
            Infinity,
            -Infinity,
            -Infinity,
          ];
          for (const part of parts)
            for (const p of part) {
              bounds[0] = Math.min(bounds[0], p.x);
              bounds[1] = Math.min(bounds[1], p.y);
              bounds[2] = Math.max(bounds[2], p.x);
              bounds[3] = Math.max(bounds[3], p.y);
            }
          estimated +=
            256 + parts.reduce((n, part) => n + part.length * 160, 0);
          if (estimated > MAX_CACHE)
            throw Error(
              "OSM-Standortkachel enthält zu viele Detailgeometrien.",
            );
          shapes.push({
            reference: `tile:${ZOOM}/${x}/${y}:${name}:${i}`,
            kinds,
            layer: name,
            featureClass: String(feature.properties.class || ""),
            ...(feature.properties.subclass
              ? { featureSubclass: String(feature.properties.subclass) }
              : {}),
            type: feature.type,
            parts,
            polygons,
            bounds,
          });
        }
      }
    }
    this.cache.set(key, { shapes, bytes: estimated });
    this.bytes += estimated;
    while (this.cache.size > 96 || this.bytes > MAX_CACHE) {
      const oldest = this.cache.keys().next().value!;
      this.bytes -= this.cache.get(oldest)!.bytes;
      this.cache.delete(oldest);
    }
    return shapes;
  }
  evidence(point: Point, kind: IncidentSiteKind): SiteEvidence | undefined {
    if (!inBounds(point) || kind === "street") return undefined;
    const range = RANGE[kind];
    if (!range) return undefined;
    const { lon, lat } = unproject(point),
      latRadius = (range + 5) / 110000,
      lonRadius = latRadius / Math.cos((lat * Math.PI) / 180),
      low = tilePosition(lon - lonRadius, lat + latRadius),
      high = tilePosition(lon + lonRadius, lat - latRadius);
    const candidates: Shape[] = [];
    for (let x = Math.floor(low.x); x <= Math.floor(high.x); x++)
      for (let y = Math.floor(low.y); y <= Math.floor(high.y); y++)
        for (const shape of this.tile(x, y)) {
          const [minX, minY, maxX, maxY] = shape.bounds;
          // Bounds use world coordinates; 10 m/unit is conservative throughout Germany.
          if (
            shape.kinds.includes(kind) &&
            point.x >= minX - range / 10 &&
            point.x <= maxX + range / 10 &&
            point.y >= minY - range / 10 &&
            point.y <= maxY + range / 10
          )
            candidates.push(shape);
        }
    // Check every intersecting tile before testing shore distance: clipped tile edges
    // are never mistaken for a shore inside a lake. Polygon holes remain land.
    if (
      kind === "water" &&
      candidates.some((shape) => shape.type === 3 && inside(point, shape))
    )
      return undefined;
    let result: SiteEvidence | undefined;
    for (const shape of candidates) {
      const d =
        shape.type === 3 && inside(point, shape) ? 0 : distance(point, shape);
      if (
        d > range ||
        (kind === "water" && d < 2) ||
        (result && d >= result.distanceMeters)
      )
        continue;
      result = {
        reference: shape.reference,
        layer: shape.layer,
        featureClass: shape.featureClass,
        ...(shape.featureSubclass
          ? { featureSubclass: shape.featureSubclass }
          : {}),
        distanceMeters: d,
      };
    }
    return result;
  }
  diagnostics() {
    return {
      tiles: this.cache.size,
      estimatedBytes: this.bytes,
      reads: this.reads,
    };
  }
  close() {
    this.cache.clear();
    this.bytes = 0;
    this.db.close();
  }
}
