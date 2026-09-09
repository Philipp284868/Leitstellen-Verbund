import { readCamera, DRAG_THRESHOLD, wheelPixels } from "./map-camera";
import { WORLD_NAME, WORLD_CENTER } from "./world-choice";
import { IncidentIcon } from "./HudIcons";
import { buildReason } from "./purchase";
import { vehiclePosition, vehicleMotion } from "./vehicle-position";
import { volunteerMarkers } from "./simulation/volunteers";
import { roadSections, METERS_PER_UNIT, nearest, distance } from "./world";
import { vt } from "./catalog";
import {
  LocateFixed,
  Crosshair,
  Search,
  X,
  Navigation,
  Anchor,
} from "lucide-react";
import "./MapTools.css";
import { tripLabel } from "./travel";
import { towns } from "./region";
import { Operations } from "./Operations";
import { roadNames } from "./simulation/weather";
import { nodes } from "./world";
import { MapTerrain } from "./MapTerrain";
import { memo, useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  districts,
  publicHospital,
  docks,
  type Point,
} from "./world";
import { mt, bt } from "./catalog";
import type { Save } from "./model";
import type { Friend } from "./network";
import { playerColor } from "./ui";
import { VehicleMarkers } from "./VehicleMarkers";
export const MapView = memo(function MapView({
  s,
  selected,
  onSelect,
  placing,
  onPlace,
  friends,
  readonly = false,
  onCancelPlace,
}: {
  s: Save;
  selected: string;
  onSelect: (id: string) => void;
  placing: string;
  onPlace: (p: Point) => void;
  friends: Friend[];
  readonly?: boolean;
  onCancelPlace?: () => void;
}) {
  const overview = 1300 / WORLD_WIDTH;
  const cameraKey = `lv-camera-v1:${s.world}:${s.player.id}`;
  const [restored] = useState(() => {
    try {
      return readCamera(
        localStorage.getItem(cameraKey),
        s.world,
        s.worldSeed,
        WORLD_WIDTH,
      );
    } catch {
      return null;
    }
  });
  const [search, setSearch] = useState(""),
    [org, setOrg] = useState("Alle"),
    [status, setStatus] = useState("Alle"),
    [following, setFollowing] = useState(false),
    [candidate, setCandidate] = useState<Point | null>(null);
  useEffect(() => setCandidate(null), [placing]);
  const vehicle = s.vehicles.find((v) => v.id === selected);
  const motion = vehicle ? vehicleMotion(vehicle, s.time) : null;
  const section = motion
    ? roadSections.find((r) => r.id === motion.edge)
    : null;
  const [zoom, setZoom] = useState(restored?.zoom ?? 1),
    [offset, setOffset] = useState(() => ({
      x:
        restored?.x ??
        Math.max(
          0,
          Math.min(
            WORLD_WIDTH - 1300,
            (s.buildings[0]?.pos.x ?? WORLD_CENTER.x) - 650,
          ),
        ),
      y:
        restored?.y ??
        Math.max(
          0,
          Math.min(
            WORLD_HEIGHT - 850,
            (s.buildings[0]?.pos.y ?? WORLD_CENTER.y) - 425,
          ),
        ),
    })),
    [filter, setFilter] = useState("Alle"),
    [labels, setLabels] = useState(true),
    [routes, setRoutes] = useState(true),
    [showFriends, setShowFriends] = useState(true);
  const svg = useRef<SVGSVGElement>(null);
  const [pixelWidth, setPixelWidth] = useState(800),
    [pixelHeight, setPixelHeight] = useState(400);
  const [aspect, setAspect] = useState(1300 / 850);
  const previousAspect = useRef<number | null>(restored ? null : 1300 / 850);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width <= 0 || entry.contentRect.height <= 0) return;
      setPixelWidth(entry.contentRect.width);
      setPixelHeight(entry.contentRect.height);
      const next =
        entry.contentRect.width / Math.max(1, entry.contentRect.height);
      const old = previousAspect.current;
      previousAspect.current = next;
      setAspect(next);
      if (zoom !== overview && old !== null)
        setOffset((p) => ({
          ...p,
          y: Math.max(
            0,
            Math.min(
              WORLD_HEIGHT - 1300 / zoom / next,
              p.y + (1300 / zoom / old - 1300 / zoom / next) / 2,
            ),
          ),
        }));
    });
    if (svg.current) observer.observe(svg.current);
    return () => observer.disconnect();
  }, [zoom]);
  const viewHeight = (z: number) =>
    z === overview ? WORLD_HEIGHT : 1300 / z / aspect;
  const unitsPerPixel =
    1 /
    Math.max(
      1e-9,
      Math.min(pixelWidth / (1300 / zoom), pixelHeight / viewHeight(zoom)),
    );
  const visibleFriends = showFriends ? friends : [];
  const clamp = (p: Point, z: number) => ({
    x: Math.max(0, Math.min(WORLD_WIDTH - 1300 / z, p.x)),
    y: Math.max(0, Math.min(WORLD_HEIGHT - viewHeight(z), p.y)),
  });
  const resize = (
    value: number,
    point = { x: offset.x + 650 / zoom, y: offset.y + viewHeight(zoom) / 2 },
  ) => {
    const next = Math.max(overview, Math.min(4, value));
    setOffset(
      clamp(
        {
          x: point.x - ((point.x - offset.x) * zoom) / next,
          y:
            point.y -
            ((point.y - offset.y) / viewHeight(zoom)) * viewHeight(next),
        },
        next,
      ),
    );
    setZoom(next);
  };
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    ox: number;
    oy: number;
    units: number;
    moved: boolean;
    target: Element;
  } | null>(null);
  const suppressClick = useRef(false);
  const frame = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [sensitivity, setSensitivity] = useState(restored?.sensitivity ?? 1);
  useEffect(() => {
    try {
      localStorage.setItem(
        cameraKey,
        JSON.stringify({
          world: s.world,
          seed: s.worldSeed,
          x: offset.x,
          y: offset.y,
          zoom,
          sensitivity,
        }),
      );
    } catch {
      /* Private storage may be disabled. */
    }
  }, [cameraKey, s.world, s.worldSeed, offset.x, offset.y, zoom, sensitivity]);
  const cancelGesture = () => {
    const active = drag.current;
    drag.current = null;
    if (active) suppressClick.current = true;
    cancelAnimationFrame(frame.current);
    setDragging(false);
    if (active && svg.current?.hasPointerCapture(active.id))
      svg.current.releasePointerCapture(active.id);
  };
  useEffect(() => {
    const cancel = () => cancelGesture();
    const visibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("pointerup", cancel);
    document.addEventListener("visibilitychange", visibility);
    const dialogs = new MutationObserver(() => {
      if (
        drag.current &&
        document.querySelector('[role="dialog"],dialog[open]')
      )
        cancel();
    });
    dialogs.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pointerup", cancel);
      document.removeEventListener("visibilitychange", visibility);
      dialogs.disconnect();
      cancelAnimationFrame(frame.current);
      drag.current = null;
    };
  }, []);
  const wheelAction = useRef<(e: WheelEvent) => void>(() => {});
  wheelAction.current = (e) => {
    if (e.ctrlKey || e.metaKey || drag.current) return;
    e.preventDefault();
    const element = svg.current;
    const matrix = element?.getScreenCTM();
    if (!element || !matrix) return;
    const p = element.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const delta = wheelPixels(e.deltaY, e.deltaMode, pixelHeight);
    setFollowing(false);
    resize(
      zoom *
        Math.exp(-Math.max(-240, Math.min(240, delta)) * 0.002 * sensitivity),
      p.matrixTransform(matrix.inverse()),
    );
  };
  useEffect(() => {
    const element = svg.current;
    const wheel = (e: WheelEvent) => wheelAction.current(e);
    element?.addEventListener("wheel", wheel, { passive: false });
    return () => element?.removeEventListener("wheel", wheel);
  }, []);
  const center = (p: Point, z = zoom) => {
    setZoom(z);
    setOffset(clamp({ x: p.x - 650 / z, y: p.y - viewHeight(z) / 2 }, z));
  };
  const selectionPosition = vehicle
    ? vehiclePosition(vehicle, s.time)
    : (s.buildings.find((b) => b.id === selected)?.pos ??
      s.missions.find(
        (m) => m.id === selected && (!m.control || m.control.locationKnown),
      )?.pos);
  useEffect(() => {
    if (following && vehicle) center(vehiclePosition(vehicle, s.time));
  }, [following, vehicle?.id, s.time]);

  const results = search.trim()
    ? [
        ...s.buildings.map((b) => ({ id: b.id, name: b.name, pos: b.pos })),
        ...s.vehicles.map((v) => ({
          id: v.id,
          name: v.name,
          pos: vehiclePosition(v, s.time),
        })),
        ...s.missions
          .filter((m) => !m.control || m.control.locationKnown)
          .map((m) => ({ id: m.id, name: mt(m.template).name, pos: m.pos })),
        ...districts.map((d) => ({
          id: "place:" + d.name,
          name: d.name,
          pos: d,
        })),
      ]
        .filter((o) =>
          o.name
            .toLocaleLowerCase("de")
            .includes(search.toLocaleLowerCase("de")),
        )
        .slice(0, 8)
    : [];
  const visibleVehicles = useMemo(
    () =>
      s.vehicles.filter(
        (v) =>
          (org === "Alle" || bt(vt(v.type).home).org === org) &&
          (status === "Alle" ||
            (status === "Bereit"
              ? v.status === "ready"
              : status === "Unterwegs"
                ? ["travel", "return", "transport"].includes(v.status)
                : v.status === "scene")),
      ),
    [s.vehicles, org, status],
  );
  const chunkSize = 128 * unitsPerPixel;
  const chunkX = Math.floor(offset.x / chunkSize) * chunkSize,
    chunkY = Math.floor(offset.y / chunkSize) * chunkSize;
  const drawVehicles = useMemo(
    () =>
      visibleVehicles.filter((v) => {
        if (v.id === selected || v.mission === selected) return true;
        const p = vehiclePosition(v, s.time);
        return (
          p.x >= chunkX - chunkSize &&
          p.y >= chunkY - chunkSize &&
          p.x <= chunkX + 1300 / zoom + chunkSize * 2 &&
          p.y <= chunkY + viewHeight(zoom) + chunkSize * 2
        );
      }),
    [
      visibleVehicles,
      selected,
      s.time,
      chunkX,
      chunkY,
      chunkSize,
      zoom,
      aspect,
    ],
  );
  const expandGroup = useCallback((p: Point) => center(p, 1), [aspect]);
  const scaleMeters =
    zoom < 0.3 ? 20000 : zoom < 0.8 ? 5000 : zoom < 2 ? 2000 : 500;

  return (
    <div className="map-wrap">
      <div className="map-toolbar">
        <strong>Region {WORLD_NAME} · 100 × 100 km</strong>
        {readonly && (
          <span role="status">
            Verbindung fehlt · letzter bestätigter Stand
          </span>
        )}
        <select
          aria-label="Stadtviertel anzeigen"
          defaultValue=""
          onChange={(e) => {
            const d = districts.find((d) => d.name === e.target.value);
            if (d) {
              const town = towns.find((t) => t.name === d.name);
              const z = town ? 1 : 2;
              setZoom(z);
              setOffset(
                clamp(
                  {
                    x: d.x - 650 / z,
                    y: d.y - (town ? 110 * town.size : 0) - viewHeight(z) / 2,
                  },
                  z,
                ),
              );
            }
          }}
        >
          <option value="" disabled>
            Stadtviertel …
          </option>
          {districts.map((d) => (
            <option key={d.name}>{d.name}</option>
          ))}
        </select>
        <select
          aria-label="Kartenfilter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["Alle", "Einsätze", "Wachen", "Fahrzeuge"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <div className="map-search">
        <label>
          <Search size={16} />
          <input
            aria-label="Karte durchsuchen"
            placeholder="Einsatz, Funkrufname, Wache oder Ort …"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Organisation auf Karte"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
        >
          {[
            "Alle",
            "Feuerwehr",
            "Rettungsdienst",
            "Polizei",
            "THW",
            "Wasserrettung",
            "Infrastruktur",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          aria-label="Fahrzeugstatus auf Karte"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {["Alle", "Bereit", "Unterwegs", "Am Einsatzort"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        {(filter !== "Alle" ||
          org !== "Alle" ||
          status !== "Alle" ||
          search) && (
          <button
            onClick={() => {
              setFilter("Alle");
              setOrg("Alle");
              setStatus("Alle");
              setSearch("");
            }}
          >
            Filter zurücksetzen <X size={14} />
          </button>
        )}
        {search && (
          <div className="map-search-results">
            {results.length ? (
              results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    if (!r.id.startsWith("place:")) onSelect(r.id);
                    center(r.pos, 1);
                    setSearch("");
                    setFollowing(false);
                  }}
                >
                  {r.name}
                </button>
              ))
            ) : (
              <span>Keine sichtbaren Objekte gefunden.</span>
            )}
          </div>
        )}
      </div>
      <div className="map-layers" aria-label="Kartenebenen">
        <button
          onClick={() => {
            setZoom(overview);
            setOffset({ x: 0, y: 0 });
          }}
        >
          Gesamte Region
        </button>
        <button
          onClick={() => {
            const p = s.buildings[0]?.pos ?? WORLD_CENTER;
            setZoom(1);
            setOffset(clamp({ x: p.x - 650, y: p.y - viewHeight(1) / 2 }, 1));
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
        {vehicle && (
          <button
            aria-pressed={following}
            onClick={() => setFollowing(!following)}
          >
            <Navigation size={15} />{" "}
            {following ? "Folgen aktiv" : "Fahrzeug folgen"}
          </button>
        )}
        <button aria-pressed={labels} onClick={() => setLabels(!labels)}>
          Beschriftung
        </button>
        <button aria-pressed={routes} onClick={() => setRoutes(!routes)}>
          Fahrwege
        </button>
        {friends.length > 0 && (
          <button
            aria-pressed={showFriends}
            onClick={() => setShowFriends(!showFriends)}
          >
            Verbund
          </button>
        )}
      </div>
      <svg
        ref={svg}
        className={
          "map " + (placing ? "placing " : "") + (dragging ? "dragging" : "")
        }
        viewBox={`${offset.x} ${offset.y} ${1300 / zoom} ${viewHeight(zoom)}`}
        role="img"
        aria-label={`Interaktive Karte von ${WORLD_NAME}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (
            e.target !== e.currentTarget ||
            e.ctrlKey ||
            e.metaKey ||
            e.altKey
          )
            return;
          setFollowing(false);
          const directions: Record<string, Point> = {
            ArrowLeft: { x: -60, y: 0 },
            ArrowRight: { x: 60, y: 0 },
            ArrowUp: { x: 0, y: -60 },
            ArrowDown: { x: 0, y: 60 },
          };
          if (directions[e.key]) {
            e.preventDefault();
            const p = directions[e.key];
            setOffset(
              clamp(
                { x: offset.x + p.x / zoom, y: offset.y + p.y / zoom },
                zoom,
              ),
            );
          }
          if (e.key === "+" || e.key === "-") {
            e.preventDefault();
            resize(zoom + (e.key === "+" ? 0.25 : -0.25));
          }
          if (e.key === "Home") {
            e.preventDefault();
            resize(1);
          }
        }}
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={() => {
          if (drag.current) cancelGesture();
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || !e.isPrimary) return;
          e.preventDefault();
          cancelGesture();
          suppressClick.current = false;
          e.currentTarget.focus({ preventScroll: true });
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            ox: offset.x,
            oy: offset.y,
            units: unitsPerPixel,
            moved: false,
            target: e.target as Element,
          };
        }}
        onPointerMove={(e) => {
          const active = drag.current;
          if (!active || active.id !== e.pointerId) return;
          if (!(e.buttons & 1)) {
            cancelGesture();
            return;
          }
          const dx = e.clientX - active.x,
            dy = e.clientY - active.y;
          if (!active.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
          if (!active.moved) {
            active.moved = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
            setFollowing(false);
          }
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(() => {
            if (drag.current === active)
              setOffset(
                clamp(
                  {
                    x: active.ox - dx * active.units,
                    y: active.oy - dy * active.units,
                  },
                  zoom,
                ),
              );
          });
        }}
        onPointerUp={(e) => {
          const active = drag.current;
          if (!active || active.id !== e.pointerId) return;
          cancelAnimationFrame(frame.current);
          if (active.moved) {
            setOffset(
              clamp(
                {
                  x: active.ox - (e.clientX - active.x) * active.units,
                  y: active.oy - (e.clientY - active.y) * active.units,
                },
                zoom,
              ),
            );
          }
          drag.current = null;
          setDragging(false);
          suppressClick.current = active.moved;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          if (
            placing &&
            !active.moved &&
            !active.target.closest('[role="button"]')
          ) {
            const p = e.currentTarget.createSVGPoint();
            p.x = e.clientX;
            p.y = e.clientY;
            const matrix = e.currentTarget.getScreenCTM();
            if (!matrix) return;
            const pos = p.matrixTransform(matrix.inverse());
            if (
              pos.x >= 0 &&
              pos.y >= 0 &&
              pos.x <= WORLD_WIDTH &&
              pos.y <= WORLD_HEIGHT
            )
              setCandidate({ x: pos.x, y: pos.y });
          }
        }}
      >
        <MapTerrain
          labels={labels}
          zoom={zoom}
          x={chunkX - chunkSize * 0.25}
          y={chunkY - chunkSize * 0.25}
          width={1300 / zoom + chunkSize * 1.5}
          height={viewHeight(zoom) + chunkSize * 1.5}
          unitsPerPixel={
            1 /
            Math.min(pixelWidth / (1300 / zoom), pixelHeight / viewHeight(zoom))
          }
        />
        <rect
          x={0}
          y={0}
          width={WORLD_WIDTH}
          height={WORLD_HEIGHT}
          fill="none"
          stroke="#637d88"
          strokeWidth={2 / zoom}
          strokeDasharray={`${8 / zoom} ${5 / zoom}`}
          pointerEvents="none"
        />
        {placing && candidate && (
          <circle
            cx={nodes[nearest(candidate)].x}
            cy={nodes[nearest(candidate)].y}
            r={20 / zoom}
            fill="#72dac844"
            stroke="#72dac8"
            strokeWidth={2 / zoom}
          />
        )}
        {routes &&
          s.environment?.roads.map((e) => (
            <g key={e.id} pointerEvents="none">
              <line
                x1={nodes[e.edge[0]]?.x}
                y1={nodes[e.edge[0]]?.y}
                x2={nodes[e.edge[1]]?.x}
                y2={nodes[e.edge[1]]?.y}
                stroke={e.blocked ? "#ee7770" : "#ebb45e"}
                strokeWidth={5 / zoom}
                strokeDasharray="5 3"
              />
              <title>{roadNames[e.kind]}</title>
            </g>
          ))}
        <g transform={`translate(${publicHospital.x},${publicHospital.y})`}>
          <rect x="-13" y="-13" width="26" height="26" rx="6" fill="#5cd4b0" />
          <text textAnchor="middle" y="6" fontSize="20" fill="#10392e">
            +
          </text>
          <title>Öffentliches Klinikum · 100 Behandlungsplätze</title>
        </g>
        {docks.map((p, i) => (
          <g key={i} transform={`translate(${p.x},${p.y})`}>
            <circle r="12" fill="#265974" />
            <text textAnchor="middle" y="5" fill="#a5d8f5">
              <Anchor x={-7} y={-8} width={14} height={14} />
            </text>
            <title>Wasserzugang und Bauplatz</title>
          </g>
        ))}
        {(filter === "Alle" || filter === "Wachen") &&
          s.buildings
            .filter((b) => org === "Alle" || bt(b.type).org === org)
            .map((b) => (
              <g
                key={b.id}
                transform={`translate(${b.pos.x},${b.pos.y}) scale(${unitsPerPixel})`}
                className="map-marker"
                role="button"
                tabIndex={0}
                data-own-station
                aria-label={b.name}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(b.id);
                }}
                onKeyDown={(e) => e.key === "Enter" && onSelect(b.id)}
              >
                <rect
                  x="-15"
                  y="-15"
                  width="30"
                  height="30"
                  rx="7"
                  fill={bt(b.type).org === "Feuerwehr" ? "#e77658" : "#63afc9"}
                  stroke={selected === b.id ? "#fff" : "#15242b"}
                  strokeWidth="3"
                />
                <text
                  textAnchor="middle"
                  y="6"
                  fontWeight="800"
                  fontSize="18"
                  fill="#101c26"
                >
                  {b.type === "fire"
                    ? "F"
                    : b.type === "police"
                      ? "P"
                      : b.type === "thw"
                        ? "T"
                        : "R"}
                </text>
                <title>{b.name} · Eigene Wache</title>
              </g>
            ))}
        {(filter === "Alle" || filter === "Wachen") &&
          visibleFriends.flatMap((f, fi) =>
            f.buildings.map((b) => (
              <g
                key={f.id + b.id}
                transform={`translate(${b.pos.x + 10 + (fi % 3) * 6},${b.pos.y - 12})`}
                role="button"
                tabIndex={0}
                aria-label={`${b.name} von ${f.name}`}
                className="map-marker"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect("friends");
                }}
                onKeyDown={(e) => e.key === "Enter" && onSelect("friends")}
              >
                <rect
                  x="-10"
                  y="-10"
                  width="20"
                  height="20"
                  rx="4"
                  fill={playerColor(f.id)}
                  stroke="#e7d7ff"
                  strokeDasharray="3 2"
                />
                <title>
                  {b.name} · {f.name} · {f.status}
                </title>
              </g>
            )),
          )}
        {(filter === "Alle" || filter === "Fahrzeuge") &&
          (org === "Alle" || org === "Feuerwehr") &&
          volunteerMarkers(s)
            .filter(
              (a) =>
                a.pos.x >= offset.x - chunkSize &&
                a.pos.y >= offset.y - chunkSize &&
                a.pos.x <= offset.x + 1300 / zoom + chunkSize &&
                a.pos.y <= offset.y + viewHeight(zoom) + chunkSize,
            )
            .map((a) => (
              <g
                key={a.id}
                data-testid="map-volunteer"
                transform={`translate(${a.pos.x},${a.pos.y}) scale(${unitsPerPixel})`}
                role="button"
                tabIndex={0}
                aria-label={a.name}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(a.home);
                }}
                onKeyDown={(e) => e.key === "Enter" && onSelect(a.home)}
              >
                <circle r={7} fill="#916317" stroke="#ffe1a0" strokeWidth={2} />
                <circle r={2} fill="#fff5d7" />
                <title>{a.name}</title>
              </g>
            ))}
        {(filter === "Alle" || filter === "Einsätze") &&
          s.missions
            .filter(
              (m) =>
                (!m.control || m.control.locationKnown) &&
                (org === "Alle" || mt(m.template).org === org),
            )
            .map((m) => (
              <g
                key={m.id}
                transform={`translate(${m.pos.x},${m.pos.y}) scale(${unitsPerPixel})`}
                className="map-marker"
                role="button"
                tabIndex={0}
                aria-label={mt(m.template).name}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(m.id);
                }}
                onKeyDown={(e) => e.key === "Enter" && onSelect(m.id)}
              >
                <circle
                  r={selected === m.id ? 23 : 18}
                  fill={
                    mt(m.template).org === "Feuerwehr"
                      ? "#ba4236"
                      : mt(m.template).org === "Polizei"
                        ? "#2c73a0"
                        : "#269161"
                  }
                  stroke={selected === m.id ? "#fff" : "#17222d"}
                  strokeWidth="3"
                />
                <g transform="translate(-12,-12)" color="white">
                  <IncidentIcon org={mt(m.template).org} />
                </g>
                <title>
                  {mt(m.template).name}
                  {m.shared ? " · Gemeinsam" : ""}
                </title>
              </g>
            ))}
        {(filter === "Alle" || filter === "Einsätze") &&
          visibleFriends.flatMap((f, fi) =>
            f.missions.map((m) => (
              <g
                key={f.id + m.id}
                transform={`translate(${m.pos.x + 12 + (fi % 3) * 6},${m.pos.y - 12})`}
                className="map-marker"
                role="button"
                tabIndex={0}
                aria-label={`Gemeinsam: ${mt(m.template).name} von ${f.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect("friends");
                }}
                onKeyDown={(e) => e.key === "Enter" && onSelect("friends")}
              >
                <circle
                  r="15"
                  fill={playerColor(f.id)}
                  stroke="#ebdcff"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                />
                <text textAnchor="middle" y="5" fill="#241932" fontWeight="800">
                  V
                </text>
                <title>
                  {mt(m.template).name} · {f.name} · {f.status}
                </title>
              </g>
            )),
          )}
        {(filter === "Alle" || filter === "Fahrzeuge") && (
          <VehicleMarkers
            vehicles={drawVehicles}
            time={s.time}
            routes={routes}
            selected={selected}
            onSelect={onSelect}
            onExpand={expandGroup}
            zoom={zoom}
            unitsPerPixel={unitsPerPixel}
          />
        )}
        {(filter === "Alle" || filter === "Fahrzeuge") &&
          visibleFriends.flatMap((f) =>
            f.vehicles
              .filter((v) => v.status !== "ready")
              .map((v) => (
                <g key={f.id + v.id}>
                  {routes && selected === v.id && (
                    <polyline
                      points={v.path.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="#c2a7ec"
                      strokeWidth="2"
                      opacity=".5"
                      strokeDasharray="3 6"
                    />
                  )}
                  <rect
                    x={v.position.x + 3}
                    y={v.position.y - 9}
                    width="16"
                    height="11"
                    rx="3"
                    fill="#c9b4e8"
                  >
                    <title>
                      {v.name} · {f.name} · {tripLabel(v, v.arrive - v.eta)} ·{" "}
                      {f.status}
                    </title>
                  </rect>
                </g>
              )),
          )}
      </svg>
      <details className="map-control-help">
        <summary>Kartensteuerung</summary>
        <p>
          Ziehen: Karte verschieben · Klick: auswählen · Mausrad: Zoom zum
          Zeiger. Pfeiltasten und +/− bei fokussierter Karte. Strg+Mausrad
          vergrößert den Browser. Ziehen beendet das Fahrzeugfolgen.
        </p>
        <label>
          Zoomempfindlichkeit{" "}
          <input
            aria-label="Zoomempfindlichkeit"
            type="range"
            min="0.3"
            max="2"
            step="0.1"
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
          />
        </label>
      </details>
      <div className="map-zoom" aria-label="Zoomsteuerung">
        <button aria-label="Vergrößern" onClick={() => resize(zoom + 0.25)}>
          +
        </button>
        <button aria-label="Verkleinern" onClick={() => resize(zoom - 0.25)}>
          −
        </button>
        <button
          aria-label="Karte zentrieren"
          onClick={() => {
            setZoom(1);
            setOffset({ x: 0, y: 0 });
          }}
        >
          <LocateFixed size={18} />
        </button>
      </div>
      {vehicle && (
        <div className="map-vehicle-detail" aria-label="Ausgewähltes Fahrzeug">
          <strong>{vehicle.name}</strong>
          <span>
            {bt(vt(vehicle.type).home).org} · FMS{" "}
            {s.desk.fleet[vehicle.id]?.code ?? "–"}
          </span>
          <span>
            {motion?.kmh.toFixed(0)} km/h aktuell · Abschnitt{" "}
            {section?.limit ?? "–"} · Fahrzeug maximal {vt(vehicle.type).speed}{" "}
            km/h
          </span>
          <span>
            Ziel:{" "}
            {vehicle.status === "return"
              ? s.buildings.find((b) => b.id === vehicle.home)?.name
              : vehicle.mission
                ? s.missions.find((m) => m.id === vehicle.mission)?.control
                    ?.briefed
                  ? mt(
                      s.missions.find((m) => m.id === vehicle.mission)!
                        .template,
                    ).name
                  : "Zugewiesener Einsatz"
                : vehicle.destination
                  ? "Patientenaufnahme"
                  : "Wache"}
          </span>
          <span>{tripLabel(vehicle, s.time)}</span>
          <span>
            {vehicle.journey?.reason || section?.name || "An der Wache"}
          </span>
        </div>
      )}
      <div className="map-legend">
        <span>▣ Eigene Wache</span>
        {friends.length > 0 && <span>◌ Verbund</span>}
        <span>! Einsatz</span>
        <span>＋ Klinikum</span>
        <span>Fiktive Region · Tempolimits nach Weltregeln</span>
        <span>
          {Math.round(zoom * 100)} % · Ausschnitt{" "}
          {(15.6 / zoom).toLocaleString("de-DE", { maximumFractionDigits: 1 })}{" "}
          km breit
        </span>
      </div>
      <div className="map-scale" aria-label="Kartenmaßstab">
        <span
          className="map-scale-line"
          style={{
            width:
              (scaleMeters / METERS_PER_UNIT) *
              Math.min(
                pixelWidth / (1300 / zoom),
                pixelHeight / viewHeight(zoom),
              ),
          }}
        />
        <span>{scaleMeters / 1000} km</span>
      </div>
      <Operations s={s} />
      {placing && (
        <div className="placement-hint">
          <button
            onClick={() => {
              setCandidate(null);
              onCancelPlace?.();
            }}
          >
            Bau abbrechen
          </button>
          {candidate ? (
            <>
              <span>
                Vorschau: Straßenanbindung{" "}
                {Math.round(
                  distance(candidate, nodes[nearest(candidate)]) *
                    METERS_PER_UNIT,
                )}{" "}
                m · Bestätigung kauft den gewählten Gebäudetyp.
              </span>
              <span>{buildReason(s, placing, candidate)}</span>
              <button
                disabled={readonly || !!buildReason(s, placing, candidate)}
                onClick={() => {
                  const p = candidate;
                  setCandidate(null);
                  onPlace(p);
                }}
              >
                Bau bestätigen
              </button>
              <button onClick={() => setCandidate(null)}>
                Position verwerfen
              </button>
            </>
          ) : (
            "Bauplatz wählen · anschließend Vorschau bestätigen"
          )}
        </div>
      )}
    </div>
  );
});
