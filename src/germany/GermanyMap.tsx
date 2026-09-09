import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as GLMap, GeoJSONSource } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "../MapTools.css";
import "./GermanyMap.css";
import { Crosshair, LocateFixed, Navigation, Search, X } from "lucide-react";
import { IncidentIcon } from "../HudIcons";
import { bt, mt, vt } from "../catalog";
import { vehiclePosition } from "../vehicle-position";
import { volunteerMarkers } from "../simulation/volunteers";
import { tripLabel } from "../travel";
import { Operations } from "../Operations";
import { useGame } from "../store";
import { DRAG_THRESHOLD, wheelPixels } from "../map-camera";
import type { Save } from "../model";
import type { Friend } from "../network";
import type { Point } from "../world";
import { project, unproject, WORLD_CENTER } from "./projection";
import {
  germanyStyle,
  loadGeoManifest,
  readGermanyCamera,
  GERMANY_BOUNDS,
} from "./map-style";
import { attachTileLabels } from "./map-labels";
import { mapInitializationMessage } from "./map-errors";

maplibregl.setWorkerUrl(workerUrl);
type SearchResult = {
  id: string;
  name: string;
  kind: string;
  lon: number;
  lat: number;
};
type Site = { point: Point; reason: string | null };
type MarkerData = {
  id: string;
  name: string;
  pos: Point;
  kind: "station" | "mission" | "vehicle" | "volunteer";
  target?: string;
  org: string;
  friend?: boolean;
  count?: number;
};
export type GermanyMapProps = {
  s: Save;
  selected: string;
  onSelect: (id: string) => void;
  placing: string;
  onPlace: (point: Point) => void;
  friends: Friend[];
  readonly?: boolean;
  onCancelPlace?: () => void;
};

