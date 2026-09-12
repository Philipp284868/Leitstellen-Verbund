import type { Map as GLMap } from "maplibre-gl";
import { buildingIconDefinition, iconPaths } from "../../shared/map-icons";
import type {
  FacilityCluster,
  FacilityKind,
} from "../../shared/facilities/types";
type Options = {
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
    request: AbortController | undefined,
    frame = 0,
    disposed = false;
  const cache = new Map<string, FacilityCluster[]>();
  const paths = new Map<string, Path2D[]>();
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
    if (!options().enabled) return;
    for (const point of points) {
      if (point.id && options().owned.has(point.id)) continue;
      const { x, y } = map.project([point.lon, point.lat]);
      if (x < 0 || y < 0 || x > box.width || y > box.height) continue;
      hits.push({ ...point, x, y });
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "#122c3af0";
      ctx.strokeStyle =
        point.count > 1 ? "#80bacb" : point.usable ? "#82d3aa" : "#a4a7ac";
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
        ctx.fillText(point.usable ? "+" : "×", 8, 17);
      }
      ctx.restore();
    }
    canvas.dataset.visibleCount = String(hits.length);
  };
  const repaint = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };
  const refresh = () => {
    request?.abort();
    if (!options().enabled) {
      points = [];
      repaint();
      return;
    }
    const b = map.getBounds(),
      bbox = [
        Math.max(-180, b.getWest()),
        Math.max(-85, b.getSouth()),
        Math.min(180, b.getEast()),
        Math.min(85, b.getNorth()),
      ]
        .map((v) => v.toFixed(5))
        .join(",");
    const query = new URLSearchParams({
      clusters: "1",
      bbox,
      zoom: String(map.getZoom()),
      kind: options().kind,
    }).toString();
    const prior = cache.get(query);
    if (prior) {
      points = prior;
      repaint();
      return;
    }
    const controller = new AbortController();
    request = controller;
    void fetch(`/api/facilities?${query}`, {
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw Error(data.error || "Standortkarte nicht verfügbar.");
        if (!Array.isArray(data.clusters) || data.clusters.length > 2000)
          throw Error("Ungültiger Standortkatalog-Ausschnitt.");
        if (!controller.signal.aborted) {
          points = data.clusters;
          cache.set(query, points);
          if (cache.size > 24) cache.delete(cache.keys().next().value!);
          error("");
          repaint();
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) error(String(e.message));
      });
  };
  map.on("move", repaint);
  map.on("resize", repaint);
  map.on("moveend", refresh);
  refresh();
  return {
    refresh,
    repaint,
    hitTest: (x: number, y: number) =>
      hits.filter((h) => Math.abs(h.x - x) <= 18 && Math.abs(h.y - y) <= 18),
    destroy: () => {
      disposed = true;
      request?.abort();
      cancelAnimationFrame(frame);
      map.off("move", repaint);
      map.off("resize", repaint);
      map.off("moveend", refresh);
    },
  };
}
