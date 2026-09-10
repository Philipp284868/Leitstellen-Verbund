/** Coordinate shape shared by rendering, spatial queries and simulation. */
export interface Point {
  x: number;
  y: number;
}

export function polylineLength(
  path: readonly Point[],
  distance: (a: Point, b: Point) => number,
) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distance(path[i - 1], path[i]);
  return total;
}
export function pointAlong(
  path: readonly Point[],
  fraction: number,
  distance: (a: Point, b: Point) => number,
): Point {
  let left =
    polylineLength(path, distance) * Math.max(0, Math.min(1, fraction));
  for (let i = 1; i < path.length; i++) {
    const segment = distance(path[i - 1], path[i]);
    if (left <= segment) {
      const ratio = segment ? left / segment : 0;
      return {
        x: path[i - 1].x + (path[i].x - path[i - 1].x) * ratio,
        y: path[i - 1].y + (path[i].y - path[i - 1].y) * ratio,
      };
    }
    left -= segment;
  }
  const last = path.at(-1);
  if (!last) throw Error("Fahrzeugroute hat keine Position.");
  return last;
}
