import { tripLabel } from "./travel";
import { towns } from "./region";
import { Operations } from "./Operations";
import { roadNames } from "./simulation/weather";
import { nodes } from "./world";
import { MapTerrain } from "./MapTerrain";
import { memo, useEffect, useRef, useState } from "react";
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
}: {
  s: Save;
  selected: string;
  onSelect: (id: string) => void;
  placing: boolean;
  onPlace: (p: Point) => void;
  friends: Friend[];
}) {
  const [zoom, setZoom] = useState(1),
    [offset, setOffset] = useState(() => ({
      x: Math.max(
        0,
        Math.min(WORLD_WIDTH - 1300, (s.buildings[0]?.pos.x ?? 650) - 650),
      ),
      y: Math.max(
        0,
        Math.min(WORLD_HEIGHT - 850, (s.buildings[0]?.pos.y ?? 425) - 425),
      ),
    })),
    [filter, setFilter] = useState("Alle"),
    [labels, setLabels] = useState(true),
    [routes, setRoutes] = useState(true),
    [showFriends, setShowFriends] = useState(true);
  const svg = useRef<SVGSVGElement>(null);
  const [aspect, setAspect] = useState(1300 / 850);
  const previousAspect = useRef(1300 / 850);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const next =
        entry.contentRect.width / Math.max(1, entry.contentRect.height);
      const old = previousAspect.current;
      previousAspect.current = next;
      setAspect(next);
      if (zoom !== 0.25)
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
    z === 0.25 ? WORLD_HEIGHT : 1300 / z / aspect;
  const visibleFriends = showFriends ? friends : [];
  const clamp = (p: Point, z: number) => ({
    x: Math.max(0, Math.min(WORLD_WIDTH - 1300 / z, p.x)),
    y: Math.max(0, Math.min(WORLD_HEIGHT - viewHeight(z), p.y)),
  });
  const resize = (
    value: number,
    point = { x: offset.x + 650 / zoom, y: offset.y + viewHeight(zoom) / 2 },
  ) => {
    const next = Math.max(0.25, Math.min(4, value));
    setOffset(
      clamp(
        {
          x: point.x - ((point.x - offset.x) * zoom) / next,
          y: point.y - ((point.y - offset.y) * zoom) / next,
        },
        next,
      ),
    );
    setZoom(next);
  };
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  const moved = useRef(false);
  return (
    <div className="map-wrap">
      <div className="map-toolbar">
        <strong>Region Falkenried · 62,4 × 40,8 km</strong>
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
      <div className="map-layers" aria-label="Kartenebenen">
        <button
          onClick={() => {
            setZoom(0.25);
            setOffset({ x: 0, y: 0 });
          }}
        >
          Gesamte Region
        </button>
        <button
          onClick={() => {
            const p = s.buildings[0]?.pos ?? { x: 650, y: 425 };
            setZoom(1);
            setOffset(clamp({ x: p.x - 650, y: p.y - viewHeight(1) / 2 }, 1));
          }}
        >
          Meine Wachen
        </button>

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
        className={"map " + (placing ? "placing" : "")}
        viewBox={`${offset.x} ${offset.y} ${1300 / zoom} ${viewHeight(zoom)}`}
        role="img"
        aria-label="Interaktive Karte von Falkenried"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
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
        onWheel={(e) => {
          const p = e.currentTarget.createSVGPoint();
          p.x = e.clientX;
          p.y = e.clientY;
          const at = p.matrixTransform(
            e.currentTarget.getScreenCTM()!.inverse(),
          );
          resize(zoom + (e.deltaY < 0 ? 0.2 : -0.2), at);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerDown={(e) => {
          if ((e.target as Element).closest("[role=button]")) return;
          const p = e.currentTarget.createSVGPoint();
          p.x = e.clientX;
          p.y = e.clientY;
          const at = p.matrixTransform(
            e.currentTarget.getScreenCTM()!.inverse(),
          );
          drag.current = {
            x: at.x,
            y: at.y,
            ox: offset.x,
            oy: offset.y,
          };
          moved.current = false;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            const p = e.currentTarget.createSVGPoint();
            p.x = e.clientX;
            p.y = e.clientY;
            const at = p.matrixTransform(
              e.currentTarget.getScreenCTM()!.inverse(),
            );
            const dx = at.x - drag.current.x,
              dy = at.y - drag.current.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
            setOffset(clamp({ x: offset.x - dx, y: offset.y - dy }, zoom));
          }
        }}
        onPointerUp={(e) => {
          drag.current = null;
          if (
            placing &&
            !moved.current &&
            !(e.target as Element).closest("[role=button]")
          ) {
            const p = e.currentTarget.createSVGPoint();
            p.x = e.clientX;
            p.y = e.clientY;
            const pos = p.matrixTransform(
              e.currentTarget.getScreenCTM()!.inverse(),
            );
            onPlace({
              x: Math.max(0, Math.min(WORLD_WIDTH, pos.x)),
              y: Math.max(0, Math.min(WORLD_HEIGHT, pos.y)),
            });
          }
        }}
      >
        <MapTerrain labels={labels} zoom={zoom} />
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
              ⚓
            </text>
            <title>Wasserzugang und Bauplatz</title>
          </g>
        ))}
        {(filter === "Alle" || filter === "Wachen") &&
          s.buildings.map((b) => (
            <g
              key={b.id}
              transform={`translate(${b.pos.x},${b.pos.y})`}
              className="map-marker"
              role="button"
              tabIndex={0}
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
        {(filter === "Alle" || filter === "Einsätze") &&
          s.missions
            .filter((m) => !m.control || m.control.locationKnown)
            .map((m) => (
              <g
                key={m.id}
                transform={`translate(${m.pos.x},${m.pos.y})`}
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
                  fill="#f7b764"
                  stroke={selected === m.id ? "#fff" : "#17222d"}
                  strokeWidth="3"
                />
                <text
                  textAnchor="middle"
                  y="7"
                  fontSize="23"
                  fontWeight="900"
                  fill="#3d2b1d"
                >
                  !
                </text>
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
          <VehicleMarkers vehicles={s.vehicles} time={s.time} routes={routes} />
        )}
        {(filter === "Alle" || filter === "Fahrzeuge") &&
          visibleFriends.flatMap((f) =>
            f.vehicles
              .filter((v) => v.status !== "ready")
              .map((v) => (
                <g key={f.id + v.id}>
                  {routes && (
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
      <div className="map-zoom">
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
          ⌖
        </button>
      </div>
      <div className="map-legend">
        <span>● Eigene Wache</span>
        {friends.length > 0 && <span>◌ Verbund</span>}
        <span>! Einsatz</span>
        <span>＋ Klinikum</span>
        <span>
          {Math.round(zoom * 100)} % · Ausschnitt{" "}
          {(15.6 / zoom).toLocaleString("de-DE", { maximumFractionDigits: 1 })}{" "}
          km breit
        </span>
      </div>
      <Operations s={s} />
      {placing && (
        <div className="placement-hint">
          Bauplatz wählen · Klick auf eine Straßenkreuzung
        </div>
      )}
    </div>
  );
});
