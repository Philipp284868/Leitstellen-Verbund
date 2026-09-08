import { memo } from "react";
import { MapTerrain } from "./MapTerrain";
import type { Save } from "./model";
import { IncidentIcon } from "./HudIcons";
import { bt, mt } from "./catalog";
/** Same world geometry as the interactive map, composed for the menu. */
export const RegionScene = memo(function RegionScene({
  save,
  miniature = false,
}: {
  save: Save;
  miniature?: boolean;
}) {
  return (
    <svg
      className={`region-scene ${miniature ? "miniature" : ""}`}
      viewBox="30 0 1280 850"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <MapTerrain
        labels={!miniature}
        zoom={1}
        x={0}
        y={0}
        width={1400}
        height={900}
        unitsPerPixel={1}
      />
      {!miniature &&
        save.buildings.map((b) => (
          <g key={b.id} transform={`translate(${b.pos.x},${b.pos.y})`}>
            <circle
              r="14"
              fill={bt(b.type).org === "Feuerwehr" ? "#b62f26" : "#196fa8"}
              stroke="#e6e7de"
              strokeWidth="2"
            />
            <path
              d="M-6 6V-5H6V6M-3-2V1M3-2V1"
              stroke="white"
              strokeWidth="2"
              fill="none"
            />
          </g>
        ))}
      {!miniature &&
        save.missions
          .filter((m) => m.control?.locationKnown)
          .map((m) => (
            <g key={m.id} transform={`translate(${m.pos.x},${m.pos.y})`}>
              <circle r="25" fill="#e1472b" opacity=".13" />
              <circle r="12" fill="#b32d25" stroke="#fff0df" strokeWidth="2" />
              <g transform="translate(-8,-8) scale(.67)" color="white">
                <IncidentIcon org={mt(m.template).org} />
              </g>
            </g>
          ))}
    </svg>
  );
});
