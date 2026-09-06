import { regionalRoads, towns } from "./region";
export { WORLD_WIDTH, WORLD_HEIGHT, METERS_PER_UNIT } from "./region";
/** Fictional region: rendered streets and routing use the same curved geometry. */
export const WORLD = "falkenried-2";
export const LEGACY_WORLD = "falkenried-1";
export interface Point {
  x: number;
  y: number;
}
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const districts = [
  ...towns,
  { name: "ALTSTADT", x: 565, y: 360 },
  { name: "NORDHÖHE", x: 515, y: 170 },
  { name: "LINDENAU", x: 180, y: 165 },
  { name: "WESTEND", x: 345, y: 420 },
  { name: "GEWERBEPARK", x: 815, y: 320 },
  { name: "SÜDSTADT", x: 560, y: 600 },
  { name: "MÜHLENDORF", x: 185, y: 660 },
  { name: "SEEBRUCK", x: 865, y: 675 },
  { name: "FALKENFORST", x: 1135, y: 145 },
];
type RoadKind = "main" | "street" | "lane" | "country";
// Matching waypoint coordinates connect junctions across named streets.
const specs: [string, RoadKind, number[][]][] = [
  [
    "Marktstraße",
    "main",
    [
      [340, 440],
      [425, 414],
      [505, 425],
      [568, 405],
      [635, 420],
      [720, 390],
      [810, 405],
    ],
  ],
  [
    "Lindenchaussee",
    "country",
    [
      [30, 110],
      [115, 160],
      [185, 220],
      [265, 255],
      [320, 340],
      [340, 440],
    ],
  ],
  [
    "Mühlenstraße",
    "country",
    [
      [340, 440],
      [295, 490],
      [260, 560],
      [190, 610],
      [110, 685],
      [30, 770],
    ],
  ],
  [
    "Seestraße",
    "country",
    [
      [810, 405],
      [860, 470],
      [880, 555],
      [845, 620],
      [865, 710],
      [945, 800],
    ],
  ],
  [
    "Höhenstraße",
    "main",
    [
      [425, 414],
      [420, 340],
      [455, 260],
      [505, 220],
      [580, 230],
      [645, 290],
      [720, 390],
    ],
  ],
  [
    "Südring",
    "main",
    [
      [425, 414],
      [407, 485],
      [455, 545],
      [540, 560],
      [625, 535],
      [675, 475],
      [635, 420],
    ],
  ],
  [
    "Kirchgasse",
    "lane",
    [
      [505, 425],
      [493, 375],
      [525, 325],
      [590, 315],
      [630, 355],
      [635, 420],
    ],
  ],
  [
    "Bachgasse",
    "lane",
    [
      [568, 405],
      [575, 360],
      [590, 315],
    ],
  ],
  [
    "Rosenweg",
    "street",
    [
      [420, 340],
      [465, 325],
      [525, 325],
    ],
  ],
  [
    "Schlossallee",
    "street",
    [
      [590, 315],
      [610, 266],
      [580, 230],
    ],
  ],
  [
    "Burgweg",
    "lane",
    [
      [630, 355],
      [674, 339],
      [645, 290],
    ],
  ],
  [
    "Falkenweg",
    "street",
    [
      [455, 260],
      [439, 205],
      [475, 148],
      [545, 140],
      [592, 168],
      [580, 230],
    ],
  ],
  [
    "Am Hang",
    "lane",
    [
      [505, 220],
      [509, 183],
      [545, 140],
    ],
  ],
  [
    "Waldrandstraße",
    "country",
    [
      [545, 140],
      [598, 96],
      [690, 83],
      [795, 140],
      [825, 215],
      [795, 270],
      [720, 390],
    ],
  ],
  [
    "Eichenweg",
    "street",
    [
      [795, 140],
      [852, 123],
      [897, 175],
      [872, 221],
      [825, 215],
    ],
  ],
  [
    "Gewerbeallee",
    "street",
    [
      [795, 270],
      [851, 288],
      [873, 348],
      [810, 405],
    ],
  ],
  [
    "Werkstraße",
    "street",
    [
      [851, 288],
      [910, 312],
      [925, 365],
      [873, 348],
    ],
  ],
  [
    "Uferchaussee",
    "country",
    [
      [810, 405],
      [926, 408],
      [1035, 385],
      [1130, 365],
      [1210, 400],
      [1270, 470],
    ],
  ],
  [
    "Forststraße",
    "country",
    [
      [1130, 365],
      [1112, 296],
      [1150, 225],
      [1200, 206],
      [1280, 250],
    ],
  ],
  [
    "Hafenstraße",
    "street",
    [
      [880, 555],
      [934, 557],
      [985, 575],
      [1010, 610],
    ],
  ],
  [
    "Am Falkensee",
    "street",
    [
      [845, 620],
      [920, 637],
      [976, 672],
      [1035, 700],
    ],
  ],
  [
    "Seepromenade",
    "lane",
    [
      [1010, 610],
      [992, 646],
      [976, 672],
      [981, 723],
      [1020, 763],
    ],
  ],
  [
    "Brunnenstraße",
    "street",
    [
      [845, 620],
      [793, 596],
      [753, 635],
      [794, 690],
      [865, 710],
    ],
  ],
  [
    "Schulweg",
    "lane",
    [
      [753, 635],
      [720, 584],
      [740, 536],
      [793, 596],
    ],
  ],
  [
    "Talstraße",
    "country",
    [
      [625, 535],
      [655, 579],
      [690, 618],
      [753, 635],
    ],
  ],
  [
    "Gartenstraße",
    "street",
    [
      [455, 545],
      [463, 603],
      [503, 640],
      [566, 650],
      [623, 610],
      [625, 535],
    ],
  ],
  [
    "Wiesenweg",
    "lane",
    [
      [540, 560],
      [536, 604],
      [566, 650],
    ],
  ],
  [
    "Auenstraße",
    "country",
    [
      [566, 650],
      [560, 708],
      [610, 774],
      [665, 830],
    ],
  ],
  [
    "Feldstraße",
    "country",
    [
      [260, 560],
      [333, 610],
      [397, 678],
      [465, 726],
      [560, 708],
    ],
  ],
  [
    "Lindenweg",
    "street",
    [
      [115, 160],
      [98, 218],
      [131, 266],
      [185, 278],
      [185, 220],
    ],
  ],
  [
    "Dorfstraße",
    "street",
    [
      [185, 220],
      [218, 179],
      [261, 188],
      [280, 224],
      [265, 255],
    ],
  ],
  [
    "Am Anger",
    "lane",
    [
      [131, 266],
      [155, 305],
      [220, 310],
      [265, 255],
    ],
  ],
  [
    "Mühlengasse",
    "street",
    [
      [190, 610],
      [147, 587],
      [109, 616],
      [110, 685],
      [173, 706],
      [223, 671],
      [190, 610],
    ],
  ],
  [
    "Am Wehr",
    "lane",
    [
      [190, 610],
      [234, 610],
      [248, 642],
      [223, 671],
    ],
  ],
  [
    "Westendstraße",
    "street",
    [
      [340, 440],
      [375, 387],
      [390, 350],
      [420, 340],
    ],
  ],
  [
    "Kastanienweg",
    "lane",
    [
      [320, 340],
      [277, 355],
      [283, 405],
      [299, 433],
      [340, 440],
    ],
  ],
  [
    "Parkstraße",
    "street",
    [
      [407, 485],
      [360, 501],
      [325, 542],
      [260, 560],
    ],
  ],
  [
    "Amselweg",
    "lane",
    [
      [360, 501],
      [353, 544],
      [385, 571],
      [423, 557],
      [455, 545],
    ],
  ],
];
const originalRoadCount = specs.length;
specs.push(...regionalRoads);
export const nodes: Point[] = [];
export const edges: [number, number][] = [];
const index = new Map<string, number>();
function add(p: Point) {
  const q = {
    x: Math.round(p.x * 1000) / 1000,
    y: Math.round(p.y * 1000) / 1000,
  };
  const key = `${q.x},${q.y}`;
  if (!index.has(key)) {
    index.set(key, nodes.length);
    nodes.push(q);
  }
  return index.get(key)!;
}
export const roads = specs.map(([name, kind, coords], roadIndex) => {
  const anchors = coords.map(([x, y]) => ({ x, y })),
    ids: number[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[Math.max(0, i - 1)],
      b = anchors[i],
      c = anchors[i + 1],
      d = anchors[Math.min(anchors.length - 1, i + 2)];
    const count = Math.max(
      3,
      Math.ceil(distance(b, c) / (roadIndex < originalRoadCount ? 16 : 32)),
    );
    for (let j = 0; j < count; j++) {
      const t = j / count,
        t2 = t * t,
        t3 = t2 * t;
      const component = (k: "x" | "y") =>
        0.5 *
        (2 * b[k] +
          (-a[k] + c[k]) * t +
          (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 +
          (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3);
      ids.push(add({ x: component("x"), y: component("y") }));
    }
  }
  ids.push(add(anchors.at(-1)!));
  for (let i = 1; i < ids.length; i++) edges.push([ids[i - 1], ids[i]]);
  return { name, kind, ids, points: ids.map((i) => nodes[i]) };
});
// Connect every geometric crossing introduced by the regional roads. Each new
// junction is inserted into both the rendered polyline and the routing graph.
const segments = roads.flatMap((road, r) =>
  road.ids.slice(1).map((b, i) => ({ r, i, a: road.ids[i], b })),
);
const cuts = new Map<string, { t: number; id: number }[]>();
const cross = (ax: number, ay: number, bx: number, by: number) =>
  ax * by - ay * bx;
for (let i = 0; i < segments.length; i++)
  for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i],
      b = segments[j];
    if (
      (a.r < originalRoadCount && b.r < originalRoadCount) ||
      a.a === b.a ||
      a.a === b.b ||
      a.b === b.a ||
      a.b === b.b
    )
      continue;
    const p = nodes[a.a],
      q = nodes[a.b],
      u = nodes[b.a],
      v = nodes[b.b];
    if (
      Math.max(p.x, q.x) < Math.min(u.x, v.x) ||
      Math.max(u.x, v.x) < Math.min(p.x, q.x) ||
      Math.max(p.y, q.y) < Math.min(u.y, v.y) ||
      Math.max(u.y, v.y) < Math.min(p.y, q.y)
    )
      continue;
    const den = cross(q.x - p.x, q.y - p.y, v.x - u.x, v.y - u.y);
    if (Math.abs(den) < 1e-9) continue;
    const t = cross(u.x - p.x, u.y - p.y, v.x - u.x, v.y - u.y) / den;
    const w = cross(u.x - p.x, u.y - p.y, q.x - p.x, q.y - p.y) / den;
    if (t <= 1e-5 || t >= 1 - 1e-5 || w <= 1e-5 || w >= 1 - 1e-5) continue;
    const id = nodes.length;
    nodes.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
    for (const [segment, fraction] of [
      [a, t],
      [b, w],
    ] as const) {
      const key = `${segment.r}:${segment.i}`;
      cuts.set(key, [...(cuts.get(key) ?? []), { t: fraction, id }]);
    }
  }
