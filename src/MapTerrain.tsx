import { memo } from "react";
import { nodes, edges, districts } from "./world";
/** Decorative terrain follows the existing street graph; existing locations remain valid. */
export const MapTerrain = memo(function MapTerrain({
  labels,
}: {
  labels: boolean;
}) {
  return (
    <g className="map-terrain" pointerEvents="none">
      <defs>
        <pattern
          id="terrain-grid"
          width="95"
          height="85"
          patternUnits="userSpaceOnUse"
          x="60"
          y="65"
        >
          <path
            d="M95 0H0V85"
            fill="none"
            stroke="var(--map-grid)"
            strokeWidth=".8"
          />
        </pattern>
        <pattern
          id="terrain-forest"
          width="29"
          height="31"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="9" cy="10" r="7" fill="var(--map-tree)" />
          <circle cx="23" cy="25" r="5" fill="var(--map-tree)" opacity=".7" />
        </pattern>
      </defs>
      <rect width="1300" height="850" fill="var(--map-land)" />
      <path
        d="M0 0H620L540 170 190 220 0 150Z M0 520L190 470 340 620 240 850H0Z"
        fill="var(--map-park)"
      />
      <path d="M850 0H1300V310L1200 340 980 245Z" fill="var(--map-park)" />
      <path d="M850 0H1300V310L1200 340 980 245Z" fill="url(#terrain-forest)" />
      <rect x="65" y="66" width="1140" height="680" fill="url(#terrain-grid)" />
      {nodes
        .filter((p, i) => i % 13 < 12 && i < 104 && p.x < 1000)
        .map((p, i) => {
          const park = i % 13 === 4;
          return (
            <g
              key={`${p.x}-${p.y}`}
              transform={`translate(${p.x + 12},${p.y + 13})`}
            >
              {park ? (
                <>
                  <rect width="70" height="58" rx="10" fill="var(--map-park)" />
                  <path
                    d="M8 48L60 10"
                    stroke="var(--map-grid)"
                    strokeWidth="3"
                  />
                  {[14, 32, 52].map((x) => (
                    <circle
                      key={x}
                      cx={x}
                      cy={(x % 23) + 12}
                      r="8"
                      fill="var(--map-tree)"
                    />
                  ))}
                </>
              ) : (
                <>
                  <rect
                    width="29"
                    height="22"
                    rx="3"
                    fill="var(--map-block)"
                    stroke="var(--map-roof)"
                  />
                  <rect
                    x="38"
                    width="30"
                    height="22"
                    rx="3"
                    fill="var(--map-roof)"
                  />
                  <rect
                    y="32"
                    width={i % 3 === 0 ? 68 : 26}
                    height="25"
                    rx="3"
                    fill="var(--map-block)"
                  />
                  {i % 3 !== 0 && (
                    <rect
                      x="36"
                      y="32"
                      width="32"
                      height="25"
                      rx="3"
                      fill="var(--map-roof)"
                    />
                  )}
                </>
              )}
            </g>
          );
        })}
      <path
        d="M1080 -30C950 140 1010 225 1060 310C970 390 1035 470 1045 510C1030 650 1030 740 1120 890"
        fill="none"
        stroke="var(--map-shore)"
        strokeWidth="43"
      />
      <path
        d="M1080 -30C950 140 1010 225 1060 310C970 390 1035 470 1045 510C1030 650 1030 740 1120 890"
        fill="none"
        stroke="var(--map-water)"
        strokeWidth="30"
      />
      <path
        d="M1070 325C1190 245 1310 380 1270 550C1300 725 1110 795 1060 673C1015 570 1080 485 1070 325Z"
        fill="var(--map-shore)"
      />
      <path
        d="M1080 335C1190 265 1290 390 1255 550C1285 710 1120 778 1073 670C1030 570 1095 485 1080 335Z"
        fill="var(--map-water)"
      />
      <g strokeLinecap="round">
        {edges.map(([a, b]) => (
          <g key={`${a}-${b}`}>
            <line
              x1={nodes[a].x}
              y1={nodes[a].y}
              x2={nodes[b].x}
              y2={nodes[b].y}
              stroke="var(--map-road-edge)"
              strokeWidth="13"
            />
            <line
              x1={nodes[a].x}
              y1={nodes[a].y}
              x2={nodes[b].x}
              y2={nodes[b].y}
              stroke="var(--map-road)"
              strokeWidth="9"
            />
            {(a % 13 === 6 || Math.floor(a / 13) === 4) && (
              <line
                x1={nodes[a].x}
                y1={nodes[a].y}
                x2={nodes[b].x}
                y2={nodes[b].y}
                stroke="var(--map-line)"
                strokeWidth="1"
                strokeDasharray="7 8"
              />
            )}
          </g>
        ))}
      </g>
      <g fill="var(--map-waterline)" opacity=".45">
        {[380, 440, 500, 560, 620].map((y) => (
          <path
            key={y}
            d={`M1130 ${y}q12 -5 24 0t24 0`}
            stroke="currentColor"
            fill="none"
          />
        ))}
      </g>
      {labels && (
        <g>
          {districts.map((d) => (
            <g key={d.name} transform={`translate(${d.x},${d.y})`}>
              <rect
                x={-d.name.length * 5 - 12}
                y="-16"
                width={d.name.length * 10 + 24}
                height="29"
                rx="5"
                fill="var(--map-label-bg)"
                opacity=".92"
              />
              <text
                textAnchor="middle"
                y="3"
                fill="var(--map-label)"
                fontSize="12"
                letterSpacing="2"
                fontWeight="700"
              >
                {d.name}
              </text>
            </g>
          ))}
          <text
            x="1165"
            y="467"
            fill="var(--map-waterline)"
            textAnchor="middle"
            fontSize="18"
            fontStyle="italic"
          >
            Falkensee
          </text>
          <text
            x="675"
            y="400"
            fill="var(--map-label)"
            fontSize="9"
            letterSpacing="2"
          >
            RINGSTRASSE
          </text>
        </g>
      )}
      <g transform="translate(1240,60)" fill="var(--map-label)">
        <path d="M0 -15L6 8 0 4 -6 8Z" />
        <text y="-23" textAnchor="middle" fontSize="12">
          N
        </text>
      </g>
    </g>
  );
});
