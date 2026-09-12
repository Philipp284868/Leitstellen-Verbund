import { Crosshair, LocateFixed, Navigation, Search, X } from "lucide-react";
import type { Map as GLMap, GeoJSONSource } from "maplibre-gl";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bt, vt } from "../../shared/catalog";
import {
  devicePreferences,
  updateDevicePreference,
  useDevicePreferences,
} from "../device-preferences";
import { requestDialogTransition } from "../dialog-state";
import { fleetReadiness } from "../../shared/fleet-view";
import { IncidentIcon } from "../HudIcons";
import { DRAG_THRESHOLD, wheelPixels } from "../map-camera";
import {
  BuildingIcon,
  MapIcon,
  VehicleIcon,
  organizationColors,
} from "../../shared/map-icons";
import "../MapTools.css";
import {
  incidentColors,
  incidentKindNames,
  missionPresentation,
} from "../mission-presentation";
import type { Save } from "../../shared/model";
import { openNavigation, searchNavigation } from "../navigation";
import type { Friend } from "../network";
import { Operations } from "../Operations";
import type { PublicPlayer } from "../../shared/presence";
import { emit, useGame } from "../store";
import { tripLabel } from "../../shared/travel";
import { FacilityDetails } from "../facilities/FacilityBrowser";
import { attachFacilityLayer } from "../facilities/map-layer";
import {
  facilityLabels,
  type FacilityCluster,
} from "../../shared/facilities/types";
import { vehicleMotion, vehiclePosition } from "../../shared/vehicle-position";
import type { Point } from "../../shared/world";
import { groupGameMarkers, type MarkerData } from "./game-markers";
import "./GermanyMap.css";
import { mapInitializationMessage } from "./map-errors";
import { attachTileLabels } from "./map-labels";
import {
  GERMANY_BOUNDS,
  germanyStyle,
  loadGeoManifest,
  readGermanyCamera,
} from "./map-style";
import {
  WORLD_CENTER,
  inBounds,
  project,
  unproject,
} from "../../shared/germany/projection";

maplibregl.setWorkerUrl(workerUrl);
type SearchResult = {
  id: string;
  name: string;
  kind: string;
  lon: number;
  lat: number;
};
export type GermanyMapProps = {
  s: Save;
  selected: string;
  onSelect: (id: string) => void;
  friends: Friend[];
  presence?: readonly PublicPlayer[];
  ownDeskId?: string;
  readonly?: boolean;
  onInspect?: () => void;
  inspectionsHidden?: boolean;
};

