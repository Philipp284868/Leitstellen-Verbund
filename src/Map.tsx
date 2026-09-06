import { memo, useRef, useState } from "react";
import {
  nodes,
  edges,
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
    [offset, setOffset] = useState({ x: 0, y: 0 }),
    [filter, setFilter] = useState("Alle");
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  const moved = useRef(false);
  return (
    <div className="map-wrap">
      <div className="map-toolbar">
        <span className="live-dot" />
        <strong>Region Falkenried</strong>
        <span className="muted">Lokale Karte · 12 × 8 km</span>
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
      <svg
        className={"map " + (placing ? "placing" : "")}
        viewBox={`${offset.x} ${offset.y} ${1300 / zoom} ${850 / zoom}`}
        role="img"
        aria-label="Interaktive Karte von Falkenried"
        onWheel={(e) =>
          setZoom((z) =>
            Math.max(1, Math.min(3, z + (e.deltaY < 0 ? 0.2 : -0.2))),
          )
        }
        onPointerDown={(e) => {
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            ox: offset.x,
            oy: offset.y,
          };
          moved.current = false;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            const dx = e.clientX - drag.current.x,
              dy = e.clientY - drag.current.y;
            if (Math.abs(dx) + Math.abs(dy) > 5) moved.current = true;
            setOffset({
              x: drag.current.ox - (dx * 1.5) / zoom,
              y: drag.current.oy - (dy * 1.5) / zoom,
            });
          }
        }}
        onPointerUp={(e) => {
          drag.current = null;
          if (placing && !moved.current) {
            const p = e.currentTarget.createSVGPoint();
            p.x = e.clientX;
            p.y = e.clientY;
            const pos = p.matrixTransform(
              e.currentTarget.getScreenCTM()!.inverse(),
            );
            onPlace({
              x: Math.max(0, Math.min(1300, pos.x)),
              y: Math.max(0, Math.min(850, pos.y)),
            });
          }
        }}
      >
        <defs>
          <pattern
            id="blocks"
            width="95"
            height="85"
            patternUnits="userSpaceOnUse"
            x="60"
            y="65"
          >
            <rect x="15" y="16" width="24" height="20" rx="3" fill="#263e40" />
            <rect x="47" y="16" width="29" height="20" rx="3" fill="#2c4144" />
            <rect x="15" y="46" width="18" height="22" rx="3" fill="#30474a" />
            <rect x="41" y="46" width="34" height="22" rx="3" fill="#263c40" />
          </pattern>
          <pattern
            id="forest"
            width="25"
            height="25"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="12" cy="12" r="8" fill="#22483e" />
          </pattern>
        </defs>
        <rect width="1300" height="850" fill="#172c2e" />
        <rect x="60" y="65" width="880" height="700" fill="url(#blocks)" />
        <path d="M930 0H1300V340L1160 300 1040 210 910 240Z" fill="#1a3d33" />
        <path
          d="M960 0H1300V290L1160 270 1040 180 940 220Z"
          fill="url(#forest)"
        />
        <path
          d="M1000 330Q1090 260 1170 345T1240 650Q1170 790 1070 710T1000 330"
          fill="#183e53"
        />
        <path
          d="M1040 0Q960 120 1000 290T1040 500Q970 690 1080 850"
          fill="none"
          stroke="#245267"
          strokeWidth="30"
        />
        <g stroke="#354d50" strokeWidth="12" strokeLinecap="round">
          {edges.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={nodes[a].x}
              y1={nodes[a].y}
              x2={nodes[b].x}
              y2={nodes[b].y}
            />
          ))}
        </g>
        <g stroke="#77918c" strokeWidth="2" opacity=".35">
          {edges.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={nodes[a].x}
              y1={nodes[a].y}
              x2={nodes[b].x}
              y2={nodes[b].y}
            />
          ))}
        </g>
        <path
          d="M0 320H920L1300 740"
          stroke="#8d855e"
          strokeWidth="14"
          fill="none"
        />
        <path
          d="M0 320H920L1300 740"
          stroke="#c8b882"
          strokeWidth="1.5"
          strokeDasharray="15 9"
          fill="none"
        />
        <g fill="#496465" fontSize="16" letterSpacing="4" fontWeight="700">
          {districts.map((d) => (
            <text key={d.name} x={d.x} y={d.y} textAnchor="middle">
              {d.name}
            </text>
          ))}
        </g>
        <text
          x="1140"
          y="480"
          fill="#699aaf"
          fontSize="17"
          transform="rotate(-16 1140 480)"
        >
          Falkensee
        </text>
        <g>
          <rect x="708" y="370" width="50" height="30" rx="3" fill="#496073" />
          <text
            x="735"
            y="392"
            textAnchor="middle"
            fill="#b7c4c8"
            fontSize="12"
          >
            WERK
          </text>
          <rect x="420" y="210" width="43" height="30" rx="3" fill="#6b6652" />
          <text
            x="440"
            y="232"
            textAnchor="middle"
            fill="#dacaa1"
            fontSize="11"
          >
            RATHAUS
          </text>
        </g>
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
          friends.flatMap((f, fi) =>
            f.buildings.map((b) => (
              <g
                key={f.id + b.id}
                transform={`translate(${b.pos.x + 16 * (fi + 1)},${b.pos.y - 16 * (fi + 1)})`}
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
          s.missions.map((m) => (
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
          friends.flatMap((f, fi) =>
            f.missions.map((m) => (
              <g
                key={f.id + m.id}
                transform={`translate(${m.pos.x + 20 * (fi + 1)},${m.pos.y - 20 * (fi + 1)})`}
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
          <VehicleMarkers vehicles={s.vehicles} time={s.time} speed={s.speed} />
        )}
        {(filter === "Alle" || filter === "Fahrzeuge") &&
          friends.flatMap((f) =>
            f.vehicles
              .filter((v) => v.status !== "ready")
              .map((v) => (
                <g key={f.id + v.id}>
                  <polyline
                    points={v.path.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke="#c2a7ec"
                    strokeWidth="2"
                    opacity=".5"
                    strokeDasharray="3 6"
                  />
                  <rect
                    x={v.position.x + 3}
                    y={v.position.y - 9}
                    width="16"
                    height="11"
                    rx="3"
                    fill="#c9b4e8"
                  >
                    <title>
                      {v.name} · {f.name} · {v.eta} s · {f.status}
                    </title>
                  </rect>
                </g>
              )),
          )}
      </svg>
      <div className="map-zoom">
        <button
          aria-label="Vergrößern"
          onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
        >
          +
        </button>
        <button
          aria-label="Verkleinern"
          onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
        >
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
        <span>◌ Freunde</span>
        <span>◆ Einsatz</span>
        <span>＋ Klinikum</span>
      </div>
      {placing && (
        <div className="placement-hint">
          Bauplatz wählen · Klick auf eine Straßenkreuzung
        </div>
      )}
    </div>
  );
});
