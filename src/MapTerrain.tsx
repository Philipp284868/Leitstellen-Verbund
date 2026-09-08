import { SpatialIndex } from "./spatial";
import { towns, WORLD_WIDTH, WORLD_HEIGHT, WORLD_SEED } from "./region";
import { memo, useId } from "react";
import {
  roads,
  overpasses,
  projectRoad,
  districts,
  distance,
  type Point,
} from "./world";
const river =
  "M1020 -30C940 85 1050 173 1010 265S1056 336 1035 385S1090 431 1090 510";
const lake =
  "M1090 470C1195 444 1300 532 1255 690C1240 790 1090 845 1020 763C980 741 1054 724 1035 700C1002 676 1038 650 1010 610C985 582 1057 558 1090 470Z";
const woods = [
  "M935 0H1300V305C1230 283 1235 249 1188 255C1142 260 1152 338 1090 320C1050 290 1090 230 1056 200C1020 168 1060 97 1010 72Z",
  "M0 320C60 276 75 326 119 351S213 342 240 406C266 465 186 484 143 521S52 547 0 523Z",
  "M280 767C329 733 364 786 420 793S511 775 537 850H253Z",
  "M679 180C726 142 738 186 763 209S776 264 737 284C688 314 654 229 679 180Z",
];
const fields = [
  "M20 24Q150 5 213 50L161 104Q101 131 57 89Z",
  "M236 28Q340 10 420 37L395 120Q310 158 286 173L238 125Z",
  "M310 198Q349 165 405 170L399 248Q383 281 347 296L313 241Z",
  "M33 564Q63 532 108 543L133 573L83 641 24 696Z",
  "M322 659Q367 692 409 732L371 756Q307 734 262 764L246 704Z",
  "M385 32Q479 9 565 20L552 73Q502 107 449 100L414 131Z",
  "M667 704Q713 669 745 712L785 773 726 827 661 780Z",
  "M893 78Q921 39 967 41L979 122 940 184 922 137Z",
];
const nearRoad = (p: Point, margin: number) => projectRoad(p).distance < margin;
let seed: number = WORLD_SEED;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
// Individual roadside footprints, rotated to their street, with no tiled blocks.
const houses: {
  x: number;
  y: number;
  angle: number;
  width: number;
  height: number;
  tone: number;
}[] = [];
const houseIndex = new SpatialIndex<(typeof houses)[number]>();
for (const road of roads) {
  for (let i = 1; i < road.points.length - 1; i++) {
    for (const fraction of [0.2, 0.5, 0.8]) {
      const p = {
          x:
            road.points[i - 1].x +
            (road.points[i].x - road.points[i - 1].x) * fraction,
          y:
            road.points[i - 1].y +
            (road.points[i].y - road.points[i - 1].y) * fraction,
        },
        prev = road.points[i - 1],
        next = road.points[i + 1];
      const urban =
        distance(p, { x: 540, y: 400 }) < 260 ||
        distance(p, { x: 190, y: 235 }) < 95 ||
        distance(p, { x: 175, y: 650 }) < 85 ||
        distance(p, { x: 828, y: 630 }) < 100 ||
        distance(p, { x: 855, y: 285 }) < 130;
      if (road.kind === "country" && (!urban || random() < 0.55)) continue;
      const angle = Math.atan2(next.y - prev.y, next.x - prev.x);
      for (const side of [-1, 1]) {
        if (random() < 0.22) continue;
        const setback = 9 + random() * 6;
        const x = p.x - Math.sin(angle) * setback * side,
          y = p.y + Math.cos(angle) * setback * side;
        const industry = x > 815 && x < 945 && y > 270 && y < 377;
        const width = industry ? 11 + random() * 5 : 3 + random() * 3,
          height = industry ? 7 + random() * 5 : 3 + random() * 2;
        if (
          x < 15 ||
          (x < 1300 && y < 850 && x > 980) ||
          x > WORLD_WIDTH - 15 ||
          y < 15 ||
          y > WORLD_HEIGHT - 15 ||
          nearRoad({ x, y }, Math.hypot(width, height) / 2 + 3) ||
          houseIndex
            .query(x - 50, y - 50, 100, 100)
            .some(
              (h) =>
                distance(h, { x, y }) <
                (Math.hypot(h.width, h.height) + Math.hypot(width, height)) /
                  2 +
                  2,
            )
        )
          continue;
        const house = {
          x,
          y,
          angle: (angle * 180) / Math.PI,
          width,
          height,
          tone: Math.floor(random() * 3),
        };
        houses.push(house);
        houseIndex.add(house);
      }
    }
  }
}
const trees: { x: number; y: number; r: number }[] = [];
for (let i = 0; i < 8200; i++) {
  const x = random() * 1300,
    y = random() * 850;
  const forest =
    (x > 1080 && y < 300) ||
    Math.pow((x - 103) / 132, 2) + Math.pow((y - 429) / 95, 2) < 1 ||
    Math.pow((x - 714) / 53, 2) + Math.pow((y - 230) / 58, 2) < 1 ||
    (x > 280 && x < 520 && y > 796);
  const grove =
    Math.pow((x - 580) / 48, 2) + Math.pow((y - 481) / 32, 2) < 1 ||
    Math.pow((x - 389) / 28, 2) + Math.pow((y - 232) / 70, 2) < 1;
  if (
    (forest || grove) &&
    !nearRoad({ x, y }, 13) &&
    !houseIndex
      .query(x - 14, y - 14, 28, 28)
      .some((h) => distance(h, { x, y }) < 14)
  )
    trees.push({ x, y, r: 2 + random() * 3 });
}
const regionalPatches: string[] = [];
for (let i = 0; i < 1200; i++) {
  const x = 80 + random() * (WORLD_WIDTH - 160),
    y = 80 + random() * (WORLD_HEIGHT - 160);
  if ((x < 1450 && y < 1000) || towns.some((t) => distance(t, { x, y }) < 260))
    continue;
  const rx = 65 + random() * 150,
    ry = 45 + random() * 100;
  regionalPatches.push(
    i % 3
      ? `M${x - rx} ${y - ry * 0.7} Q${x - rx * 0.2} ${y - ry * 1.1} ${x + rx * 0.8} ${y - ry * 0.6} L${x + rx} ${y + ry * 0.4} Q${x + rx * 0.1} ${y + ry} ${x - rx * 0.7} ${y + ry * 0.8}Z`
      : `M${x - rx} ${y} C${x - rx * 1.2} ${y - ry} ${x - rx * 0.2} ${y - ry * 1.3} ${x + rx * 0.4} ${y - ry} S${x + rx * 1.3} ${y - ry * 0.1} ${x + rx} ${y + ry * 0.5} S${x - rx * 0.3} ${y + ry * 1.2} ${x - rx} ${y}Z`,
  );
}
export const MapTerrain = memo(function MapTerrain({
  labels,
  zoom,
  x = 0,
  y = 0,
  width = WORLD_WIDTH,
  height = WORLD_HEIGHT,
  unitsPerPixel = 1,
}: {
  labels: boolean;
  zoom: number;
  unitsPerPixel?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}) {
  const visibleRoads = roads.filter((r) =>
    r.points.some(
      (p) =>
        p.x >= x - 64 &&
        p.y >= y - 64 &&
        p.x <= x + width + 64 &&
        p.y <= y + height + 64,
    ),
  );
  const patternId = useId(),
    textureId = useId();
  const labelBoxes: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }[] = [];
  const visibleLabels = new Set(
    districts
      .filter(
        (d) => d.x >= x && d.y >= y && d.x <= x + width && d.y <= y + height,
      )
      .filter((d) => {
        const text =
          zoom < 0.6 && d.name === "ALTSTADT" ? "FALKENRIED" : d.name;
        const fontSize = Math.max(11, 11 * unitsPerPixel);
        const half = text.length * (fontSize * 0.4 + 1) + 6 * unitsPerPixel,
          box = {
            left: d.x - half,
            right: d.x + half,
            top: d.y - 14 * unitsPerPixel,
            bottom: d.y + 8 * unitsPerPixel,
          };
        if (
          labelBoxes.some(
            (b) =>
              b.left < box.right &&
              b.right > box.left &&
              b.top < box.bottom &&
              b.bottom > box.top,
          )
        )
          return false;
        labelBoxes.push(box);
        return true;
      })
      .map((d) => d.name),
  );
  const visibleHouses =
    zoom >= 0.7
      ? houseIndex.query(x - 40, y - 40, width + 80, height + 80)
      : [];
  return (
    <g className="map-terrain" pointerEvents="none">
      <defs>
        <pattern
          id={patternId}
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(24)"
        >
          <path d="M0 0V8" stroke="var(--map-field-line)" strokeWidth="1" />
        </pattern>
        <filter id={textureId}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".35"
            numOctaves="3"
            seed="19"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="var(--map-land)" />
      {regionalPatches.map((p, i) => (
        <path
          key={i}
          d={p}
          fill={
            i % 3 === 0
              ? "var(--map-park)"
              : i % 3 === 1
                ? "var(--map-field)"
                : "var(--map-meadow)"
          }
          stroke="var(--map-hedge)"
          strokeWidth="3"
        />
      ))}
      <path
        d="M5150 1620C4630 1500 4700 2080 4270 2030S3480 2150 3010 2060S2190 2260 1750 2100S640 2350 0 2000"
        fill="none"
        stroke="var(--map-shore)"
        strokeWidth="22"
      />
      <path
        d="M5150 1620C4630 1500 4700 2080 4270 2030S3480 2150 3010 2060S2190 2260 1750 2100S640 2350 0 2000"
        fill="none"
        stroke="var(--map-water)"
        strokeWidth="13"
      />
      <path
        d="M0 32C190 8 280 55 380 12S690 30 795 0M0 805C166 767 193 798 266 819M715 827C841 752 880 822 995 840"
        fill="none"
        stroke="var(--map-contour)"
        strokeWidth="2"
      />
      {fields.map((d, i) => (
        <g key={d}>
          <path
            d={d}
            fill={i % 2 ? "var(--map-field)" : "var(--map-meadow)"}
            stroke="var(--map-hedge)"
            strokeWidth="3"
          />
          <path d={d} fill={`url(#${patternId})`} opacity=".6" />
        </g>
      ))}
      {woods.map((d) => (
        <path key={d} d={d} fill="var(--map-park)" />
      ))}
      <path
        d="M365 173C415 168 424 224 397 274S352 290 358 250Z M530 467C551 434 621 437 628 469S593 518 554 510Z"
        fill="var(--map-park)"
      />
      <path
        d="M80 840C88 758 269 755 276 688S215 550 381 529C449 518 460 474 543 468S700 493 736 453S924 452 1068 491"
        fill="none"
        stroke="var(--map-shore)"
        strokeWidth="9"
      />
      <path
        d="M80 840C88 758 269 755 276 688S215 550 381 529C449 518 460 474 543 468S700 493 736 453S924 452 1068 491"
        fill="none"
        stroke="var(--map-water)"
        strokeWidth="4"
      />
      <path d={river} fill="none" stroke="var(--map-shore)" strokeWidth="31" />
      <path d={river} fill="none" stroke="var(--map-water)" strokeWidth="23" />
      <path
        d={lake}
        fill="var(--map-water)"
        stroke="var(--map-shore)"
        strokeWidth="6"
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        filter={`url(#${textureId})`}
        opacity=".08"
        style={{ mixBlendMode: "soft-light" }}
      />
      {(zoom >= 0.7 ? trees : []).map((t, i) => (
        <g key={i}>
          <circle
            cx={t.x + 1.5}
            cy={t.y + 2}
            r={t.r}
            fill="var(--map-tree-shadow)"
          />
          <circle
            cx={t.x}
            cy={t.y}
            r={t.r}
            fill="var(--map-tree)"
            opacity={0.65 + (i % 4) * 0.1}
          />
        </g>
      ))}
      <g strokeLinecap="round" strokeLinejoin="round">
        {visibleRoads.map((r) => (
          <polyline
            key={r.name}
            points={r.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--map-road-edge)"
            strokeWidth={r.kind === "main" ? 7 : r.kind === "country" ? 6 : 4}
          />
        ))}
        {visibleRoads.map((r) => (
          <polyline
            key={r.name}
            points={r.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--map-road)"
            strokeWidth={r.kind === "main" ? 5 : r.kind === "country" ? 4 : 2.5}
          />
        ))}
        {visibleRoads
          .filter((r) => r.kind === "main" || r.kind === "country")
          .map((r) => (
            <polyline
              key={r.name}
              points={r.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="var(--map-line)"
              strokeWidth=".7"
              strokeDasharray="5 7"
            />
          ))}
      </g>
      <g>
        {overpasses
          .filter(
            (p) =>
              p.x >= x && p.y >= y && p.x <= x + width && p.y <= y + height,
          )
          .map((p) => (
            <g
              key={p.upper + "/" + p.lower}
              transform={`translate(${p.x},${p.y}) rotate(${p.angle})`}
            >
              <path
                d="M-10 -6H10M-10 6H10"
                stroke="var(--map-road-edge)"
                strokeWidth="2"
              />
              <path d="M-10 0H10" stroke="var(--map-road)" strokeWidth="9" />
            </g>
          ))}
      </g>
      <g stroke="var(--map-roof-outline)" strokeWidth=".5">
        {visibleHouses.map((h, i) => (
          <g key={i} transform={`translate(${h.x},${h.y}) rotate(${h.angle})`}>
            <rect
              x={-h.width / 2 + 1.4}
              y={-h.height / 2 + 1.5}
              width={h.width}
              height={h.height}
              rx=".6"
              fill="var(--map-tree-shadow)"
              stroke="none"
            />
            <rect
              x={-h.width / 2}
              y={-h.height / 2}
              width={h.width}
              height={h.height}
              rx=".6"
              fill={
                h.tone === 0
                  ? "var(--map-roof-warm)"
                  : h.tone === 1
                    ? "var(--map-roof)"
                    : "var(--map-block)"
              }
            />
            <path
              d={`M${-h.width / 2 + 1} 0H${h.width / 2 - 1}`}
              stroke="var(--map-roof-outline)"
            />
          </g>
        ))}
      </g>
      <g
        fill="none"
        stroke="var(--map-waterline)"
        opacity=".32"
        strokeWidth="1"
      >
        <path d="M1120 550q12 -4 24 0t24 0M1170 620q12 -4 24 0t24 0M1095 727q12 -4 24 0t24 0" />
      </g>
      {labels && (
        <g>
          {districts
            .filter((d) => visibleLabels.has(d.name))
            .map((d) => (
              <text
                key={d.name}
                x={d.x}
                y={d.y}
                textAnchor="middle"
                fill="var(--map-label)"
                stroke="var(--map-label-bg)"
                strokeWidth="4"
                paintOrder="stroke"
                fontSize={Math.max(11, 11 * unitsPerPixel)}
                letterSpacing="2"
                fontWeight="700"
              >
                {zoom < 0.6 && d.name === "ALTSTADT" ? "FALKENRIED" : d.name}
              </text>
            ))}
          <text
            x="1160"
            y="675"
            textAnchor="middle"
            fill="var(--map-waterline)"
            fontSize="18"
            fontStyle="italic"
            transform="rotate(-12 1160 675)"
          >
            Falkensee
          </text>
          <text
            x="968"
            y="210"
            fill="var(--map-waterline)"
            fontSize="10"
            fontStyle="italic"
            transform="rotate(78 968 210)"
          >
            Die Falke
          </text>
          <text
            x="553"
            y="497"
            fill="var(--map-label)"
            fontSize="8"
            letterSpacing="1"
          >
            STADTPARK
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
