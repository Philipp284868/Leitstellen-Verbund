import { Truck } from "lucide-react";
import { vt, bt } from "./catalog";
import { tripLabel } from "./travel";
import { memo, useEffect, useRef } from "react";
import { vehiclePosition } from "./vehicle-position";
import type { Vehicle } from "./model";
export const VehicleMarkers = memo(function VehicleMarkers({
  vehicles,
  time,
  routes = true,
  selected = "",
  onSelect,
  onExpand,
  zoom = 1,
  unitsPerPixel = 1,
}: {
  vehicles: Vehicle[];
  time: number;
  routes?: boolean;
  selected?: string;
  onSelect?: (id: string) => void;
  onExpand?: (p: { x: number; y: number }) => void;
  zoom?: number;
  unitsPerPixel?: number;
}) {
  const positions = new Map(
    vehicles.map((v) => [v.id, vehiclePosition(v, time)]),
  );
  const groups = new Map<string, typeof vehicles>();
  for (const v of vehicles) {
    const p = positions.get(v.id)!,
      key =
        zoom >= 0.7 || v.id === selected
          ? v.id
          : `${Math.floor(p.x / (30 * unitsPerPixel))}:${Math.floor(p.y / (30 * unitsPerPixel))}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }
  const markers = [...groups.values()];
  const elements = useRef(new Map<string, SVGGElement>());
  useEffect(() => {
    if (
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.querySelector(".app.reduced")
    )
      return;
    const started = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const at = time + Math.min(2, (now - started) / 1000);
      for (const v of vehicles) {
        if (!["travel", "return", "transport"].includes(v.status)) continue;
        const p = vehiclePosition(v, at);
        elements.current
          .get(v.id)
          ?.setAttribute("transform", `translate(${p.x},${p.y})`);
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [vehicles, time]);
  return (
    <>
      {markers.map((group) => {
        const v = group[0];
        const p = vehiclePosition(v, time);
        return (
          <g key={v.id}>
            {routes && (v.id === selected || v.mission === selected) && (
              <polyline
                pointerEvents="none"
                points={v.path.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={
                  bt(vt(v.type).home).org === "Feuerwehr"
                    ? "#f06a52"
                    : "#6cc7f5"
                }
                strokeWidth="3"
                opacity=".95"
                vectorEffect="non-scaling-stroke"
                strokeDasharray="5 5"
              />
            )}
            <g
              role="button"
              tabIndex={0}
              aria-label={v.name}
              onClick={(e) => {
                e.stopPropagation();
                if (group.length > 1) onExpand?.(p);
                else onSelect?.(v.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  if (group.length > 1) onExpand?.(p);
                  else onSelect?.(v.id);
              }}
              ref={(node) => {
                if (node) elements.current.set(v.id, node);
                else elements.current.delete(v.id);
              }}
              transform={`translate(${p.x},${p.y})`}
            >
              <g transform={`scale(${unitsPerPixel})`}>
                <rect
                  x="-13"
                  y="-13"
                  width="26"
                  height="26"
                  rx="5"
                  fill={
                    v.fault && v.fault.state !== "repaired"
                      ? "#b97a2b"
                      : bt(vt(v.type).home).org === "Feuerwehr"
                        ? "#9d3c31"
                        : "#285c7e"
                  }
                  stroke={v.id === selected ? "#fff" : "#c4d5dd"}
                  strokeWidth="2"
                />
                <Truck x={-10} y={-10} width={20} height={20} color="white" />
                {(v.id === selected || v.mission === selected) && (
                  <g>
                    <rect
                      x="15"
                      y="-11"
                      width={Math.min(150, v.name.length * 6 + 12)}
                      height="22"
                      rx="3"
                      fill="#091822ed"
                    />
                    <text x="21" y="4" fontSize="11" fill="#eef3f5">
                      {v.name.slice(0, 23)}
                    </text>
                  </g>
                )}
              </g>
              {group.length > 1 && (
                <text
                  y={-10 * unitsPerPixel}
                  textAnchor="middle"
                  fontSize={12 * unitsPerPixel}
                  fill="#e6fbfc"
                >
                  {group.length}
                </text>
              )}
              <title>
                {group.length > 1
                  ? `${group.length} Fahrzeuge · zum Auflösen vergrößern`
                  : v.name}{" "}
                · {tripLabel(v, time)}
              </title>
            </g>
          </g>
        );
      })}
    </>
  );
});