export const GermanyMap = memo(function GermanyMap(props: GermanyMapProps) {
  const {
    s,
    selected,
    onSelect,
    placing,
    onPlace,
    friends,
    readonly = false,
    onCancelPlace,
  } = props;
  const { mode } = useGame(),
    modeRef = useRef(mode);
  modeRef.current = mode;
  const viewport = useRef<HTMLDivElement>(null),
    labelCanvas = useRef<HTMLCanvasElement>(null),
    mapRef = useRef<GLMap | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [cameraTick, setCameraTick] = useState(0),
    [motionTick, setMotionTick] = useState(0),
    [search, setSearch] = useState("");
  const [found, setFound] = useState<SearchResult[]>([]),
    [searchError, setSearchError] = useState(""),
    [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState("Alle"),
    [org, setOrg] = useState("Alle"),
    [status, setStatus] = useState("Alle");
  const [labels, setLabels] = useState(true),
    [routes, setRoutes] = useState(true),
    [showFriends, setShowFriends] = useState(true),
    [following, setFollowing] = useState(false);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const [candidate, setCandidate] = useState<Site | null>(null),
    [checking, setChecking] = useState(false),
    [siteError, setSiteError] = useState("");
  const siteRequest = useRef<AbortController | null>(null),
    clock = useRef({ time: s.time, at: performance.now() });
  if (clock.current.time !== s.time)
    clock.current = { time: s.time, at: performance.now() };
  const cameraKey = `lv-germany-camera-v1:${s.world}:${s.player.id}`;
  const selectedVehicle = s.vehicles.find((v) => v.id === selected);
  const now =
    s.time +
    (readonly || document.hidden
      ? 0
      : Math.min(2, (performance.now() - clock.current.at) / 1000));
  const selectionPosition = selectedVehicle
    ? vehiclePosition(selectedVehicle, now)
    : (s.buildings.find((b) => b.id === selected)?.pos ??
      s.missions.find(
        (m) => m.id === selected && (!m.control || m.control.locationKnown),
      )?.pos);
  const center = useCallback((point: Point, zoom = 13) => {
    const p = unproject(point);
    mapRef.current?.easeTo({ center: [p.lon, p.lat], zoom, duration: 250 });
  }, []);
  const overview = () =>
    mapRef.current?.fitBounds(GERMANY_BOUNDS, { padding: 40, duration: 300 });

  useEffect(() => {
    siteRequest.current?.abort();
    setCandidate(null);
    setSiteError("");
    setChecking(false);
  }, [placing]);
  useEffect(() => {
    if (
      readonly ||
      !s.vehicles.some(
        (v) =>
          ["travel", "return", "transport"].includes(v.status) ||
          (v.status === "alarmed" &&
            v.turnout?.arrivals.some((a) => a.available && a.at > s.time)),
      )
    )
      return;
    const timer = setInterval(() => {
      if (!document.hidden) setMotionTick((v) => v + 1);
    }, 100);
    return () => clearInterval(timer);
  }, [readonly, s.vehicles, s.time]);

  useEffect(() => {
    const container = viewport.current,
      canvas = labelCanvas.current;
    if (!container || !canvas) return;
    const controller = new AbortController();
    let disposed = false,
      cleanup = () => {},
      map: GLMap | null = null;
    setReady(false);
    setError("");
    void loadGeoManifest(controller.signal)
      .then((manifest) => {
        if (disposed) return;
        let restored = null;
        try {
          restored = readGermanyCamera(
            localStorage.getItem(cameraKey),
            s.world,
            s.worldSeed,
          );
        } catch {
          /* Storage is optional. */
        }
        const initial =
          restored ?? unproject(s.buildings[0]?.pos ?? WORLD_CENTER);
        const gl = new maplibregl.Map({
          container,
          style: germanyStyle(manifest),
          center: [initial.lon, initial.lat],
          zoom: restored?.zoom ?? (s.buildings.length ? 12 : 6),
          minZoom: 4,
          maxZoom: 18,
          // MapLibre constrains the whole viewport, not just its center. A
          // Germany-sized maxBounds forces wide PC windows to zoom in and
          // clips the north/south even when fitBounds requests all Germany.
          maxBounds: [-30, 30, 50, 70],
          renderWorldCopies: false,
          clickTolerance: DRAG_THRESHOLD,
          dragPan: false,
          dragRotate: false,
          scrollZoom: false,
          doubleClickZoom: false,
          touchZoomRotate: false,
          keyboard: false,
          pitchWithRotate: false,
          maxPitch: 0,
          attributionControl: false,
          maxTileCacheSize: 160,
          fadeDuration: 100,
        });
        map = gl;
        mapRef.current = gl;
        gl.addControl(
          new maplibregl.AttributionControl({ compact: false }),
          "bottom-right",
        );
        gl.addControl(
          new maplibregl.ScaleControl({ unit: "metric", maxWidth: 120 }),
          "bottom-left",
        );
        const target = gl.getCanvas();
        target.setAttribute("aria-label", "Interaktive Karte von Deutschland");
        target.tabIndex = 0;
        const removeLabels = attachTileLabels(
          gl,
          canvas,
          () => labelsRef.current,
        );
        gl.on("load", () => {
          if (!disposed) {
            setReady(true);
            setError("");
            gl.addSource("dispatch-routes", {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
            });
            gl.addLayer({
              id: "dispatch-routes",
              type: "line",
              source: "dispatch-routes",
              paint: {
                "line-color": "#ff9e73",
                "line-width": 3,
                "line-dasharray": [2, 1],
              },
            });
          }
        });
        gl.on("error", (event) => {
          if (!disposed)
            setError(
              `Kartendaten konnten nicht vollständig geladen werden. ${event.error.message.slice(0, 150)}`,
            );
        });
        let pending = 0;
        const changed = () => {
          if (!pending)
            pending = requestAnimationFrame(() => {
              pending = 0;
              const c = gl.getCenter();
              container.dataset.camera = JSON.stringify({
                lon: c.lng,
                lat: c.lat,
                zoom: gl.getZoom(),
              });
              container.dataset.bounds = JSON.stringify(
                gl.getBounds().toArray(),
              );
              setCameraTick((v) => v + 1);
            });
        };
        gl.on("move", changed);
        gl.on("resize", changed);
        gl.on("load", changed);
        const persist = () => {
          try {
            const c = gl.getCenter();
            localStorage.setItem(
              cameraKey,
              JSON.stringify({
                world: s.world,
                seed: s.worldSeed,
                lon: c.lng,
                lat: c.lat,
                zoom: gl.getZoom(),
              }),
            );
          } catch {
            /* Storage is optional. */
          }
        };
        gl.on("moveend", persist);
        let gesture: {
            id: number;
            x: number;
            y: number;
            lastX: number;
            lastY: number;
            moved: boolean;
            marker: boolean;
          } | null = null,
          suppress = false;
        const cancel = () => {
          if (gesture) {
            suppress = gesture.moved;
            if (container.hasPointerCapture(gesture.id))
              container.releasePointerCapture(gesture.id);
          }
          gesture = null;
          container.classList.remove("dragging");
        };
        const down = (event: PointerEvent) => {
          if (
            !event.isPrimary ||
            event.button !== 0 ||
            (event.target as Element).closest(".maplibregl-ctrl")
          )
            return;
          event.preventDefault();
          cancel();
          suppress = false;
          target.focus({ preventScroll: true });
          gl.stop();
          gesture = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            lastX: event.clientX,
            lastY: event.clientY,
            moved: false,
            marker: !!(event.target as Element).closest(".germany-marker"),
          };
        };
        const move = (event: PointerEvent) => {
          if (!gesture || gesture.id !== event.pointerId) return;
          if (!(event.buttons & 1)) return cancel();
          if (
            !gesture.moved &&
            Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <
              DRAG_THRESHOLD
          )
            return;
          if (!gesture.moved) {
            gesture.moved = true;
            container.setPointerCapture(event.pointerId);
            container.classList.add("dragging");
            setFollowing(false);
          }
          gl.panBy(
            [gesture.lastX - event.clientX, gesture.lastY - event.clientY],
            { duration: 0 },
          );
          gesture.lastX = event.clientX;
          gesture.lastY = event.clientY;
        };
        const up = (event: PointerEvent) => {
          if (!gesture || gesture.id !== event.pointerId) return;
          const click = !gesture.moved && !gesture.marker;
          cancel();
          if (!click || !latest.current.placing || latest.current.readonly)
            return;
          const rect = container.getBoundingClientRect(),
            ll = gl.unproject([
              event.clientX - rect.left,
              event.clientY - rect.top,
            ]),
            p = project({ lon: ll.lng, lat: ll.lat });
          siteRequest.current?.abort();
          const request = new AbortController();
          siteRequest.current = request;
          setCandidate(null);
          setChecking(true);
          setSiteError("");
          void fetch(
            `/api/geo/site?${new URLSearchParams({ x: String(p.x), y: String(p.y), type: latest.current.placing })}`,
            {
              signal: request.signal,
              credentials: "same-origin",
              headers: { "x-game-mode": modeRef.current },
            },
          )
            .then(async (response) => {
              if (!response.ok)
                throw Error("Der Bauplatz konnte nicht geprüft werden.");
              const result = (await response.json()) as Site;
              if (
                !result.point ||
                ![result.point.x, result.point.y].every(Number.isFinite)
              )
                throw Error("Ungültige Bauplatzantwort.");
              if (!request.signal.aborted) setCandidate(result);
            })
            .catch((reason) => {
              if (!request.signal.aborted)
                setSiteError(String(reason.message || reason));
            })
            .finally(() => {
              if (!request.signal.aborted) setChecking(false);
            });
        };
        const click = (event: MouseEvent) => {
          if (suppress) {
            event.preventDefault();
            event.stopImmediatePropagation();
            suppress = false;
          }
        };
        const wheel = (event: WheelEvent) => {
          if (event.ctrlKey || event.metaKey) return;
          event.preventDefault();
          if (gesture) return;
          const rect = container.getBoundingClientRect(),
            ll = gl.unproject([
              event.clientX - rect.left,
              event.clientY - rect.top,
            ]);
          setFollowing(false);
          gl.easeTo({
            zoom: Math.max(
              4,
              Math.min(
                18,
                gl.getZoom() -
                  Math.max(
                    -240,
                    Math.min(
                      240,
                      wheelPixels(event.deltaY, event.deltaMode, rect.height),
                    ),
                  ) *
                    0.004,
              ),
            ),
            around: ll,
            duration: 90,
          });
        };
        const keyboard = (event: KeyboardEvent) => {
          if (
            event.target !== target ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
          )
            return;
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [-80, 0],
            ArrowRight: [80, 0],
            ArrowUp: [0, -80],
            ArrowDown: [0, 80],
          };
          if (directions[event.key]) {
            event.preventDefault();
            setFollowing(false);
            gl.panBy(directions[event.key], { duration: 0 });
          }
          if (["+", "=", "-"].includes(event.key)) {
            event.preventDefault();
            gl.zoomTo(gl.getZoom() + (event.key === "-" ? -0.5 : 0.5), {
              duration: 100,
            });
          }
          if (event.key === "Home") {
            event.preventDefault();
            setFollowing(false);
            gl.fitBounds(GERMANY_BOUNDS, { padding: 40, duration: 250 });
          }
          if (event.key === "Escape") {
            cancel();
            latest.current.onCancelPlace?.();
          }
        };
        const hidden = () => {
          if (document.hidden) cancel();
        };
        const dialogs = new MutationObserver(() => {
          if (gesture && document.querySelector('[role="dialog"],dialog[open]'))
            cancel();
        });
        dialogs.observe(document.body, { childList: true, subtree: true });
        const observer = new ResizeObserver(() => gl.resize());
        observer.observe(container);
        container.addEventListener("pointerdown", down);
        container.addEventListener("pointermove", move);
        container.addEventListener("pointerup", up);
        container.addEventListener("pointercancel", cancel);
        container.addEventListener("lostpointercapture", cancel);
        container.addEventListener("click", click, true);
        container.addEventListener("wheel", wheel, { passive: false });
        container.addEventListener("keydown", keyboard);
        window.addEventListener("blur", cancel);
        window.addEventListener("pointerup", cancel);
        document.addEventListener("visibilitychange", hidden);
        cleanup = () => {
          cancel();
          removeLabels();
          observer.disconnect();
          dialogs.disconnect();
          cancelAnimationFrame(pending);
          container.removeEventListener("pointerdown", down);
          container.removeEventListener("pointermove", move);
          container.removeEventListener("pointerup", up);
          container.removeEventListener("pointercancel", cancel);
          container.removeEventListener("lostpointercapture", cancel);
          container.removeEventListener("click", click, true);
          container.removeEventListener("wheel", wheel);
          container.removeEventListener("keydown", keyboard);
          window.removeEventListener("blur", cancel);
          window.removeEventListener("pointerup", cancel);
          document.removeEventListener("visibilitychange", hidden);
        };
      })
      .catch((reason) => {
        if (!disposed) setError(mapInitializationMessage(reason));
      });
    return () => {
      disposed = true;
      controller.abort();
      siteRequest.current?.abort();
      cleanup();
      map?.remove();
      mapRef.current = null;
    };
  }, [attempt, cameraKey, s.world, s.worldSeed]);

  useEffect(() => {
    if (!search.trim()) {
      setFound([]);
      setSearching(false);
      setSearchError("");
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setSearchError("");
    setFound([]);
    const timer = setTimeout(() => {
      void fetch(`/geo/search?q=${encodeURIComponent(search.trim())}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok)
            throw Error("Ortssuche ist momentan nicht verfügbar.");
          const result = await response.json();
          if (!Array.isArray(result))
            throw Error("Ungültige Antwort der Ortssuche.");
          setFound(
            result
              .filter(
                (r: SearchResult) =>
                  typeof r.name === "string" &&
                  Number.isFinite(r.lon) &&
                  Number.isFinite(r.lat),
              )
              .slice(0, 12),
          );
        })
        .catch((reason) => {
          if (!controller.signal.aborted)
            setSearchError(String(reason.message || reason));
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 240);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  const localResults = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("de");
    if (!query) return [];
    return [
      ...s.buildings.map((b) => ({ id: b.id, name: b.name, pos: b.pos })),
      ...s.vehicles.map((v) => ({
        id: v.id,
        name: v.name,
        pos: vehiclePosition(v, s.time),
      })),
      ...s.missions
        .filter((m) => !m.control || m.control.locationKnown)
        .map((m) => ({ id: m.id, name: mt(m.template).name, pos: m.pos })),
    ]
      .filter((v) => v.name.toLocaleLowerCase("de").includes(query))
      .slice(0, 6);
  }, [search, s.buildings, s.vehicles, s.missions, s.time]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const source = map.getSource("dispatch-routes") as
      | GeoJSONSource
      | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: routes
        ? s.vehicles
            .filter((v) => v.id === selected || v.mission === selected)
            .filter((v) => v.path.length >= 2)
            .map((v) => ({
              type: "Feature" as const,
              properties: {},
              geometry: {
                type: "LineString" as const,
                coordinates: v.path.map((p) => {
                  const ll = unproject(p);
                  return [ll.lon, ll.lat];
                }),
              },
            }))
        : [],
    });
  }, [ready, routes, selected, s.vehicles]);
  useEffect(() => {
    if (following && selectionPosition && selectedVehicle)
      center(selectionPosition, mapRef.current?.getZoom() ?? 13);
  }, [following, s.time, motionTick, selectedVehicle?.id, center]);

  // Work is bounded by the authorized snapshot and viewport; far-away markers
  // never become DOM nodes. At overview scale overlapping markers form groups.
  const markers = useMemo(() => {
    const map = mapRef.current;
    if (!ready || !map) return [];
    const data: MarkerData[] = [];
    const add = (item: MarkerData) => {
      if (
        (filter === "Alle" ||
          filter ===
            {
              station: "Wachen",
              vehicle: "Fahrzeuge",
              mission: "Einsätze",
              volunteer: "Fahrzeuge",
            }[item.kind]) &&
        (org === "Alle" || org === item.org)
      )
        data.push(item);
    };
    s.buildings.forEach((b) =>
      add({
        id: b.id,
        name: b.name,
        pos: b.pos,
        kind: "station",
        org: bt(b.type).org,
      }),
    );
    s.missions
      .filter((m) => !m.control || m.control.locationKnown)
      .forEach((m) =>
        add({
          id: m.id,
          name: mt(m.template).name,
          pos: m.pos,
          kind: "mission",
          org: mt(m.template).org,
        }),
      );
    s.vehicles
      .filter(
        (v) =>
          status === "Alle" ||
          (status === "Bereit"
            ? v.status === "ready"
            : status === "Unterwegs"
              ? ["travel", "return", "transport"].includes(v.status)
              : v.status === "scene"),
      )
      .forEach((v) =>
        add({
          id: v.id,
          name: v.name,
          pos: vehiclePosition(v, now),
          kind: "vehicle",
          org: bt(vt(v.type).home).org,
        }),
      );
    if (status === "Alle" || status === "Unterwegs")
      volunteerMarkers(s, now).forEach((a) =>
        add({
          id: a.id,
          name: a.name,
          pos: a.pos,
          kind: "volunteer",
          org: "Feuerwehr",
          target: a.home,
        }),
      );
    if (showFriends)
      friends.forEach((f) => {
        f.buildings.forEach((b) =>
          add({
            id: `${f.id}:${b.id}`,
            name: `${b.name} · ${f.name}`,
            pos: b.pos,
            kind: "station",
            org: bt(b.type).org,
            friend: true,
          }),
        );
        f.missions
          .filter((m) => !m.control || m.control.locationKnown)
          .forEach((m) =>
            add({
              id: `${f.id}:${m.id}`,
              name: `${mt(m.template).name} · ${f.name}`,
              pos: m.pos,
              kind: "mission",
              org: mt(m.template).org,
              friend: true,
            }),
          );
        f.vehicles.forEach((v) =>
          add({
            id: `${f.id}:${v.id}`,
            name: `${v.name} · ${f.name}`,
            pos: v.position,
            kind: "vehicle",
            org: bt(vt(v.type).home).org,
            friend: true,
          }),
        );
      });
    const box = map.getContainer().getBoundingClientRect(),
      groups = new Map<string, MarkerData & { left: number; top: number }>();
    data.sort((a, b) => Number(b.id === selected) - Number(a.id === selected));
    for (const item of data) {
      const p = unproject(item.pos);
      if (![p.lon, p.lat].every(Number.isFinite)) continue;
      const pixel = map.project([p.lon, p.lat]);
      if (
        pixel.x < -30 ||
        pixel.y < -30 ||
        pixel.x > box.width + 30 ||
        pixel.y > box.height + 30
      )
        continue;
      const key =
        map.getZoom() >= 14 || item.id === selected
          ? item.id
          : `${item.kind}:${Math.floor(pixel.x / 36)}:${Math.floor(pixel.y / 36)}`;
      const group = groups.get(key);
      if (group) group.count = (group.count ?? 1) + 1;
      else groups.set(key, { ...item, left: pixel.x, top: pixel.y });
    }
    return [...groups.values()].slice(0, 650);
  }, [
    ready,
    cameraTick,
    motionTick,
    s.buildings,
    s.missions,
    s.vehicles,
    s.time,
    now,
    selected,
    filter,
    org,
    status,
    friends,
    showFriends,
  ]);
  const candidatePixel =
    candidate && ready
      ? (() => {
          const p = unproject(candidate.point);
          return mapRef.current?.project([p.lon, p.lat]);
        })()
      : null;

  return (
    <div
      className="map-wrap germany-map"
      data-world={s.world}
      data-testid="germany-map"
    >
      <div
        ref={viewport}
        className="germany-viewport"
        data-testid="germany-map-viewport"
      >
        <canvas
          ref={labelCanvas}
          className="germany-labels"
          aria-hidden="true"
        />
        <div className="germany-markers">
          {markers.map((m) => (
            <button
              key={m.id}
              className={`germany-marker ${m.kind} ${m.friend ? "friend" : ""} ${m.id === selected ? "selected" : ""}`}
              style={{ left: m.left, top: m.top }}
              aria-label={
                m.count
                  ? `${m.count} ${m.kind === "volunteer" ? "freiwillige Kräfte auf Anreise" : m.kind === "vehicle" ? "Fahrzeuge" : m.kind === "station" ? "Wachen" : "Einsätze"} · vergrößern`
                  : m.name
              }
              title={m.name}
              data-testid={`map-${m.kind}`}
              data-object-id={m.id}
              onClick={() => {
                setFollowing(false);
                if (m.count)
                  center(
                    m.pos,
                    Math.min(18, (mapRef.current?.getZoom() ?? 10) + 2),
                  );
                else onSelect(m.friend ? "friends" : (m.target ?? m.id));
              }}
            >
              {m.count ? (
                <b>{m.count}</b>
              ) : m.kind === "mission" ? (
                <IncidentIcon org={m.org} />
              ) : (
                <span>
                  {m.kind === "volunteer"
                    ? "●"
                    : m.kind === "vehicle"
                      ? "▰"
                      : "▣"}
                </span>
              )}
              {m.id === selected && <small>{m.name}</small>}
            </button>
          ))}
        </div>
        {candidatePixel && (
          <span
            className="germany-site-pin"
            style={{ left: candidatePixel.x, top: candidatePixel.y }}
            aria-label="Gewählter Bauplatz"
          >
            +
          </span>
        )}
      </div>
      {(!ready || error) && (
        <div className="germany-map-message" role={error ? "alert" : "status"}>
          {error || "Deutschlandkarte wird geladen …"}
          {error && (
            <button onClick={() => setAttempt((v) => v + 1)}>
              Erneut laden
            </button>
          )}
        </div>
      )}
      {readonly && (
        <div className="germany-offline" role="status">
          Verbindung fehlt · letzter bestätigter Spielstand
        </div>
      )}
      <div className="map-toolbar">
        <strong>Deutschland · reale Geografie</strong>
        <span>Regionen, Orte und Straßen aus dem lokalen Kartensatz</span>
      </div>
      <div className="map-search">
        <label>
          <Search size={16} />
          <input
            aria-label="Karte durchsuchen"
            placeholder="Ort, Adresse, Wache oder Funkrufname …"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {search && (
          <button aria-label="Suche löschen" onClick={() => setSearch("")}>
            <X size={15} />
          </button>
        )}
        <select
          aria-label="Kartenfilter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          {["Alle", "Einsätze", "Wachen", "Fahrzeuge"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="Organisation auf Karte"
          value={org}
          onChange={(event) => setOrg(event.target.value)}
        >
          {[
            "Alle",
            "Feuerwehr",
            "Rettungsdienst",
            "Polizei",
            "THW",
            "Wasserrettung",
            "Infrastruktur",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="Fahrzeugstatus auf Karte"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {["Alle", "Bereit", "Unterwegs", "Am Einsatzort"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        {search && (
          <div className="map-search-results" aria-label="Suchergebnisse">
            {localResults.map((result) => (
              <button
                key={result.id}
                onClick={() => {
                  center(result.pos);
                  onSelect(result.id);
                  setSearch("");
                  setFollowing(false);
                }}
              >
                {result.name}
                <small>Meine Leitstelle</small>
              </button>
            ))}
            {found.map((result) => (
              <button
                key={result.id}
                onClick={() => {
                  center(project(result), result.kind === "city" ? 11 : 14);
                  setSearch("");
                  setFollowing(false);
                }}
              >
                {result.name}
                <small>{result.kind}</small>
              </button>
            ))}
            {searching && <span role="status">Orte werden gesucht …</span>}
            {searchError && <span role="alert">{searchError}</span>}
            {!searching &&
              !searchError &&
              !found.length &&
              !localResults.length && (
                <span>
                  Keine passenden Orte oder sichtbaren Objekte gefunden.
                </span>
              )}
          </div>
        )}
      </div>
      <div className="map-layers" aria-label="Kartenebenen">
        <button
          onClick={() => {
            setFollowing(false);
            overview();
          }}
        >
          Ganz Deutschland
        </button>
        <button
          onClick={() => {
            setFollowing(false);
            center(s.buildings[0]?.pos ?? WORLD_CENTER);
          }}
        >
          Meine Wachen
        </button>
        <button
          data-center-selection
          disabled={!selectionPosition}
          onClick={() => selectionPosition && center(selectionPosition)}
        >
          <Crosshair size={15} /> Auswahl zentrieren
        </button>
        {selectedVehicle && (
          <button
            aria-pressed={following}
            onClick={() => setFollowing(!following)}
          >
            <Navigation size={15} />
            Fahrzeug folgen
          </button>
        )}
        <button
          aria-pressed={labels}
          onClick={() => {
            setLabels(!labels);
            mapRef.current?.triggerRepaint();
          }}
        >
          Beschriftung
        </button>
        <button aria-pressed={routes} onClick={() => setRoutes(!routes)}>
          Fahrwege
        </button>
        {!!friends.length && (
          <button
            aria-pressed={showFriends}
            onClick={() => setShowFriends(!showFriends)}
          >
            Verbund
          </button>
        )}
      </div>
      <div className="map-zoom" aria-label="Zoomsteuerung">
        <button
          aria-label="Vergrößern"
          onClick={() => mapRef.current?.zoomIn()}
        >
          +
        </button>
        <button
          aria-label="Verkleinern"
          onClick={() => mapRef.current?.zoomOut()}
        >
          −
        </button>
        <button
          aria-label="Karte zentrieren"
          onClick={() => center(s.buildings[0]?.pos ?? WORLD_CENTER)}
        >
          <LocateFixed size={18} />
        </button>
      </div>
      <details className="map-control-help">
        <summary>Kartensteuerung</summary>
        <p>
          Ziehen: Karte verschieben · Mausrad: Zoom zum Zeiger · Klick:
          auswählen. Pfeiltasten und +/− bei fokussierter Karte, Pos1: ganz
          Deutschland. Strg+Mausrad vergrößert den Browser. Escape bricht die
          Bauplatzwahl ab.
        </p>
      </details>
      {selectedVehicle && (
        <div className="map-vehicle-detail">
          <strong>{selectedVehicle.name}</strong>
          <span>{tripLabel(selectedVehicle, s.time)}</span>
          <span>
            {selectedVehicle.journey?.reason ||
              "Fahrweg nach aktuellem Straßenmodell"}
          </span>
        </div>
      )}
      <Operations s={s} />
      {placing && (
        <div className="placement-hint germany-placement">
          <button
            onClick={() => {
              siteRequest.current?.abort();
              setCandidate(null);
              onCancelPlace?.();
            }}
          >
            Bau abbrechen
          </button>
          {checking ? (
            <span role="status">
              Straßenanbindung wird serverseitig geprüft …
            </span>
          ) : candidate ? (
            <>
              <span>
                {candidate.reason ||
                  "Bauplatz geprüft · Bestätigung kauft den gewählten Gebäudetyp."}
              </span>
              <button
                disabled={readonly || !!candidate.reason}
                onClick={() => {
                  if (candidate) onPlace(candidate.point);
                  setCandidate(null);
                }}
              >
                Bau bestätigen
              </button>
              <button onClick={() => setCandidate(null)}>
                Position verwerfen
              </button>
            </>
          ) : (
            <span>
              {siteError ||
                "Bauplatz auf der Karte wählen · anschließend bestätigen"}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
export const MapView = GermanyMap;
