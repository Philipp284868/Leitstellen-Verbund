import type { Map as GLMap } from "maplibre-gl";
import type { WaterSource } from "../../shared/germany/water";
import {
  meters,
  project,
  unproject,
  type Point,
} from "../../shared/germany/projection";
import { FacilityReader } from "../facilities/reader";
import { mapMetricScale } from "./metric-scale";
/** Local immutable infrastructure: no network or routing work during a drag frame. */
export function attachWaterLayer(
  map: GLMap,
  canvas: HTMLCanvasElement,
  actor: string,
  error: (s: string) => void,
) {
  let points: WaterSource[] = [],
    hits: { x: number; y: number; source: WaterSource }[] = [],
    frame = 0,
    disposed = false;
  let covered: { center: Point; radius: number } | undefined;
  const cache = new Map<string, WaterSource[]>();
  const paint = () => {
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
    hits = [];
    canvas.dataset.visibleCount = "0";
    if (!mapMetricScale(map).markers) return;
    for (const source of points) {
      const p = unproject(source.pos),
        { x, y } = map.project([p.lon, p.lat]);
      if (x < 0 || y < 0 || x > box.width || y > box.height) continue;
      hits.push({ x, y, source });
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle =
        source.usable === false
          ? "#45505c"
          : source.origin === "openstreetmap"
            ? "#135372"
            : "#574c77";
      ctx.fill();
      ctx.strokeStyle = source.usable === false ? "#aaaeb4" : "#b9ddea";
      ctx.lineWidth = 1.3;
      ctx.setLineDash(source.origin === "simulation-v1" ? [2, 2] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#e3f3f7";
      ctx.textAlign = "center";
      ctx.font = "bold 9px system-ui";
      ctx.fillText(source.kind === "open-water" ? "W" : "H", x, y + 3);
    }
    canvas.dataset.visibleCount = String(hits.length);
  };
  const repaint = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(paint);
  };
  const reader = new FacilityReader<{ sources: WaterSource[] }>(
    (data, query) => {
      if (!Array.isArray(data.sources) || data.sources.length > 50000)
        throw Error("Ungültiger Wasserquellenausschnitt.");
      points = data.sources;
      cache.set(query, points);
      if (cache.size > 16) cache.delete(cache.keys().next().value!);
      repaint();
    },
    (state) => {
      error(state.error);
      if (state.error && !state.cooldownUntil) covered = undefined;
    },
    {},
    `${actor}:water`,
    "/api/water",
  );
  const refresh = () => {
    if (disposed) return;
    if (document.hidden || !mapMetricScale(map).markers) {
      reader.cancel();
      covered = undefined;
      repaint();
      return;
    }
    const center = map.getCenter(),
      p = project({ lon: center.lng, lat: center.lat }),
      b = map.getBounds();
    const radius = Math.max(
      ...b.toArray().map(([lon, lat]) => meters(p, project({ lon, lat }))),
    );
    if (covered && meters(p, covered.center) + radius <= covered.radius) return;
    // Stable geographic buckets include a small panning margin and keep detail requests bounded.
    const rounded = {
        x: Math.round(p.x / 20) * 20,
        y: Math.round(p.y / 20) * 20,
      },
      r = Math.min(
        10000,
        Math.ceil((radius + meters(p, rounded) + 180) / 250) * 250,
      );
    covered = { center: rounded, radius: r };
    const query = new URLSearchParams({
        x: String(rounded.x),
        y: String(rounded.y),
        radius: String(r),
      }).toString(),
      prior = cache.get(query);
    if (prior) {
      reader.supersede();
      points = prior;
      repaint();
    } else reader.request(query);
  };
  const resize = () => {
    repaint();
    refresh();
  };
  map.on("move", repaint);
  map.on("moveend", refresh);
  map.on("resize", resize);
  map.on("load", refresh);
  document.addEventListener("visibilitychange", refresh);
  refresh();
  return {
    hitTest: (x: number, y: number) =>
      mapMetricScale(map).markers
        ? hits.find((h) => Math.hypot(h.x - x, h.y - y) <= 10)?.source
        : undefined,
    destroy: () => {
      disposed = true;
      reader.destroy();
      cancelAnimationFrame(frame);
      map.off("move", repaint);
      map.off("moveend", refresh);
      map.off("resize", resize);
      map.off("load", refresh);
      document.removeEventListener("visibilitychange", refresh);
    },
  };
}
