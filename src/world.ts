import { IS_RIVERMERE } from "./world-choice";
import {
  roadSpecs as rivermereSpecs,
  settlements,
  quarters,
  river,
  riverDistance,
} from "./rivermere/geography";
import { SpatialIndex } from "./spatial";
import { fastestPath, type Link } from "./routing";
import { extendedRoadSpecs, regionTowns } from "./region-extension";
import { METERS_PER_UNIT } from "./region";
import { regionalRoads, towns } from "./region";
export { WORLD_WIDTH, WORLD_HEIGHT, METERS_PER_UNIT } from "./region";
/** Fictional region: rendered streets and routing use the same curved geometry. */
export const WORLD = IS_RIVERMERE ? "rivermere-1" : "falkenried-2";
export const LEGACY_WORLD = "falkenried-1";
export interface Point {
  x: number;
  y: number;
}
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const districts = IS_RIVERMERE
  ? [...settlements, ...quarters]
  : [
      ...towns,
      ...regionTowns,
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
if (IS_RIVERMERE) specs.splice(0, specs.length, ...rivermereSpecs());
const originalRoadCount = specs.length;
if (!IS_RIVERMERE) specs.push(...regionalRoads);
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
const makeRoad = (
  [name, kind, coords]: [string, RoadKind, number[][]],
  roadIndex: number,
) => {
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
      ids.push(
        add(
          IS_RIVERMERE
            ? { x: b.x + (c.x - b.x) * t, y: b.y + (c.y - b.y) * t }
            : { x: component("x"), y: component("y") },
        ),
      );
    }
  }
  ids.push(add(anchors.at(-1)!));
  for (let i = 1; i < ids.length; i++) edges.push([ids[i - 1], ids[i]]);
  return { name, kind, ids, points: ids.map((i) => nodes[i]) };
};
export const roads = specs.map(makeRoad);
// Connect every geometric crossing introduced by the regional roads. Each new
// junction is inserted into both the rendered polyline and the routing graph.
const segments = roads.flatMap((road, r) =>
  road.ids.slice(1).map((b, i) => ({ r, i, a: road.ids[i], b })),
);
const cuts = new Map<string, { t: number; id: number }[]>();
const cross = (ax: number, ay: number, bx: number, by: number) =>
  ax * by - ay * bx;
