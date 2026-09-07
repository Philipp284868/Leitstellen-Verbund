import { tripLabel } from "./travel";
import { memo, useEffect, useRef } from "react";
import { along } from "./world";
import type { Vehicle } from "./model";
export const VehicleMarkers = memo(function VehicleMarkers({
  vehicles,
  time,
  routes = true,
}: {
  vehicles: Vehicle[];
  time: number;
  routes?: boolean;
}) {
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
        const p = along(v.path, (at - v.depart) / (v.arrive - v.depart));
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
      {vehicles
        .filter((v) => v.status !== "ready")
        .map((v) => {
          const p = along(v.path, (time - v.depart) / (v.arrive - v.depart));
          return (
            <g key={v.id}>
              {routes && (
                <polyline
                  points={v.path.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="#80dacf"
                  strokeWidth="3"
                  opacity=".6"
                  strokeDasharray="5 5"
                />
              )}
              <g
                ref={(node) => {
                  if (node) elements.current.set(v.id, node);
                  else elements.current.delete(v.id);
                }}
                transform={`translate(${p.x},${p.y})`}
              >
                <rect
                  x="-9"
                  y="-6"
                  width="18"
                  height="12"
                  rx="3"
                  fill={
                    v.fault && v.fault.state !== "repaired"
                      ? "#ff967f"
                      : "#d9ffff"
                  }
                  stroke="#25aab8"
                  strokeWidth="2"
                />
                <title>
                  {v.name} · {tripLabel(v, time)}
                </title>
              </g>
            </g>
          );
        })}
    </>
  );
});