export const GermanyMap = memo(function GermanyMap(props: GermanyMapProps) {
  const {
    s,
    selected,
    onSelect,
    friends,
    readonly = false,
    onInspect,
    inspectionsHidden = false,
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
  const preferences = useDevicePreferences();
  const labels = preferences.labels,
    routes = preferences.routes,
    showFriends = preferences.friends,
    following = preferences.follow;
  const setPreference = useCallback(
    (key: "labels" | "routes" | "friends" | "follow", value: boolean) => {
      try {
        updateDevicePreference(key, value);
      } catch (error) {
        emit({ error: String(error) });
      }
    },
    [],
  );
  const setLabels = (value: boolean) => setPreference("labels", value);
  const setRoutes = (value: boolean) => setPreference("routes", value);
  const setShowFriends = (value: boolean) => setPreference("friends", value);
  const setFollowing = useCallback(
    (value: boolean) => setPreference("follow", value),
    [setPreference],
  );
  const [objectGroup, setObjectGroup] = useState<MarkerData[]>([]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        !objectGroup.length ||
        document.querySelector('[aria-modal="true"]')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setObjectGroup([]);
      mapRef.current?.getCanvas().focus({ preventScroll: true });
    };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [objectGroup.length]);
  useEffect(() => {
    if (inspectionsHidden) {
      setObjectGroup([]);
    }
  }, [inspectionsHidden]);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const [facilityId, setFacilityId] = useState(""),
    [facilityGroup, setFacilityGroup] = useState<FacilityCluster[]>([]),
    [facilityError, setFacilityError] = useState("");
  const facilityCanvas = useRef<HTMLCanvasElement>(null),
    facilityLayer = useRef<ReturnType<typeof attachFacilityLayer> | null>(null);
  const facilityOptions = useRef({
    enabled: true,
    kind: "" as const,
    owned: new Set<string>(),
  });
  facilityOptions.current = {
    enabled: true,
    kind: "" as const,
    owned: new Set(
      s.buildings.flatMap((b) => (b.facility ? [b.facility.id] : [])),
    ),
  };
  const clock = useRef({ time: s.time, at: performance.now() });
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
    : (s.buildings.find((b) => b.id === selected)?.facility?.position ??
      s.buildings.find((b) => b.id === selected)?.pos ??
      s.missions.find(
        (m) => m.id === selected && (!m.control || m.control.locationKnown),
      )?.pos);
  const center = useCallback((point: Point, zoom = 13) => {
    const p = unproject(point);
    mapRef.current?.easeTo({
      center: [p.lon, p.lat],
      zoom,
      duration: devicePreferences().reduced ? 0 : 250,
    });
  }, []);
  const overview = () =>
    mapRef.current?.fitBounds(GERMANY_BOUNDS, {
      padding: 40,
      duration: devicePreferences().reduced ? 0 : 300,
    });

  useEffect(() => {
    facilityLayer.current?.repaint();
  }, [s.buildings]);
  useEffect(() => {
    if (inspectionsHidden) {
      setFacilityId("");
      setFacilityGroup([]);
    }
  }, [inspectionsHidden]);
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
        if (facilityCanvas.current)
          facilityLayer.current = attachFacilityLayer(
            gl,
            facilityCanvas.current,
            () => facilityOptions.current,
            setFacilityError,
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
              // Publish readiness together with the pose. moveend can fire
              // before this scheduled render frame has exposed its final pose.
              container.dataset.cameraMoving = String(gl.isMoving());
              setCameraTick((v) => v + 1);
            });
        };
        gl.on("move", changed);
        gl.on("resize", changed);
        gl.on("load", changed);
        // Read-only rendering evidence alongside camera/bounds. Count the
        // renderer's visible route features, not merely the supplied snapshot.
        gl.on("idle", () => {
          container.dataset.visibleRoutes = String(
            gl.getLayer("dispatch-routes")
              ? gl.queryRenderedFeatures({ layers: ["dispatch-routes"] }).length
              : 0,
          );
        });
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
        container.dataset.cameraMoving = "false";
        gl.on("movestart", () => {
          container.dataset.cameraMoving = "true";
        });
        gl.on("moveend", () => {
          persist();
          changed();
        });
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
          if (!click) return;
          {
            const box = container.getBoundingClientRect();
            const facilities =
              facilityLayer.current?.hitTest(
                event.clientX - box.left,
                event.clientY - box.top,
              ) || [];
            if (facilities.length) {
              latest.current.onInspect?.();
              const cluster = facilities.find((f) => f.count > 1);
              if (cluster) {
                gl.easeTo({
                  center: [cluster.lon, cluster.lat],
                  zoom: Math.min(18, gl.getZoom() + 2),
                  duration: 0,
                });
                return;
              }
              const ids = facilities.flatMap((f) => (f.id ? [f.id] : []));
              setFacilityId(ids.length === 1 ? ids[0] : "");
              setFacilityGroup(ids.length > 1 ? facilities : []);
              return;
            }
            setFacilityId("");
            setFacilityGroup([]);
            return;
          }
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
                  (Math.max(
                    -240,
                    Math.min(
                      240,
                      wheelPixels(event.deltaY, event.deltaMode, rect.height),
                    ),
                  ) *
                    0.004 *
                    devicePreferences().zoomSensitivity) /
                    100,
              ),
            ),
            around: ll,
            duration: devicePreferences().reduced ? 0 : 90,
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
              duration: devicePreferences().reduced ? 0 : 100,
            });
          }
          if (event.key === "Home") {
            event.preventDefault();
            setFollowing(false);
            gl.fitBounds(GERMANY_BOUNDS, {
              padding: 40,
              duration: devicePreferences().reduced ? 0 : 250,
            });
          }
          if (event.key === "Escape") {
            cancel();
            setFacilityId("");
            setFacilityGroup([]);
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
          gl.stop();
          persist();
          cancel();
          removeLabels();
          facilityLayer.current?.destroy();
          facilityLayer.current = null;
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
      cleanup();
      map?.remove();
      mapRef.current = null;
    };
  }, [attempt, cameraKey, s.world, s.worldSeed]);

  useEffect(() => {
    const focus = (event: Event) => {
      const detail = (event as CustomEvent<{ point?: Point; zoom?: number }>)
        .detail;
      if (!detail?.point || !inBounds(detail.point)) return;
      setFollowing(false);
      center(
        detail.point,
        Number.isFinite(detail.zoom)
          ? Math.max(4, Math.min(18, detail.zoom!))
          : 14,
      );
    };
    window.addEventListener("lv:map-focus", focus);
    return () => window.removeEventListener("lv:map-focus", focus);
  }, [center]);
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
      ...s.buildings.map((b) => ({
        id: b.id,
        name: b.name,
        pos: b.facility?.position ?? b.pos,
      })),
      ...s.vehicles.map((v) => ({
        id: v.id,
        name: v.name,
        pos: vehiclePosition(v, s.time),
      })),
      ...s.missions
        .filter((m) => !m.control || m.control.locationKnown)
        .map((m) => ({
          id: m.id,
          name: missionPresentation(m).name,
          pos: m.pos,
        })),
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
        pos: b.facility?.position ?? b.pos,
        kind: "station",
        type: b.type,
        org: bt(b.type).org,
      }),
    );
    s.missions
      .filter((m) => !m.control || m.control.locationKnown)
      .forEach((m) =>
        add({
          ...missionPresentation(m),
          id: m.id,
          pos: m.pos,
          kind: "mission",
          urgent: m.control?.priority === "NOTFALL",
        }),
      );
    s.vehicles
      .filter(
        (v) =>
          status === "Alle" ||
          (status === "Bereit"
            ? !fleetReadiness(s)(v)
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
          type: v.type,
          fms: s.desk.fleet[v.id]?.code,
          fault: !!v.fault && v.fault.state !== "repaired",
          heading: (() => {
            const a = vehiclePosition(v, now),
              b = vehiclePosition(v, now + 1);
            return Math.hypot(a.x - b.x, a.y - b.y) > 0.001
              ? (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
              : undefined;
          })(),
          org: bt(vt(v.type).home).org,
        }),
      );
    if (showFriends)
      friends.forEach((f) => {
        f.buildings.forEach((b) =>
          add({
            id: `${f.id}:${b.id}`,
            name: `${b.name} · ${f.name}`,
            pos: b.facility?.position ?? b.pos,
            kind: "station",
            type: b.type,
            org: bt(b.type).org,
            friend: true,
          }),
        );
        f.missions
          .filter((m) => !m.control || m.control.locationKnown)
          .forEach((m) =>
            add({
              ...missionPresentation(m),
              id: `${f.id}:${m.id}`,
              name: `${missionPresentation(m).name} · ${f.name}`,
              pos: m.pos,
              kind: "mission",
              urgent: m.control?.priority === "NOTFALL",
              friend: true,
            }),
          );
        f.vehicles.forEach((v) =>
          add({
            id: `${f.id}:${v.id}`,
            name: `${v.name} · ${f.name}`,
            pos: v.position,
            kind: "vehicle",
            type: v.type,
            fms: v.fms,
            fault: !!v.fault && v.fault.state !== "repaired",
            org: bt(vt(v.type).home).org,
            friend: true,
          }),
        );
      });
    const box = map.getContainer().getBoundingClientRect();
    return groupGameMarkers(
      data,
      (p) => {
        const ll = unproject(p);
        return map.project([ll.lon, ll.lat]);
      },
      box.width,
      box.height,
      map.getZoom(),
      selected,
    );
  }, [
    ready,
    cameraTick,
    motionTick,
    s.buildings,
    s.missions,
    s.vehicles,
    s.time,
    s.desk.fleet,
    now,
    selected,
    filter,
    org,
    status,
    friends,
    showFriends,
  ]);
  const visibleObjects = new Map(
    markers.flatMap((m) => m.members).map((m) => [m.id, m]),
  );
  const objectDetails = objectGroup.map((m) => visibleObjects.get(m.id) ?? m);
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
        <canvas
          ref={facilityCanvas}
          className="facility-map-canvas"
          aria-hidden="true"
        />
        <div className="germany-markers">
          {markers.map((m) => (
            <button
              key={m.id}
              className={`germany-marker ${m.kind} ${m.friend ? "friend" : ""} ${m.coLocated ? "co-located" : ""} ${m.id === selected ? "selected" : ""}`}
              style={{
                left: m.left,
                top: m.top,
                background:
                  m.kind === "mission"
                    ? m.color
                    : (organizationColors[m.org] ?? "#52616b"),
              }}
              aria-label={
                m.count
                  ? `${m.count} ${m.kind === "volunteer" ? "freiwillige Kräfte auf Anreise" : m.kind === "vehicle" ? "Fahrzeuge" : m.kind === "station" ? "Wachen" : "Einsätze"} · Gruppe öffnen`
                  : m.name
              }
              title={`${m.count ? `${m.count} Einsätze` : m.name}${m.categories ? ` · ${m.categories.map((c) => incidentKindNames[c]).join(" + ")}` : ""}${m.urgent ? " · Notfall" : ""}`}
              data-category={m.category}
              data-testid={`map-${m.kind}`}
              data-object-id={m.id}
              onClick={() =>
                requestDialogTransition(() => {
                  setFollowing(false);
                  if (m.count) {
                    onInspect?.();
                    setObjectGroup(m.members);
                  } else {
                    setObjectGroup([]);
                    onSelect(m.friend ? "friends" : (m.target ?? m.id));
                  }
                })
              }
            >
              {m.count ? (
                <>
                  <b>{m.count}</b>
                  {m.kind === "mission" && (
                    <IncidentIcon category={m.category} />
                  )}
                </>
              ) : m.kind === "mission" ? (
                <IncidentIcon org={m.org} category={m.category} />
              ) : m.kind === "vehicle" ? (
                <VehicleIcon type={m.type ?? ""} />
              ) : m.kind === "station" ? (
                <BuildingIcon type={m.type ?? ""} />
              ) : (
                <MapIcon glyph="civilianCar" />
              )}
              {m.urgent && (
                <span className="marker-urgency" aria-label="Notfall">
                  !
                </span>
              )}
              {!m.count && m.categories && m.categories.length > 1 && (
                <span
                  className="marker-secondary"
                  title="Auch medizinische Versorgung"
                >
                  <IncidentIcon category="medical" />
                </span>
              )}
              {!m.count && m.fms !== undefined && (
                <span className="marker-fms" title={`FMS ${m.fms}`}>
                  {m.fms}
                </span>
              )}
              {!m.count && m.fault && (
                <span className="marker-fault" title="Fahrzeugstörung">
                  !
                </span>
              )}
              {!m.count && m.heading !== undefined && (
                <i
                  className="marker-heading"
                  style={{ transform: `rotate(${m.heading}deg)` }}
                  aria-hidden="true"
                />
              )}
              {m.id === selected && <small>{m.name}</small>}
            </button>
          ))}
        </div>
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
      <aside className="map-tool-panel" aria-label="Kartenwerkzeuge">
        <div className="map-toolbar">
          <strong>Deutschland · reale Geografie</strong>
          <span>Regionen, Orte und Straßen aus dem lokalen Kartensatz</span>
        </div>
        <div className="map-search">
          <label>
            <Search size={16} />
            <input
              aria-label="Karte durchsuchen"
              placeholder="Ort, Fahrzeug, Menü oder Einstellung …"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
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
              {searchNavigation(search).map((item) => (
                <button
                  key={item.title}
                  onClick={() => {
                    openNavigation(item);
                    setSearch("");
                  }}
                >
                  <b>{item.title}</b>
                  <small>Menü / Einstellungen</small>
                </button>
              ))}
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
                !localResults.length &&
                !searchNavigation(search).length && (
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
        <details className="map-poi-filters">
          <summary>Einrichtungen & Kartenlegende</summary>
          <div className="incident-legend" aria-label="Einsatzkategorien">
            {(
              [
                "unknown",
                "fire",
                "medical",
                "technical",
                "police",
                "water",
                "mixed",
              ] as const
            ).map((category) => (
              <span key={category}>
                <i style={{ background: incidentColors[category] }}>
                  <IncidentIcon category={category} />
                </i>
                {incidentKindNames[category]}
              </span>
            ))}
          </div>
          <p>
            Grün kennzeichnet Medizin, nicht geringe Dringlichkeit. Ein gelbes !
            am Einsatz zeigt NOTFALL; bei kombinierten Lagen bleiben zusätzliche
            Kategorien erkennbar.
          </p>
          <p>
            Kontur: geografischer Ort · gefüllt: Spielgebäude. Farbe:
            Organisation · Zahl am Fahrzeug: FMS · gestrichelter Rand:
            freigegebener Verbund · ! am Fahrzeug: Störung. Gruppen öffnen eine
            Auswahl; Vergrößern zeigt räumlich getrennte Standorte.
          </p>
          <p>
            Einrichtungen stammen aus dem installierten
            OpenStreetMap-Datenstand. Ihre Verfügbarkeit im Spiel folgt
            ausschließlich den Spielregeln.
          </p>
        </details>
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
            Standortsuche ab.
          </p>
        </details>
        <Operations s={s} />
      </aside>
      {!inspectionsHidden && !!objectDetails.length && (
        <aside
          className="map-place-detail map-object-group"
          aria-label="Objekte am Kartenstandort"
        >
          <button
            className="map-detail-close"
            aria-label="Objektgruppe schließen"
            onClick={() => setObjectGroup([])}
          >
            <X size={18} />
          </button>
          <h3>{objectDetails.length} Objekte an diesem Standort</h3>
          <p>
            Alle Einträge bleiben einzeln auswählbar, auch an derselben Wache.
          </p>
          <div className="map-object-list">
            {objectDetails.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setObjectGroup([]);
                  onSelect(m.friend ? "friends" : (m.target ?? m.id));
                }}
              >
                {m.kind === "vehicle" ? (
                  <VehicleIcon type={m.type ?? ""} size={30} />
                ) : m.kind === "station" ? (
                  <BuildingIcon type={m.type ?? ""} size={30} />
                ) : (
                  <IncidentIcon org={m.org} category={m.category} />
                )}
                <span>
                  <strong>{m.name}</strong>
                  <small>
                    {m.org}
                    {m.fms !== undefined ? ` · FMS ${m.fms}` : ""}
                    {m.fault ? " · Störung" : ""}
                    {m.friend ? " · Verbund" : ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </aside>
      )}
      {!inspectionsHidden && selectedVehicle && !objectDetails.length && (
        <div className="map-vehicle-detail" aria-label="Ausgewähltes Fahrzeug">
          <button
            className="map-detail-close"
            aria-label="Fahrzeugdetails schließen"
            onClick={() => onInspect?.()}
          >
            <X size={18} />
          </button>
          <strong>
            <VehicleIcon type={selectedVehicle.type} />
            {selectedVehicle.name}
          </strong>
          <span>{tripLabel(selectedVehicle, s.time)}</span>
          <span>
            {Math.round(vehicleMotion(selectedVehicle, s.time).kmh)} km/h
            aktuell
          </span>
          <span>
            {selectedVehicle.journey?.reason ||
              "Fahrweg nach aktuellem Straßenmodell"}
          </span>
        </div>
      )}
      {!inspectionsHidden && facilityId && (
        <div className="facility-map-panel">
          <FacilityDetails
            key={facilityId}
            s={s}
            id={facilityId}
            readonly={readonly}
            onClose={() => setFacilityId("")}
            onManage={(id) => {
              setFacilityId("");
              onSelect(id);
            }}
          />
        </div>
      )}
      {!inspectionsHidden && !!facilityGroup.length && (
        <div className="facility-map-panel facility-details">
          <button className="close" onClick={() => setFacilityGroup([])}>
            ×
          </button>
          <h3>Einrichtungen an dieser Stelle</h3>
          {facilityGroup.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setFacilityId(f.id!);
                setFacilityGroup([]);
              }}
            >
              {f.name || "Name nicht erfasst"} ·{" "}
              {f.kind ? facilityLabels[f.kind] : "Einrichtung"}
            </button>
          ))}
        </div>
      )}
      {facilityError && (
        <p className="facility-map-panel facility-details" role="status">
          {facilityError}
        </p>
      )}
    </div>
  );
});
export const MapView = GermanyMap;