const crossingPairs: [number, number][] = [];
if (IS_RIVERMERE) {
  const cells = new Map<string, number[]>(),
    seen = new Set<string>();
  segments.forEach((s, i) => {
    const a = nodes[s.a],
      b = nodes[s.b];
    for (
      let x = Math.floor(Math.min(a.x, b.x) / 64);
      x <= Math.floor(Math.max(a.x, b.x) / 64);
      x++
    )
      for (
        let y = Math.floor(Math.min(a.y, b.y) / 64);
        y <= Math.floor(Math.max(a.y, b.y) / 64);
        y++
      ) {
        const key = `${x}:${y}`,
          group = cells.get(key) || [];
        for (const j of group) {
          const pair = `${j}:${i}`;
          if (!seen.has(pair)) {
            seen.add(pair);
            crossingPairs.push([j, i]);
          }
        }
        group.push(i);
        cells.set(key, group);
      }
  });
}
function* pairs(): Generator<[number, number]> {
  if (IS_RIVERMERE) yield* crossingPairs;
  else
    for (let i = 0; i < segments.length; i++)
      for (let j = i + 1; j < segments.length; j++) yield [i, j];
}
for (const [i, j] of pairs()) {
  const a = segments[i],
    b = segments[j];
  if (
    (!IS_RIVERMERE && a.r < originalRoadCount && b.r < originalRoadCount) ||
    (IS_RIVERMERE &&
      (roads[a.r].name === "Rivermere – Eastgate" ||
        roads[b.r].name === "Rivermere – Eastgate")) ||
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
// Append after the old intersection pass: legacy node IDs remain byte-for-byte stable.
// New crossings are grade-separated; only shared authored anchors form junctions.
if (!IS_RIVERMERE)
  roads.push(
    ...extendedRoadSpecs().map((r, i) => makeRoad(r, specs.length + i)),
  );
edges.length = 0;
for (const road of roads)
  for (let i = 1; i < road.ids.length; i++)
    edges.push([road.ids[i - 1], road.ids[i]]);
export const originalNodes = [
  ...new Set(roads.slice(0, originalRoadCount).flatMap((r) => r.points)),
];
const nodeGrid = new SpatialIndex<Point & { id: number }>();
nodes.forEach((p, id) => nodeGrid.add({ ...p, id }));
export function nearest(p: Point) {
  for (let radius = 32; radius < 32768; radius *= 2) {
    const candidates = nodeGrid.query(
      p.x - radius,
      p.y - radius,
      radius * 2,
      radius * 2,
    );
    if (!candidates.length) continue;
    const best = candidates.reduce((a, b) =>
      distance(a, p) <= distance(b, p) ? a : b,
    );
    if (distance(best, p) <= radius) return best.id;
  }
  throw Error("Position außerhalb der Region.");
}
export const publicHospital =
  nodes[nearest(IS_RIVERMERE ? { x: 4300, y: 4500 } : { x: 623, y: 610 })];
export const docks = IS_RIVERMERE
  ? [
      ...[
        { x: 4200, y: 3600 },
        { x: 4100, y: 4000 },
        { x: 5000, y: 5000 },
      ].map((target) => {
        const candidates = nodes.filter((p) => riverDistance(p) < 20);
        return candidates.reduce((a, b) =>
          distance(a, target) < distance(b, target) ? a : b,
        );
      }),
    ]
  : [
      { x: 1010, y: 610 },
      { x: 1035, y: 700 },
      { x: 1020, y: 763 },
    ];
export const isWaterSite = (p: Point) => docks.some((d) => distance(d, p) < 22);
export const districtAt = (p: Point) =>
  districts.reduce((a, b) => (distance(a, p) < distance(b, p) ? a : b)).name;
export type RoadSection = {
  id: string;
  a: number;
  b: number;
  meters: number;
  limit: number;
  name: string;
  kind: RoadKind;
  direction: "both";
  source: "world-rule";
  access: "road";
  bridge?: boolean;
};
export const roadSections: RoadSection[] = roads.flatMap((r) =>
  r.ids.slice(1).map((b, i) => ({
    id: `${r.ids[i]}:${b}`,
    a: r.ids[i],
    b,
    meters: distance(nodes[r.ids[i]], nodes[b]) * METERS_PER_UNIT,
    limit: r.name.startsWith("Schnellstraße")
      ? 100
      : r.kind === "country"
        ? 80
        : r.kind === "lane"
          ? 30
          : 50,
    name: r.name,
    kind: r.kind,
    direction: "both" as const,
    source: "world-rule" as const,
    access: "road" as const,
    ...(IS_RIVERMERE
      ? {
          bridge:
            riverDistance(nodes[r.ids[i]]) < 50 || riverDistance(nodes[b]) < 50,
        }
      : {}),
  })),
);
const adjacency: Link[][] = nodes.map(() => []);
const sectionByPair = new Map<string, RoadSection>();
const allNodeIds = new Map(nodes.map((p, i) => [`${p.x},${p.y}`, i]));
const sectionGrid = new Map<string, RoadSection[]>();
for (const e of roadSections) {
  for (const [a, b] of [
    [e.a, e.b],
    [e.b, e.a],
  ]) {
    adjacency[a].push({
      to: b,
      meters: e.meters,
      limit: e.limit,
      id: `${a}:${b}`,
      allowed: true,
    });
    sectionByPair.set(`${a}:${b}`, e);
  }
  const a = nodes[e.a],
    b = nodes[e.b];
  for (
    let x = Math.floor(Math.min(a.x, b.x) / 64);
    x <= Math.floor(Math.max(a.x, b.x) / 64);
    x++
  )
    for (
      let y = Math.floor(Math.min(a.y, b.y) / 64);
      y <= Math.floor(Math.max(a.y, b.y) / 64);
      y++
    ) {
      const k = `${x}:${y}`;
      if (!sectionGrid.has(k)) sectionGrid.set(k, []);
      sectionGrid.get(k)!.push(e);
    }
}
export const overpasses: {
  x: number;
  y: number;
  upper: string;
  lower: string;
  angle: number;
}[] = [];
const checkedCrossings = new Set<string>();
for (const group of sectionGrid.values())
  for (let i = 0; i < group.length; i++)
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i],
        b = group[j],
        key = [a.id, b.id].sort().join("/");
      if (
        checkedCrossings.has(key) ||
        a.a === b.a ||
        a.a === b.b ||
        a.b === b.a ||
        a.b === b.b
      )
        continue;
      checkedCrossings.add(key);
      const p = nodes[a.a],
        q = nodes[a.b],
        u = nodes[b.a],
        v = nodes[b.b];
      const den = cross(q.x - p.x, q.y - p.y, v.x - u.x, v.y - u.y);
      if (Math.abs(den) < 1e-9) continue;
      const t = cross(u.x - p.x, u.y - p.y, v.x - u.x, v.y - u.y) / den,
        w = cross(u.x - p.x, u.y - p.y, q.x - p.x, q.y - p.y) / den;
      if (t > 1e-5 && t < 1 - 1e-5 && w > 1e-5 && w < 1 - 1e-5)
        overpasses.push({
          x: p.x + t * (q.x - p.x),
          y: p.y + t * (q.y - p.y),
          upper: a.id,
          lower: b.id,
          angle: (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI,
        });
    }
checkedCrossings.clear();
export function projectRoad(p: Point) {
  let best:
    | { point: Point; section: RoadSection; fraction: number; distance: number }
    | undefined;
  const x = Math.floor(p.x / 64),
    y = Math.floor(p.y / 64);
  for (let radius = 0; radius < 140; radius++) {
    const candidates = new Set<RoadSection>();
    for (let dx = -radius; dx <= radius; dx++)
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        for (const e of sectionGrid.get(`${x + dx}:${y + dy}`) ?? [])
          candidates.add(e);
      }
    for (const e of candidates) {
      const a = nodes[e.a],
        b = nodes[e.b],
        dx = b.x - a.x,
        dy = b.y - a.y;
      const f = Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
        ),
      );
      const point = { x: a.x + dx * f, y: a.y + dy * f },
        d = distance(p, point);
      if (!best || d < best.distance)
        best = { point, section: e, fraction: f, distance: d };
    }
    if (best && best.distance < Math.max(0, radius - 1) * 64) return best;
  }
  if (!best) throw Error("Keine Straßendaten verfügbar.");
  return best;
}
export function roadSectionBetween(a: Point, b: Point) {
  const ai = allNodeIds.get(`${a.x},${a.y}`),
    bi = allNodeIds.get(`${b.x},${b.y}`);
  return (
    (ai !== undefined && bi !== undefined
      ? sectionByPair.get(`${ai}:${bi}`)
      : undefined) ??
    projectRoad({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }).section
  );
}
function findRoute(
  a: Point,
  b: Point,
  mode: "road" | "air" | "water" = "road",
  blocked: ReadonlySet<string> = new Set(),
  maxSpeed = 120,
  delays: ReadonlyMap<string, number> = new Map(),
  timeFactor = 1,
): Point[] {
  if (mode === "air") return [a, b];
  if (mode === "water") {
    if (!isWaterSite(a) || !isWaterSite(b))
      throw Error("Boote benötigen einen Wasserzugang.");
    if (IS_RIVERMERE) {
      const project = (p: Point) => {
        let best = { point: river[0], index: 0, distance: Infinity };
        for (let i = 1; i < river.length; i++) {
          const u = river[i - 1],
            v = river[i],
            dx = v.x - u.x,
            dy = v.y - u.y;
          const t = Math.max(
            0,
            Math.min(
              1,
              ((p.x - u.x) * dx + (p.y - u.y) * dy) / (dx * dx + dy * dy),
            ),
          );
          const point = { x: u.x + dx * t, y: u.y + dy * t },
            d = distance(p, point);
          if (d < best.distance)
            best = { point, index: i - 1 + t, distance: d };
        }
        return best;
      };
      const first = project(a),
        last = project(b);
      const middle = river.filter(
        (_, i) =>
          i > Math.min(first.index, last.index) &&
          i < Math.max(first.index, last.index),
      );
      if (first.index > last.index) middle.reverse();
      return [a, first.point, ...middle, last.point, b];
    }
    return [a, { x: 1115, y: a.y }, { x: 1115, y: b.y }, b];
  }
  const start = projectRoad(a),
    goal = projectRoad(b);
  if (start.distance > 25 || goal.distance > 25)
    throw Error("Ziel hat keine erreichbare Straßenanbindung.");
  const cost = (e: RoadSection, f: number) =>
    ((e.meters * Math.abs(f)) / (Math.min(maxSpeed, e.limit) / 3.6)) *
      timeFactor +
    (Math.abs(f) > 1e-7
      ? (delays.get(e.id) ?? delays.get(`${e.b}:${e.a}`) ?? 0)
      : 0);
  const open = (e: RoadSection) =>
    !blocked.has(e.id) && !blocked.has(`${e.b}:${e.a}`);
  const directCost =
    start.section === goal.section && open(start.section)
      ? cost(start.section, goal.fraction - start.fraction)
      : Infinity;
  const starts: [number, number][] = [];
  const goals = new Map<number, number>();
  if (open(start.section) || start.fraction < 1e-7)
    starts.push([start.section.a, cost(start.section, start.fraction)]);
  if (open(start.section) || start.fraction > 1 - 1e-7)
    starts.push([start.section.b, cost(start.section, 1 - start.fraction)]);
  if (open(goal.section) || goal.fraction < 1e-7)
    goals.set(goal.section.a, cost(goal.section, goal.fraction));
  if (open(goal.section) || goal.fraction > 1 - 1e-7)
    goals.set(goal.section.b, cost(goal.section, 1 - goal.fraction));
  const result = fastestPath(
    adjacency,
    starts,
    goals,
    maxSpeed,
    blocked,
    delays,
    timeFactor,
  );
  if (directCost <= result.seconds)
    return [a, start.point, goal.point, b].filter(
      (p, i, ps) => !i || distance(p, ps[i - 1]) > 1e-7,
    );
  return [
    a,
    start.point,
    ...result.path.map((i) => nodes[i]),
    goal.point,
    b,
  ].filter((p, i, ps) => !i || distance(p, ps[i - 1]) > 1e-7);
}
const routeCache = new Map<string, Point[]>();
export function route(
  a: Point,
  b: Point,
  mode: "road" | "air" | "water" = "road",
  blocked: ReadonlySet<string> = new Set(),
  maxSpeed = 120,
  delays: ReadonlyMap<string, number> = new Map(),
  timeFactor = 1,
) {
  const key = JSON.stringify([
    a.x,
    a.y,
    b.x,
    b.y,
    mode,
    maxSpeed,
    timeFactor,
    [...blocked].sort(),
    [...delays].sort(),
  ]);
  const cached = routeCache.get(key);
  if (cached) return [...cached];
  const result = findRoute(a, b, mode, blocked, maxSpeed, delays, timeFactor);
  if (routeCache.size >= 512)
    routeCache.delete(routeCache.keys().next().value!);
  routeCache.set(key, result);
  return [...result];
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
