import { createId } from "../ids";
import { FacilityReader } from "./reader";
import { mapMetricScale } from "../germany/metric-scale";
import {
  infrastructureState,
  subscribeInfrastructure,
  watchInfrastructure,
} from "../infrastructure";
import type { Map as GLMap } from "maplibre-gl";
import { buildingIconDefinition, iconPaths } from "../../shared/map-icons";
import type {
  FacilityCluster,
  FacilityKind,
} from "../../shared/facilities/types";
type Options = {
  actor: string;
  enabled: boolean;
  kind: FacilityKind | "";
  owned: ReadonlySet<string>;
};
/** One canvas and bounded viewport queries, independent from the dynamic vehicle stream. */
export function attachFacilityLayer(
  map: GLMap,
  canvas: HTMLCanvasElement,
  options: () => Options,
  error: (message: string) => void,
) {
  let points: FacilityCluster[] = [],
    hits: (FacilityCluster & { x: number; y: number })[] = [],
    frame = 0,
    disposed = false;
  const cache = new Map<string, FacilityCluster[]>();
  const paths = new Map<string, Path2D[]>();
  let unwatch = () => {};
  const watchKey = createId();
  const watch = () => {
    unwatch();
    unwatch = watchInfrastructure(
      watchKey,
      points.flatMap((p) => (p.id ? [p.id] : [])),
    );
  };
  const paint = () => {
    frame = 0;
    if (disposed) return;
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
    hits = [];
    canvas.dataset.visibleCount = "0";
    if (!options().enabled || !mapMetricScale(map).markers) return;
    const ownership = new Map(
      infrastructureState().ownership.map((o) => [o.facility, o]),
    );
    for (const point of points) {
      if (point.id && options().owned.has(point.id)) continue;
      const { x, y } = map.project([point.lon, point.lat]);
      if (x < 0 || y < 0 || x > box.width || y > box.height) continue;
      hits.push({ ...point, x, y });
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "#122c3af0";
      ctx.strokeStyle =
        point.count > 1
          ? "#80bacb"
          : point.kind === "hospital"
            ? "#9dbcf0"
            : ownership.has(point.id ?? "")
              ? "#d3ac77"
              : point.usable
                ? "#82d3aa"
                : "#a4a7ac";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-15, -15, 30, 30, 6);
      ctx.fill();
      ctx.stroke();
      if (point.count > 1) {
        ctx.fillStyle = "#eef7fa";
        ctx.textAlign = "center";
        ctx.font = "bold 12px system-ui";
        ctx.fillText(
          point.count > 999
            ? `${(point.count / 1000).toFixed(1)}k`
            : String(point.count),
          0,
          4,
        );
      } else {
        const glyph = buildingIconDefinition(point.kind || "fire");
        if (!paths.has(glyph))
          paths.set(
            glyph,
            iconPaths[glyph].map((p) => new Path2D(p)),
          );
        ctx.save();
        ctx.translate(-10, -10);
        ctx.scale(20 / 32, 20 / 32);
        ctx.strokeStyle = "#e0edf4";
        ctx.lineWidth = 2;
        for (const path of paths.get(glyph)!) ctx.stroke(path);
        ctx.restore();
        ctx.fillStyle = "#0c2029";
        ctx.fillRect(6, 5, 14, 14);
        ctx.fillStyle = point.usable ? "#96e5b6" : "#e5be8c";
        ctx.font = "bold 13px system-ui";
        ctx.fillText(
          point.kind === "hospital"
            ? "H"
            : ownership.has(point.id ?? "")
              ? "●"
              : point.usable
                ? "+"
                : "×",
          8,
          17,
        );
      }
      ctx.restore();
    }
    canvas.dataset.visibleCount = String(hits.length);
  };
  const repaint = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };
  type Bounds = [number, number, number, number];
  let covered:
    | { bbox: Bounds; zoom: number; kind: string; query: string }
    | undefined;
  let snapshot = "";
  const reader = new FacilityReader<{
    snapshot: string;
    clusters: FacilityCluster[];
  }>(
    (data, query) => {
      if (!Array.isArray(data.clusters) || data.clusters.length > 2000)
        throw Error("Ungültiger Standortkatalog-Ausschnitt.");
      if (snapshot !== data.snapshot) {
        cache.clear();
        snapshot = data.snapshot;
      }
      cache.set(query, data.clusters);
      if (cache.size > 24) cache.delete(cache.keys().next().value!);
      canvas.dataset.loadedBounds = new URLSearchParams(query).get("bbox")!;
      points = data.clusters;
      watch();
      repaint();
    },
    (state) => {
      canvas.dataset.loading = String(state.loading);
      canvas.dataset.cooldownUntil = String(state.cooldownUntil);
      error(state.error);
    },
    {},
    options().actor,
  );
  const refresh = () => {
    if (disposed) return;
    if (!options().enabled || document.hidden || !mapMetricScale(map).markers) {
      reader.cancel();
      unwatch();
      covered = undefined;
      canvas.dataset.loading = "false";
      repaint();
      return;
    }
    const b = map.getBounds(),
      zoom = Math.max(4, Math.min(20, Math.floor(map.getZoom()))),
      kind = options().kind;
    const visible: Bounds = [
      Math.max(-180, b.getWest()),
      Math.max(-85, b.getSouth()),
      Math.min(180, b.getEast()),
      Math.min(85, b.getNorth()),
    ];
    if (
      covered &&
      covered.zoom === zoom &&
      covered.kind === kind &&
      visible[0] >= covered.bbox[0] &&
      visible[1] >= covered.bbox[1] &&
      visible[2] <= covered.bbox[2] &&
      visible[3] <= covered.bbox[3]
    ) {
      if (
        cache.has(covered.query) &&
        reader.cooldown(covered.query) <= Date.now()
      )
        error("");
      return;
    }
    const cell = 360 / 2 ** zoom / 2;
    const bbox: Bounds = [
      Math.max(-180, (Math.floor(visible[0] / cell) - 1) * cell),
      Math.max(-85, (Math.floor(visible[1] / cell) - 1) * cell),
      Math.min(180, (Math.ceil(visible[2] / cell) + 1) * cell),
      Math.min(85, (Math.ceil(visible[3] / cell) + 1) * cell),
    ];
    const query = new URLSearchParams({
      clusters: "1",
      bbox: bbox.join(","),
      zoom: String(zoom),
      kind,
    }).toString();
    covered = { bbox, zoom, kind, query };
    const prior = cache.get(query);
    if (prior) {
      reader.supersede();
      canvas.dataset.loadedBounds = bbox.join(",");
      points = prior;
      watch();
      canvas.dataset.loading = "false";
      if (reader.cooldown(query) <= Date.now()) {
        error("");
        canvas.dataset.cooldownUntil = "0";
      }
      repaint();
    } else reader.request(query);
  };
  const resize = () => {
    repaint();
    refresh();
  };
  document.addEventListener("visibilitychange", refresh);
  map.on("move", repaint);
  map.on("resize", resize);
  map.on("moveend", refresh);
  const unsubscribe = subscribeInfrastructure(repaint);
  refresh();
  return {
    refresh,
    repaint,
    hitTest: (x: number, y: number) =>
      mapMetricScale(map).markers
        ? hits.filter((h) => Math.abs(h.x - x) <= 18 && Math.abs(h.y - y) <= 18)
        : [],
    destroy: () => {
      disposed = true;
      reader.destroy();
      unsubscribe();
      unwatch();
      document.removeEventListener("visibilitychange", refresh);
      cancelAnimationFrame(frame);
      map.off("move", repaint);
      map.off("resize", resize);
      map.off("moveend", refresh);
    },
  };
}