for (const [r, road] of roads.entries()) {
  road.ids = road.ids.flatMap((id, i) => [
    id,
    ...(cuts.get(`${r}:${i}`) ?? []).sort((a, b) => a.t - b.t).map((c) => c.id),
  ]);
  road.points = road.ids.map((id) => nodes[id]);
}
edges.length = 0;
for (const road of roads)
  for (let i = 1; i < road.ids.length; i++)
    edges.push([road.ids[i - 1], road.ids[i]]);
export const originalNodes = [
  ...new Set(roads.slice(0, originalRoadCount).flatMap((r) => r.points)),
];
export const nearest = (p: Point) =>
  nodes.reduce(
    (a, n, i) => (distance(n, p) < distance(nodes[a], p) ? i : a),
    0,
  );
export const publicHospital = nodes[nearest({ x: 623, y: 610 })];
export const docks = [
  { x: 1010, y: 610 },
  { x: 1035, y: 700 },
  { x: 1020, y: 763 },
];
export const isWaterSite = (p: Point) => docks.some((d) => distance(d, p) < 22);
export const districtAt = (p: Point) =>
  districts.reduce((a, b) => (distance(a, p) < distance(b, p) ? a : b)).name;
const adjacency = nodes.map(() => [] as number[]);
for (const [a, b] of edges) {
  adjacency[a].push(b);
  adjacency[b].push(a);
}
export function route(
  a: Point,
  b: Point,
  mode: "road" | "air" | "water" = "road",
): Point[] {
  if (mode === "air") return [a, b];
  if (mode === "water") {
    if (!isWaterSite(a) || !isWaterSite(b))
      throw Error("Boote benötigen einen Wasserzugang.");
    return [a, { x: 1115, y: a.y }, { x: 1115, y: b.y }, b];
  }
  const start = nearest(a),
    goal = nearest(b),
    open = new Set([start]),
    cost = new Map([[start, 0]]),
    prev = new Map<number, number>();
  while (open.size) {
    const current = [...open].sort(
      (x, y) =>
        cost.get(x)! +
        distance(nodes[x], nodes[goal]) -
        (cost.get(y)! + distance(nodes[y], nodes[goal])),
    )[0];
    if (current === goal) {
      const result = [goal];
      let c = goal;
      while (prev.has(c)) {
        c = prev.get(c)!;
        result.unshift(c);
      }
      return [a, ...result.map((i) => nodes[i]), b];
    }
    open.delete(current);
    for (const n of adjacency[current]) {
      const c = cost.get(current)! + distance(nodes[current], nodes[n]);
      if (c < (cost.get(n) ?? Infinity)) {
        cost.set(n, c);
        prev.set(n, current);
        open.add(n);
      }
    }
  }
  throw Error("Kein erreichbarer Straßenweg.");
}
export const length = (path: Point[]) =>
  path.slice(1).reduce((s, p, i) => s + distance(path[i], p), 0);
export function along(path: Point[], fraction: number): Point {
  let left = length(path) * Math.max(0, Math.min(1, fraction));
  for (let i = 1; i < path.length; i++) {
    const d = distance(path[i - 1], path[i]);
    if (left <= d)
      return {
        x: path[i - 1].x + (path[i].x - path[i - 1].x) * (d ? left / d : 0),
        y: path[i - 1].y + (path[i].y - path[i - 1].y) * (d ? left / d : 0),
      };
    left -= d;
  }
  return path.at(-1) ?? nodes[0];
}
