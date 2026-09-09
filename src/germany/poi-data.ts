import type { MapGlyph } from "../map-icons";
import type { Point } from "./projection";
import { meters, project } from "./projection";

export const poiCategories = {
  fire: {
    label: "Feuerwachen",
    singular: "Feuerwache",
    glyph: "fireStation",
    minZoom: 9,
  },
  ems: {
    label: "Rettungswachen",
    singular: "Rettungswache",
    glyph: "emsStation",
    minZoom: 11,
  },
  police: {
    label: "Polizeiwachen",
    singular: "Polizeiwache",
    glyph: "policeStation",
    minZoom: 9,
  },
  thw: {
    label: "Katastrophenschutz",
    singular: "Katastrophenschutzstandort",
    glyph: "technicalStation",
    minZoom: 11,
  },
  hospital: {
    label: "Kliniken",
    singular: "Klinik",
    glyph: "hospital",
    minZoom: 7,
  },
  station: {
    label: "Bahnhöfe",
    singular: "Bahnhof",
    glyph: "station",
    minZoom: 12,
  },
  airport: {
    label: "Flughäfen",
    singular: "Flughafen",
    glyph: "airport",
    minZoom: 7,
  },
  harbor: { label: "Häfen", singular: "Hafen", glyph: "harbor", minZoom: 11 },
  education: {
    label: "Bildung",
    singular: "Bildungseinrichtung",
    glyph: "school",
    minZoom: 13,
  },
  care: {
    label: "Pflege & Soziales",
    singular: "Pflege-/Sozialeinrichtung",
    glyph: "care",
    minZoom: 13,
  },
  shopping: {
    label: "Einkaufsorte",
    singular: "Einkaufsort",
    glyph: "shopping",
    minZoom: 13,
  },
  venue: {
    label: "Veranstaltungen",
    singular: "Veranstaltungsort",
    glyph: "venue",
    minZoom: 12,
  },
  industry: {
    label: "Industrie",
    singular: "Industriefläche",
    glyph: "industry",
    minZoom: 13,
  },
} as const satisfies Record<
  string,
  { label: string; singular: string; glyph: MapGlyph; minZoom: number }
>;
export type PoiCategory = keyof typeof poiCategories;
export type MapPoi = {
  id: string;
  category: PoiCategory;
  name: string;
  lon: number;
  lat: number;
  count: number;
  source: "index" | "tiles";
  kind: string;
};
export type PoiTile = { dataset: string; snapshot: string; points: MapPoi[] };
export const poiSourceLayers = ["poi", "aerodrome_label", "landuse"] as const;
const explicitCategories: Record<string, PoiCategory> = {
  fire_station: "fire",
  ambulance_station: "ems",
  police: "police",
  disaster_response: "thw",
  civil_defense: "thw",
  hospital: "hospital",
  clinic: "hospital",
  aerodrome: "airport",
  airport: "airport",
  harbour: "harbor",
  harbor: "harbor",
  marina: "harbor",
  ferry_terminal: "harbor",
  school: "education",
  kindergarten: "education",
  college: "education",
  university: "education",
  nursing_home: "care",
  retirement_home: "care",
  assisted_living: "care",
  social_facility: "care",
  mall: "shopping",
  supermarket: "shopping",
  department_store: "shopping",
  marketplace: "shopping",
  stadium: "venue",
  theatre: "venue",
  cinema: "venue",
  conference_centre: "venue",
  events_venue: "venue",
  arts_centre: "venue",
  industrial: "industry",
  works: "industry",
  factory: "industry",
  power_plant: "industry",
};
export function poiCategory(
  layer: string,
  p: Record<string, unknown>,
): PoiCategory | undefined {
  if (layer === "aerodrome_label") return "airport";
  if (layer === "landuse" && p.class === "industrial") return "industry";
  if (layer !== "poi") return;
  const kind = String(p.class ?? ""),
    sub = String(p.subclass ?? "");
  if (
    (kind === "railway" || kind === "rail" || kind === "transit") &&
    ["station", "halt", "train_station"].includes(sub)
  )
    return "station";
  return Object.hasOwn(explicitCategories, sub)
    ? explicitCategories[sub]
    : Object.hasOwn(explicitCategories, kind)
      ? explicitCategories[kind]
      : undefined;
}
export function tilePoi(
  feature: {
    id?: string | number;
    properties?: Record<string, unknown> | null;
    geometry: { type: string; coordinates?: unknown };
  },
  layer: string,
): MapPoi | undefined {
  const p = feature.properties ?? {},
    category = poiCategory(layer, p),
    point =
      layer === "landuse"
        ? polygonLabelPoint(feature.geometry)
        : feature.geometry.coordinates;
  if (
    !category ||
    (feature.geometry.type !== "Point" && layer !== "landuse") ||
    !Array.isArray(point) ||
    point.length < 2 ||
    !point.slice(0, 2).every(Number.isFinite)
  )
    return;
  const [lon, lat] = point as number[];
  if (lon < 5.5 || lon > 15.6 || lat < 47.1 || lat > 55.2) return;
  const name = String(
    p["name:de"] || p.name || poiCategories[category].singular,
  ).slice(0, 2048);
  return {
    id: `tile:${layer}:${feature.id ?? `${category}:${lon.toFixed(5)}:${lat.toFixed(5)}:${name}`}`,
    category,
    name,
    lon,
    lat,
    count: 1,
    source: "tiles",
    kind:
      layer === "landuse"
        ? "industrial-area"
        : String(p.subclass || p.class || category),
  };
}
const fold = (value: string) =>
  value
    .toLocaleLowerCase("de-DE")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]/gu, "");
