/** Authored fictional composition, not surveyed geography. Units are 12 metres. */
export type XY = { x: number; y: number };
export const seed = 57180908;
export const extent = 100000 / 12;
export const settlements = [
  ["Rivermere", 50, 43, 13],
  ["Westhaven", 19, 24, 3.8],
  ["Brookdale", 83, 26, 4],
  ["Kingsley", 12, 57, 3.2],
  ["Southwell", 85, 84, 3.6],
  ["Stonebridge", 47, 5, 1.8],
  ["Pinecrest", 51, 14, 2.3],
  ["Clearwater", 66, 11, 2.1],
  ["Elden", 88, 6, 1.7],
  ["Maplewood", 17, 18, 1.4],
  ["Oakridge", 36, 27, 1.6],
  ["Milford", 93, 31, 1.5],
  ["Eastgate", 83, 39, 2.3],
  ["Redwood", 7, 41, 1.3],
  ["Lakemoor", 20, 62, 1.1],
  ["Elmcrest", 39, 69, 1.5],
  ["Hawthorne", 43, 80, 2.4],
  ["Meadowbrook", 32, 87, 1.2],
  ["Briarfield", 65, 86, 1.8],
  ["Greenhaven", 66, 68, 1.5],
  ["Ridgefield", 84, 72, 2],
  ["Fairview", 92, 57, 1.3],
  ["Marshfield", 76, 59, 1.2],
].map(([name, x, y, size], i) => ({
  id: `rm-place-${i}`,
  name: String(name),
  x: (Number(x) * extent) / 100,
  y: (Number(y) * extent) / 100,
  size: (Number(size) * extent) / 100,
}));
export const quarters = [
  ["Northgate", 50, 35],
  ["Westfield", 40, 40],
  ["Eastbrook", 60, 41],
  ["Old Town", 50, 46],
  ["Lakeside", 41, 50],
  ["Southridge", 52, 54],
  ["Harbor District", 61, 53],
].map(([name, x, y], i) => ({
  id: `rm-quarter-${i}`,
  name: String(name),
  x: (Number(x) * extent) / 100,
  y: (Number(y) * extent) / 100,
}));
const smooth = (points: XY[]) =>
  points.flatMap((b, i) => {
    if (i === points.length - 1) return [b];
    const a = points[Math.max(0, i - 1)],
      c = points[i + 1],
      d = points[Math.min(points.length - 1, i + 2)];
    return Array.from({ length: 12 }, (_, j) => {
      const t = j / 12,
        t2 = t * t,
        t3 = t2 * t;
      const part = (k: "x" | "y") =>
        0.5 *
        (2 * b[k] +
          (-a[k] + c[k]) * t +
          (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 +
          (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3);
      return { x: part("x"), y: part("y") };
    });
  });
export const river = smooth(
  [
    [58, 0],
    [56, 6],
    [53, 13],
    [50, 20],
    [52, 27],
    [53, 33],
    [52, 39],
    [49, 44],
    [54, 49],
    [61, 53],
    [60, 60],
    [57, 67],
    [56, 76],
    [58, 84],
    [58, 100],
  ].map(([x, y]) => ({ x: (x * extent) / 100, y: (y * extent) / 100 })),
);
export const tributary = smooth(
  [
    [0, 44],
    [9, 44],
    [16, 46],
    [22, 45],
    [29, 48],
    [37, 47],
    [44, 47],
    [49, 44],
  ].map(([x, y]) => ({ x: (x * extent) / 100, y: (y * extent) / 100 })),
);
export const lakes = [
  { id: "silverlake", name: "Silverlake", x: 35, y: 12, rx: 6, ry: 8 },
  { id: "cedar", name: "Cedar Lake", x: 93, y: 42, rx: 5.5, ry: 4 },
  { id: "willow", name: "Willow Lake", x: 29, y: 68, rx: 6, ry: 7 },
].map((l) => ({
  ...l,
  x: (l.x * extent) / 100,
  y: (l.y * extent) / 100,
  rx: (l.rx * extent) / 100,
  ry: (l.ry * extent) / 100,
}));
export function lakePolygon(l: (typeof lakes)[number]) {
  return Array.from({ length: 64 }, (_, i) => {
    const a = (i * Math.PI) / 32,
      r = 1 + 0.12 * Math.sin(5 * a) + 0.07 * Math.cos(9 * a);
    return { x: l.x + Math.cos(a) * l.rx * r, y: l.y + Math.sin(a) * l.ry * r };
  });
}
export function inside(p: XY, polygon: XY[]) {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      yes = !yes;
  }
  return yes;
}
export const lakePolygons = lakes.map(lakePolygon);
export const inLake = (p: XY) => lakePolygons.some((poly) => inside(p, poly));
export function segmentDistance(p: XY, a: XY, b: XY) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
export function riverDistance(p: XY) {
  return Math.min(
    ...[river, tributary].flatMap((line) =>
      line.slice(1).map((b, i) => segmentDistance(p, line[i], b)),
    ),
  );
}
export const wet = (p: XY) => inLake(p) || riverDistance(p) < 45;
export const polygonsToPath = (points: XY[], close = false) =>
  points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ") +
  (close ? "Z" : "");
export function randomSequence(initial = seed) {
  let state = initial;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
export type Spec = [string, "main" | "street" | "lane" | "country", number[][]];
/** Authored inter-town connections. Intermediate bends deliberately skirt the three lakes. */
export function roadSpecs(): Spec[] {
  const random = randomSequence(),
    specs: Spec[] = [];
  const add = (name: string, kind: Spec[1], points: XY[]) =>
    specs.push([name, kind, points.map((p) => [p.x, p.y])]);
  const place = (name: string) => {
    const t = settlements.find((s) => s.name === name)!;
    return wet(t) ? { ...t, x: t.x + 90 } : t;
  };
  const links = [
    ["Rivermere", "Oakridge"],
    ["Oakridge", "Westhaven"],
    ["Westhaven", "Maplewood"],
    ["Westhaven", "Redwood"],
    ["Redwood", "Kingsley"],
    ["Kingsley", "Lakemoor"],
    ["Rivermere", "Kingsley"],
    ["Rivermere", "Pinecrest"],
    ["Pinecrest", "Stonebridge"],
    ["Pinecrest", "Clearwater"],
    ["Clearwater", "Elden"],
    ["Clearwater", "Brookdale"],
    ["Elden", "Brookdale"],
    ["Brookdale", "Milford"],
    ["Brookdale", "Eastgate"],
    ["Rivermere", "Eastgate"],
    ["Eastgate", "Marshfield"],
    ["Marshfield", "Fairview"],
    ["Fairview", "Ridgefield"],
    ["Ridgefield", "Southwell"],
    ["Rivermere", "Elmcrest"],
    ["Elmcrest", "Hawthorne"],
    ["Hawthorne", "Meadowbrook"],
    ["Hawthorne", "Briarfield"],
    ["Briarfield", "Southwell"],
    ["Briarfield", "Greenhaven"],
    ["Greenhaven", "Ridgefield"],
    ["Greenhaven", "Marshfield"],
    ["Rivermere", "Greenhaven"],
  ];
  for (const [a, b] of links) {
    const first = place(a),
      last = place(b),
      dx = last.x - first.x,
      dy = last.y - first.y;
    const points = [
      first,
      ...[0.25, 0.5, 0.75].map((t) => ({
        x: first.x + dx * t - dy * 0.045 * Math.sin(t * Math.PI),
        y: first.y + dy * t + dx * 0.045 * Math.sin(t * Math.PI),
      })),
      last,
    ];
    add(`${a} – ${b}`, "country", points);
  }
  for (const [si, town] of settlements.entries()) {
    const city = si === 0,
      count = city ? 1150 : 45 + Math.round(town.size / 10);
    const points: XY[] = [place(town.name)];
    for (
      let attempt = 0;
      points.length < count && attempt < count * 25;
      attempt++
    ) {
      const angle = random() * Math.PI * 2,
        radius =
          town.size *
          Math.sqrt(random()) *
          (0.9 + 0.13 * Math.sin(angle * 3 + si));
      const p = {
        x: town.x + Math.cos(angle) * radius,
        y: town.y + Math.sin(angle) * radius * 0.87,
      };
      if (
        wet(p) ||
        riverDistance(p) < 65 ||
        points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < (city ? 30 : 14))
      )
        continue;
      points.push(p);
    }
    const candidates: { a: number; b: number; d: number }[] = [];
    for (let a = 0; a < points.length; a++) {
      const nearby = points
        .map((p, b) => ({
          a,
          b,
          d: Math.hypot(p.x - points[a].x, p.y - points[a].y),
        }))
        .filter((e) => e.b !== a)
        .sort((a, b) => a.d - b.d)
        .slice(0, 7);
      for (const e of nearby) if (e.b > a) candidates.push(e);
    }
    candidates.sort((a, b) => a.d - b.d || a.a - b.a || a.b - b.b);
    const roots = points.map((_, i) => i),
      degree = points.map(() => 0),
      selected: typeof candidates = [];
    const root = (i: number): number =>
      roots[i] === i ? i : (roots[i] = root(roots[i]));
    const crosses = (a: XY, b: XY, c: XY, d: XY) => {
      const side = (p: XY, q: XY, r: XY) =>
        (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
      return (
        side(a, b, c) * side(a, b, d) < -1e-6 &&
        side(c, d, a) * side(c, d, b) < -1e-6
      );
    };
    for (const e of candidates) {
      const a = points[e.a],
        b = points[e.b],
        joins = root(e.a) !== root(e.b);
      if (!joins && (degree[e.a] >= 3 || degree[e.b] >= 3 || random() < 0.3))
        continue;
      if (
        selected.some(
          (q) =>
            q.a !== e.a &&
            q.a !== e.b &&
            q.b !== e.a &&
            q.b !== e.b &&
            crosses(a, b, points[q.a], points[q.b]),
        )
      )
        continue;
      if (
        Array.from({ length: 20 }, (_, i) => ({
          x: a.x + ((b.x - a.x) * i) / 19,
          y: a.y + ((b.y - a.y) * i) / 19,
        })).some((p) => inLake(p) || riverDistance(p) < 55)
      )
        continue;
      selected.push(e);
      degree[e.a]++;
      degree[e.b]++;
      roots[root(e.a)] = root(e.b);
    }
    for (const [i, e] of selected.entries())
      add(
        `${town.name} ${i % 9 === 0 ? "Allee" : "Straße"} ${i + 1}`,
        i % 9 === 0 ? "main" : i % 3 === 0 ? "lane" : "street",
        [points[e.a], points[e.b]],
      );
  }
  // Prevent lake crossings in generated settlement streets (rivers have explicit bridge spans).
  return specs.filter(([, , ps]) =>
    ps.slice(1).every((b, i) =>
      Array.from({ length: 41 }, (_, n) => ({
        x: ps[i][0] + ((b[0] - ps[i][0]) * n) / 40,
        y: ps[i][1] + ((b[1] - ps[i][1]) * n) / 40,
      })).every(
        (p) => !inLake(p) && p.x > 0 && p.y > 0 && p.x < extent && p.y < extent,
      ),
    ),
  );
}
