import { memo, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./GermanyMap.css";
import type { Save } from "../model";
import { unproject, WORLD_CENTER } from "./projection";
import { germanyStyle, loadGeoManifest } from "./map-style";
import { attachTileLabels } from "./map-labels";

maplibregl.setWorkerUrl(workerUrl);
/** Menu and game use the same vector source and projection, with no backdrop image. */
export const GermanyScene = memo(function GermanyScene({
  save,
  miniature = false,
}: {
  save: Save;
  miniature?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null),
    labels = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const home = save.buildings[0]?.pos ?? WORLD_CENTER;
  useEffect(() => {
    const host = container.current,
      canvas = labels.current;
    if (!host || !canvas) return;
    const controller = new AbortController();
    let disposed = false,
      remove = () => {};
    const p = unproject(home);
    void loadGeoManifest(controller.signal)
      .then((manifest) => {
        if (disposed) return;
        const map = new maplibregl.Map({
          container: host,
          style: germanyStyle(manifest),
          center: [p.lon, p.lat],
          zoom: miniature ? 8 : 10,
          interactive: false,
          attributionControl: false,
          renderWorldCopies: false,
          maxTileCacheSize: 60,
          fadeDuration: 0,
        });
        // The menu's large map shows the shared source attribution. Repeating
        // the full notice inside its tiny thumbnail would cover the preview.
        if (!miniature)
          map.addControl(
            new maplibregl.AttributionControl({ compact: false }),
            "bottom-right",
          );
        const removeLabels = attachTileLabels(map, canvas, () => !miniature);
        const observer = new ResizeObserver(() => map.resize());
        observer.observe(host);
        map.on("error", () => {
          if (!disposed)
            setError("Deutschland-Kartendaten sind momentan nicht verfügbar.");
        });
        remove = () => {
          observer.disconnect();
          removeLabels();
          map.remove();
        };
      })
      .catch((reason) => {
        if (!disposed) setError(String(reason.message || reason));
      });
    return () => {
      disposed = true;
      controller.abort();
      remove();
    };
  }, [home.x, home.y, miniature]);
  return (
    <div
      className={`region-scene germany-scene ${miniature ? "miniature" : ""}`}
      data-testid="germany-menu-map"
    >
      <div ref={container} className="germany-scene-map">
        <canvas ref={labels} className="germany-labels" aria-hidden="true" />
      </div>
      {error && (
        <p className="germany-scene-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
});
export const RegionScene = GermanyScene;
