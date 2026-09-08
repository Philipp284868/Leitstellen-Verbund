import { IS_RIVERMERE } from "../world-choice";
import { memo, useId } from "react";
import { roads, overpasses, projectRoad, distance } from "../world";
import { SpatialIndex } from "../spatial";
import {
  settlements,
  quarters,
  river,
  tributary,
  lakes,
  lakePolygons,
  extent,
  randomSequence,
  wet,
  riverDistance,
  polygonsToPath,
} from "./geography";
const random = randomSequence();
type Footprint = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  tone: number;
};
const houses = new SpatialIndex<Footprint>();
export const footprints: Footprint[] = [];
for (const [ri, road] of (IS_RIVERMERE ? roads : []).entries()) {
  const ruralRoad = road.kind === "country";
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1],
      b = road.points[i],
      len = distance(a, b),
      angle = Math.atan2(b.y - a.y, b.x - a.x);
    for (
      let d = ruralRoad ? 90 : 12;
      d < len;
      d += ruralRoad ? 180 + random() * 220 : 12 + random() * 8
    )
      for (const side of [-1, 1]) {
        const x = a.x + ((b.x - a.x) * d) / len - Math.sin(angle) * side * 10,
          y = a.y + ((b.y - a.y) * d) / len + Math.cos(angle) * side * 10;
        if (
          wet({ x, y }) ||
          riverDistance({ x, y }) < 55 ||
          projectRoad({ x, y }).distance < 7 ||
          houses
            .query(x - 12, y - 12, 24, 24)
            .some((h) => distance(h, { x, y }) < 10)
        )
          continue;
        const h = {
          id: `rm-house-${ri}-${i}-${d.toFixed(3)}-${side}`,
          x,
          y,
          width: 5 + random() * 3,
          height: 4 + random() * 3,
          angle: (angle * 180) / Math.PI,
          tone: Math.floor(random() * 4),
        };
        houses.add(h);
        footprints.push(h);
      }
  }
}
const overviewBlocks = Array.from({ length: 4 }, (_, tone) =>
  footprints
    .filter((h) => h.tone === tone)
    .map((h) => `M${h.x - 4},${h.y - 3}h8v6h-8Z`)
    .join(" "),
);
const patches = Array.from({ length: 1500 }, (_, i) => {
  const x = random() * extent,
    y = random() * extent,
    rx = 25 + random() * 110,
    ry = 20 + random() * 80;
  const rural = !settlements.some((t) => distance(t, { x, y }) < t.size * 1.05);
  return {
    id: `rm-field-${i}`,
    x,
    y,
    rural,
    tone: i % 5,
    path: `M${x - rx},${y - ry} Q${x},${y - ry * 1.3} ${x + rx},${y - ry * 0.7} L${x + rx * 0.8},${y + ry} Q${x},${y + ry * 0.7} ${x - rx * 0.9},${y + ry * 0.9}Z`,
  };
}).filter((p) => p.rural && !wet(p));
const forests = [
  { name: "Holloway Forest", x: 7700, y: 1300, rx: 570, ry: 1100 },
  { name: "Blackwood Forest", x: 700, y: 6400, rx: 800, ry: 1500 },
  { name: "Northfell", x: 450, y: 650, rx: 700, ry: 900 },
  { name: "Grey Peak", x: 500, y: 7600, rx: 700, ry: 600 },
  { name: "Sunridge Hills", x: 7900, y: 6200, rx: 600, ry: 650 },
];
const forestShapes = forests.map((f, index) => ({
  index,
  ...f,
  path: polygonsToPath(
    Array.from({ length: 60 }, (_, i) => {
      const a = (i * Math.PI) / 30,
        r = 1 + 0.1 * Math.sin(a * 7) + 0.07 * Math.cos(a * 11);
      return {
        x: f.x + Math.cos(a) * f.rx * r,
        y: f.y + Math.sin(a) * f.ry * r,
      };
    }),
    true,
  ),
}));
const groves = forests.map(() => Array.from({ length: 4 }, () => ""));
if (IS_RIVERMERE)
  for (let i = 0; i < 9000; i++) {
    const f = forests[i % forests.length],
      x = f.x + (random() * 2 - 1) * f.rx,
      y = f.y + (random() * 2 - 1) * f.ry;
    if (
      ((x - f.x) / f.rx) ** 2 + ((y - f.y) / f.ry) ** 2 > 1 ||
      wet({ x, y }) ||
      projectRoad({ x, y }).distance < 12
    )
      continue;
    const r = 5 + random() * 13;
    groves[i % forests.length][i % 4] +=
      `M${x - r},${y}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0 `;
  }
