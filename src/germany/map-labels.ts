import type { Map as GLMap } from "maplibre-gl";

/** Labels come only from the currently loaded source tiles; no example gazetteer. */
export function attachTileLabels(
  map: GLMap,
  canvas: HTMLCanvasElement,
  enabled: () => boolean,
) {
  let labels: {
    text: string;
    lon: number;
    lat: number;
    priority: number;
    kind: string;
  }[] = [];
  let frame = 0;
  const draw = () => {
    frame = 0;
    const rect = map.getContainer().getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 2);
    if (
      canvas.width !== Math.round(rect.width * dpr) ||
      canvas.height !== Math.round(rect.height * dpr)
    ) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!enabled()) return;
    const occupied: { x: number; y: number; w: number }[] = [];
    for (const label of labels) {
      const p = map.project([label.lon, label.lat]);
      if (
        p.x < 20 ||
        p.x > rect.width - 20 ||
        p.y < 15 ||
        p.y > rect.height - 15
      )
        continue;
      const size = label.kind === "place" ? (label.priority < 4 ? 14 : 12) : 11;
      ctx.font = `${label.priority < 4 ? 600 : 400} ${size}px system-ui, sans-serif`;
      const w = ctx.measureText(label.text).width;
      if (
        occupied.some(
          (o) =>
            Math.abs(o.y - p.y) < 21 &&
            Math.abs(o.x - p.x) < (o.w + w) / 2 + 15,
        )
      )
        continue;
      occupied.push({ x: p.x, y: p.y, w });
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#15252be8";
      ctx.strokeText(label.text, p.x, p.y);
      ctx.fillStyle = label.kind === "water_name" ? "#aac7d4" : "#e2e7df";
      ctx.fillText(label.text, p.x, p.y);
      if (occupied.length >= 110) break;
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const collect = () => {
    if (!map.isStyleLoaded() || !map.getSource("germany")) return;
    const zoom = map.getZoom(),
      seen = new Set<string>();
    labels = [];
    for (const kind of [
      "place",
      "water_name",
      "mountain_peak",
      ...(zoom >= 13 ? ["transportation_name"] : []),
    ]) {
      for (const feature of map.querySourceFeatures("germany", {
        sourceLayer: kind,
      })) {
        const properties = feature.properties || {},
          text = String(
            properties["name:de"] || properties.name || properties.ref || "",
          );
        if (!text || text.length > 80) continue;
        const rank = Number(properties.rank || 9),
          settlement = String(properties.class || "");
        if (
          kind === "place" &&
          zoom < 7 &&
          (!["city", "state", "country"].includes(settlement) || rank > 5)
        )
          continue;
        if (
          kind === "place" &&
          zoom < 10 &&
          [
            "village",
            "hamlet",
            "suburb",
            "neighbourhood",
            "isolated_dwelling",
          ].includes(settlement)
        )
          continue;
        if (kind === "mountain_peak" && zoom < 8) continue;
        const geometry = feature.geometry;
        const point =
          geometry.type === "Point"
            ? geometry.coordinates
            : geometry.type === "LineString"
              ? geometry.coordinates[
                  Math.floor(geometry.coordinates.length / 2)
                ]
              : null;
        if (!point || !point.every(Number.isFinite)) continue;
        const key = `${text}:${point[0].toFixed(3)}:${point[1].toFixed(3)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        labels.push({
          text,
          lon: point[0],
          lat: point[1],
          kind,
          priority: kind === "place" ? rank : 30,
        });
      }
    }
    labels.sort(
      (a, b) => a.priority - b.priority || a.text.localeCompare(b.text),
    );
    schedule();
  };
  map.on("render", schedule);
  map.on("idle", collect);
  map.on("moveend", collect);
  collect();
  return () => {
    cancelAnimationFrame(frame);
    map.off("render", schedule);
    map.off("idle", collect);
    map.off("moveend", collect);
  };
}