const gameCategory: Record<string, PoiCategory> = {
  fire: "fire",
  ems: "ems",
  police: "police",
  thw: "thw",
  hospital: "hospital",
  water: "harbor",
  heli: "airport",
  school: "education",
};
/** Display deduplication only. It never changes ownership or merges server records. */
export function deduplicatePois(
  points: readonly MapPoi[],
  buildings: readonly { type: string; name: string; pos: Point }[],
) {
  const result: MapPoi[] = [],
    ids = new Set<string>();
  type Located = { pos: Point; name: string };
  const cells = new Map<string, Located[]>(),
    gameCells = new Map<string, Located[]>();
  const cell = (p: Point) => [Math.floor(p.x / 20), Math.floor(p.y / 20)];
  for (const building of buildings) {
    const category = gameCategory[building.type];
    if (!category) continue;
    const [x, y] = cell(building.pos),
      key = `${x}:${y}:${category}`,
      entries = gameCells.get(key) ?? [];
    entries.push({ pos: building.pos, name: fold(building.name) });
    gameCells.set(key, entries);
  }
  for (const p of [...points].sort(
    (a, b) =>
      Number(a.source === "tiles") - Number(b.source === "tiles") ||
      a.id.localeCompare(b.id),
  )) {
    if (ids.has(p.id)) continue;
    ids.add(p.id);
    if (p.count > 1) {
      result.push(p);
      continue;
    }
    const pos = project(p),
      name = fold(p.name),
      [x, y] = cell(pos);
    let duplicate = false;
    for (let dx = -1; dx <= 1 && !duplicate; dx++)
      for (let dy = -1; dy <= 1 && !duplicate; dy++) {
        for (const building of gameCells.get(
          `${x + dx}:${y + dy}:${p.category}`,
        ) ?? [])
          if (meters(pos, building.pos) < (name === building.name ? 120 : 30)) {
            duplicate = true;
            break;
          }
        if (duplicate) break;
        // Different named institutions remain separate, even on a shared campus.
        for (const prior of cells.get(
          `${x + dx}:${y + dy}:${p.category}:${name}`,
        ) ?? [])
          if (meters(pos, prior.pos) < 70) {
            duplicate = true;
            break;
          }
      }
    if (duplicate) continue;
    const key = `${x}:${y}:${p.category}:${name}`,
      entries = cells.get(key) ?? [];
    entries.push({ pos, name });
    cells.set(key, entries);
    result.push(p);
  }
  return result;
}

/** Interior label anchor for a real industrial polygon, respecting its holes. */
export function polygonLabelPoint(geometry: {
  type: string;
  coordinates?: unknown;
}): number[] | undefined {
  if (
    !["Polygon", "MultiPolygon"].includes(geometry.type) ||
    !Array.isArray(geometry.coordinates)
  )
    return;
  const polygons = (
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
  ) as unknown[];
  let best: number[] | undefined,
    bestWidth = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !Array.isArray(polygon[0])) continue;
    const outer = polygon[0] as unknown[];
    let min = Infinity,
      max = -Infinity;
    for (const coordinate of outer) {
      if (
        !Array.isArray(coordinate) ||
        !coordinate.slice(0, 2).every(Number.isFinite)
      )
        continue;
      min = Math.min(min, coordinate[1]);
      max = Math.max(max, coordinate[1]);
    }
    const y = (min + max) / 2;
    if (!Number.isFinite(y)) continue;
    const crossings: number[] = [];
    for (const ring of polygon) {
      if (!Array.isArray(ring)) continue;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i],
          b = ring[j];
        if (
          !Array.isArray(a) ||
          !Array.isArray(b) ||
          ![a[0], a[1], b[0], b[1]].every(Number.isFinite)
        )
          continue;
        if (a[1] > y !== b[1] > y)
          crossings.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const width = crossings[i + 1] - crossings[i];
      if (width > bestWidth) {
        bestWidth = width;
        best = [(crossings[i] + crossings[i + 1]) / 2, y];
      }
    }
  }
  return best;
}
