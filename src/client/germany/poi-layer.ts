import type { Map as GLMap } from "maplibre-gl";
import { iconPaths } from "../../shared/map-icons";
import {
  deduplicatePois,
  poiCategories,
  poiSourceLayers,
  tilePoi,
  type MapPoi,
  type PoiCategory,
  type PoiTile,
} from "../../shared/germany/poi-data";
import type { Point } from "../../shared/germany/projection";

type Options = {
  enabled: boolean;
  categories: ReadonlySet<PoiCategory>;
  buildings: readonly { name: string; type: string; pos: Point }[];
  selected?: string;
};
type Cluster = {
  point: MapPoi;
  x: number;
  y: number;
  count: number;
  members: MapPoi[];
};
/** A selected marker may overlap its former cluster. Keep every hit reachable. */
export function hitPoiClusters(hits: readonly Cluster[], x: number, y: number) {
  const overlapping = hits.filter(
    (h) => Math.abs(h.x - x) <= 18 && Math.abs(h.y - y) <= 18,
  );
  const top = overlapping.at(-1);
  if (!top) return;
  const members = [
    ...new Map(
      overlapping.flatMap((h) => h.members).map((point) => [point.id, point]),
    ).values(),
  ];
  return {
    ...top,
    members,
    count: members.reduce((total, point) => total + point.count, 0),
  };
}
export function clusterPoiPixels(
  points: readonly MapPoi[],
  project: (p: MapPoi) => { x: number; y: number },
  width: number,
  height: number,
  zoom: number,
  selected?: string,
): Cluster[] {
  const result = new Map<string, Cluster>(),
    cell = zoom < 11 ? 64 : zoom < 14 ? 44 : 30;
  for (const point of [...points].sort(
    (a, b) =>
      Number(b.id === selected) - Number(a.id === selected) ||
      a.id.localeCompare(b.id),
  )) {
    const { x, y } = project(point);
    if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue;
    const key =
      point.id === selected
        ? point.id
        : `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
    const prior = result.get(key);
    if (prior) {
      prior.count += point.count;
      prior.members.push(point);
    } else
      result.set(key, { point, x, y, count: point.count, members: [point] });
  }
  return [...result.values()];
}
function visibleTiles(map: GLMap) {
  const b = map.getBounds(),
    z = Math.max(4, Math.min(14, Math.floor(map.getZoom()))),
    count = 2 ** z;
  const x = (lon: number) => Math.floor(((lon + 180) / 360) * count),
    y = (lat: number) =>
      Math.floor(
        ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) *
          count,
      );
  const west = Math.max(5.5, b.getWest()),
    east = Math.min(15.6, b.getEast()),
    south = Math.max(47.1, b.getSouth()),
    north = Math.min(55.2, b.getNorth());
  const result: string[] = [];
  if (west > east || south > north) return result;
  for (let tx = x(west); tx <= x(east); tx++)
    for (let ty = y(north); ty <= y(south); ty++)
      result.push(`${z}/${tx}/${ty}`);
  return result;
}
/** Canvas markers for only the loaded viewport, backed by local OSM tiles/index.
 * No nationwide object array or per-POI DOM is created. */
export function attachPoiLayer(
  map: GLMap,
  canvas: HTMLCanvasElement,
  dataset: string,
  getOptions: () => Options,
  onError: (message: string) => void,
) {
  let points: MapPoi[] = [],
    hits: Cluster[] = [],
    frame = 0,
    collectTimer: ReturnType<typeof setTimeout> | undefined,
    disposed = false;
  let request: AbortController | undefined;
  const cache = new Map<string, MapPoi[]>(),
    paths = new Map<string, Path2D[]>();
  const draw = () => {
    frame = 0;
    const box = map.getContainer().getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 2),
      ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (
      canvas.width !== Math.round(box.width * dpr) ||
      canvas.height !== Math.round(box.height * dpr)
    ) {
      canvas.width = Math.round(box.width * dpr);
      canvas.height = Math.round(box.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);
    const options = getOptions(),
      zoom = map.getZoom();
    if (!options.enabled) {
      hits = [];
      return;
    }
    const visible = points.filter(
      (p) =>
        options.categories.has(p.category) &&
        (p.id === options.selected ||
          zoom >= poiCategories[p.category].minZoom ||
          (p.source === "index" && p.count > 1)),
    );
    hits = clusterPoiPixels(
      visible,
      (p) => map.project([p.lon, p.lat]),
      box.width,
      box.height,
      zoom,
      options.selected,
    );
    for (const h of hits) {
      const selected = h.point.id === options.selected,
        size = selected ? 31 : 27;
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.fillStyle = "#10242deb";
      ctx.strokeStyle = selected ? "#d7f7ff" : "#78949b";
      ctx.lineWidth = selected ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(-size / 2, -size / 2, size, size, 6);
      ctx.fill();
      ctx.stroke();
      const glyph = poiCategories[h.point.category].glyph;
      if (!paths.has(glyph))
        paths.set(
          glyph,
          iconPaths[glyph].map((p) => new Path2D(p)),
        );
      ctx.save();
      ctx.translate(-10, -10);
      ctx.scale(20 / 32, 20 / 32);
      ctx.strokeStyle = "#cce0e1";
      ctx.lineWidth = 1.8;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const path of paths.get(glyph)!) ctx.stroke(path);
      ctx.restore();
      if (h.count > 1) {
        const text =
          h.count > 999 ? `${(h.count / 1000).toFixed(1)}k` : String(h.count);
        ctx.font = "600 10px system-ui";
        const width = Math.max(16, ctx.measureText(text).width + 7);
        ctx.fillStyle = "#304d5c";
        ctx.beginPath();
        ctx.roundRect(8, -19, width, 15, 5);
        ctx.fill();
        ctx.fillStyle = "#eef7fa";
        ctx.textAlign = "center";
        ctx.fillText(text, 8 + width / 2, -8);
      }
      if (selected) {
        ctx.font = "600 12px system-ui";
        ctx.textAlign = "left";
        const label = h.point.name;
        ctx.strokeStyle = "#0a1d26";
        ctx.lineWidth = 5;
        ctx.strokeText(label, 20, 4);
        ctx.fillStyle = "#edf7f8";
        ctx.fillText(label, 20, 4);
      }
      ctx.restore();
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const collect = async () => {
    if (disposed || !map.isStyleLoaded() || !map.getSource("germany")) return;
    const options = getOptions();
    if (!options.enabled) {
      request?.abort();
      points = [];
      schedule();
      return;
    }
    request?.abort();
    const controller = new AbortController();
    request = controller;
    const keys = visibleTiles(map),
      tilePoints: MapPoi[] = [];
    for (const layer of poiSourceLayers)
      for (const feature of map.querySourceFeatures("germany", {
        sourceLayer: layer,
      })) {
        const p = tilePoi(feature, layer);
        if (p) tilePoints.push(p);
      }
    const combined = () => {
      points = deduplicatePois(
        [...tilePoints, ...keys.flatMap((key) => cache.get(key) ?? [])],
        getOptions().buildings,
      );
      schedule();
    };
    combined();
    const missing = keys.filter((key) => !cache.has(key));
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, missing.length) }, async () => {
        while (cursor < missing.length && !controller.signal.aborted) {
          const key = missing[cursor++];
          try {
            const response = await fetch(
              `/geo/pois/${key}.json?dataset=${encodeURIComponent(dataset)}`,
              { signal: controller.signal },
            );
            if (!response.ok)
              throw Error(
                "Geografische Einrichtungen konnten nicht vollständig geladen werden.",
              );
            const data = (await response.json()) as PoiTile;
            if (
              data.dataset !== dataset ||
              !Array.isArray(data.points) ||
              data.points.length > 1000 ||
              data.points.some(
                (p) =>
                  !Object.hasOwn(poiCategories, p.category) ||
                  ![p.lon, p.lat, p.count].every(Number.isFinite) ||
                  p.count < 1 ||
                  !Number.isInteger(p.count) ||
                  p.lon < 5.5 ||
                  p.lon > 15.6 ||
                  p.lat < 47.1 ||
                  p.lat > 55.2 ||
                  typeof p.id !== "string" ||
                  p.id.length > 300 ||
                  typeof p.name !== "string" ||
                  p.name.length > 2048,
              )
            )
              throw Error("Ungültige Einrichtungsdaten.");
            if (controller.signal.aborted) return;
            cache.set(key, data.points);
            while (cache.size > 96) cache.delete(cache.keys().next().value!);
          } catch (error) {
            if (!controller.signal.aborted)
              onError(error instanceof Error ? error.message : String(error));
          }
        }
      }),
    );
    if (!controller.signal.aborted && !disposed) {
      if (missing.length && missing.every((key) => cache.has(key))) onError("");
      combined();
    }
  };
  const changed = () => {
    if (collectTimer) clearTimeout(collectTimer);
    collectTimer = setTimeout(() => void collect(), 120);
  };
  map.on("render", schedule);
  map.on("idle", changed);
  map.on("moveend", changed);
  map.on("load", changed);
  changed();
  return {
    refresh: changed,
    repaint: schedule,
    hitTest: (x: number, y: number) => hitPoiClusters(hits, x, y),
    diagnostics: () => ({
      loaded: points.length,
      rendered: hits.length,
      cachedTiles: cache.size,
    }),
    destroy() {
      disposed = true;
      request?.abort();
      if (collectTimer) clearTimeout(collectTimer);
      cancelAnimationFrame(frame);
      map.off("render", schedule);
      map.off("idle", changed);
      map.off("moveend", changed);
      map.off("load", changed);
      cache.clear();
      paths.clear();
    },
  };
}