const renderRoads = roads.map((r, i) => ({
  ...r,
  id: `rm-road-${i}`,
  path: polygonsToPath(r.points),
  minX: Math.min(...r.points.map((p) => p.x)),
  maxX: Math.max(...r.points.map((p) => p.x)),
  minY: Math.min(...r.points.map((p) => p.y)),
  maxY: Math.max(...r.points.map((p) => p.y)),
}));
export const Terrain = memo(function Terrain({
  labels,
  zoom,
  x = 0,
  y = 0,
  width = extent,
  height = extent,
  unitsPerPixel = 1,
}: {
  labels: boolean;
  zoom: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  unitsPerPixel?: number;
}) {
  const clip = useId();
  const visible = renderRoads.filter(
    (r) =>
      r.maxX >= x &&
      r.maxY >= y &&
      r.minX <= x + width &&
      r.minY <= y + height &&
      (zoom > 0.3 || r.kind !== "lane"),
  );
  const visibleForests = forestShapes.filter(
    (f) =>
      f.x + f.rx * 1.3 >= x &&
      f.x - f.rx * 1.3 <= x + width &&
      f.y + f.ry * 1.3 >= y &&
      f.y - f.ry * 1.3 <= y + height,
  );
  const names = [...settlements, ...(zoom > 0.3 ? quarters : [])].filter(
    (t) => t.x >= x && t.y >= y && t.x <= x + width && t.y <= y + height,
  );
  return (
    <g
      className="map-terrain"
      pointerEvents="none"
      data-world="rivermere-1"
      clipPath={`url(#${clip})`}
    >
      <defs>
        <clipPath id={clip}>
          <rect width={extent} height={extent} />
        </clipPath>
      </defs>
      <rect width={extent} height={extent} fill="#5b6b49" />
      {patches
        .filter(
          (p) =>
            p.x > x - 150 &&
            p.x < x + width + 150 &&
            p.y > y - 150 &&
            p.y < y + height + 150,
        )
        .map((p) => (
          <path
            key={p.id}
            d={p.path}
            fill={
              ["#727749", "#7b8154", "#8b8661", "#4a6540", "#637a4d"][p.tone]
            }
            stroke="#435938"
            strokeWidth="2"
          />
        ))}
      {visibleForests.map((f) => (
        <path
          key={f.name}
          d={f.path}
          fill="#2b4c36"
          stroke="#476240"
          strokeWidth="18"
        />
      ))}
      {visibleForests.flatMap((f) =>
        groves[f.index].map((d, i) => (
          <path
            key={`groves-${f.index}-${i}`}
            d={d}
            fill={["#203e2d", "#35543a", "#496442", "#2c4934"][i]}
          />
        )),
      )}
      {settlements.map((t, ti) => (
        <path
          key={t.id}
          d={polygonsToPath(
            Array.from({ length: 48 }, (_, i) => {
              const a = (i * Math.PI) / 24,
                r =
                  t.size *
                  (0.95 +
                    0.09 * Math.sin(a * 5 + ti) +
                    0.07 * Math.cos(a * 3 + ti * 0.7));
              return {
                x: t.x + Math.cos(a) * r,
                y: t.y + Math.sin(a) * r * 0.87,
              };
            }),
            true,
          )}
          fill="#777969"
          opacity=".65"
        />
      ))}
      {[river, tributary].map((line, i) => (
        <path
          key={i}
          d={polygonsToPath(line)}
          fill="none"
          stroke="#204f65"
          strokeWidth="90"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {lakePolygons.map((p, i) => (
        <path
          key={i}
          d={polygonsToPath(p, true)}
          fill="#244f62"
          stroke="#748274"
          strokeWidth="8"
        />
      ))}
      <g fill="none" strokeLinejoin="round" strokeLinecap="round">
        {visible.map((r) => (
          <path
            key={r.id + "edge"}
            d={r.path}
            stroke="#354039"
            strokeWidth={Math.max(
              r.kind === "country" ? 9 : 6,
              unitsPerPixel * 1.8,
            )}
          />
        ))}
        {visible.map((r) => (
          <path
            key={r.id}
            d={r.path}
            stroke={r.kind === "country" ? "#bdad82" : "#b1b2a3"}
            strokeWidth={Math.max(
              r.kind === "country" ? 6 : 3,
              unitsPerPixel * 0.9,
            )}
          />
        ))}
      </g>
      {zoom > 0.4 &&
        overpasses
          .filter(
            (p) => p.x >= x && p.x < x + width && p.y >= y && p.y < y + height,
          )
          .map((p) => (
            <g
              key={p.upper + p.lower}
              transform={`translate(${p.x},${p.y}) rotate(${p.angle})`}
            >
              <path d="M-8,-5H8M-8,5H8" stroke="#24392e" strokeWidth="2" />
              <path d="M-8,0H8" stroke="#c0bca4" strokeWidth="5" />
            </g>
          ))}
      {zoom <= 0.5 &&
        overviewBlocks.map((d, i) => (
          <path
            key={`blocks-${i}`}
            d={d}
            fill={["#bcb6a5", "#a99b88", "#aeb4ac", "#986f59"][i]}
          />
        ))}
      {zoom > 0.5 &&
        houses
          .query(x - 20, y - 20, width + 40, height + 40)
          .map((h) => (
            <rect
              key={h.id}
              transform={`translate(${h.x},${h.y}) rotate(${h.angle})`}
              x={-h.width / 2}
              y={-h.height / 2}
              width={h.width}
              height={h.height}
              fill={["#c0b7a3", "#a39483", "#b2b5ad", "#9b7661"][h.tone]}
              stroke="#465047"
              strokeWidth=".5"
            />
          ))}
      {labels && (
        <g
          fill="#f3f1e6"
          stroke="#22372b"
          strokeWidth={3 * unitsPerPixel}
          paintOrder="stroke"
          textAnchor="middle"
          fontFamily="system-ui"
        >
          {names.map((t) => (
            <text
              key={t.id}
              x={t.x}
              y={t.y}
              fontSize={(t.name === "Rivermere" ? 22 : 12) * unitsPerPixel}
            >
              {t.name}
            </text>
          ))}
          {zoom < 0.6 &&
            [...lakes, ...forests].map((t) => (
              <text
                key={t.name}
                x={t.x}
                y={t.y}
                fontSize={11 * unitsPerPixel}
                fontStyle="italic"
              >
                {t.name}
              </text>
            ))}
        </g>
      )}
    </g>
  );
});
