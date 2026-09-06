export const WORLD = "falkenried-1";
export interface Point {
  x: number;
  y: number;
}
export const districts = [
  { name: "ALTSTADT", x: 400, y: 290 },
  { name: "NORDHÖHE", x: 350, y: 120 },
  { name: "WESTEND", x: 120, y: 380 },
  { name: "GEWERBEPARK", x: 760, y: 260 },
  { name: "SÜDSTADT", x: 380, y: 610 },
  { name: "HAFENVIERTEL", x: 780, y: 610 },
  { name: "FALKENFORST", x: 1050, y: 140 },
  { name: "AM SEE", x: 1090, y: 610 },
];
export const nodes: Point[] = Array.from({ length: 117 }, (_, i) => ({
  x: 60 + (i % 13) * 95,
  y: 65 + Math.floor(i / 13) * 85,
}));
export const nearest = (p: Point) =>
  nodes.reduce(
    (a, n, i) => (distance(n, p) < distance(nodes[a], p) ? i : a),
    0,
  );
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const edges = nodes.flatMap((_, i) => [
  ...(i % 13 < 12 ? [[i, i + 1]] : []),
  ...(i < 104 ? [[i, i + 13]] : []),
]);
export const publicHospital = nodes[58];
export const docks = [nodes[76], nodes[89], nodes[102]];
export const isWaterSite = (p: Point) => docks.some((d) => distance(d, p) < 55);
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
    for (const e of edges) {
      const n = e[0] === current ? e[1] : e[1] === current ? e[0] : -1;
      if (n < 0) continue;
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
