/** Reusable deterministic time-cost Dijkstra; directional adjacency is authoritative. */
export type Link = {
  to: number;
  meters: number;
  limit: number;
  id: string;
  allowed: boolean;
};
export function fastestPath(
  graph: Link[][],
  starts: [number, number][],
  goals: Map<number, number>,
  maxSpeed: number,
  blocked: ReadonlySet<string>,
  delays: ReadonlyMap<string, number> = new Map(),
  timeFactor = 1,
) {
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0)
    throw Error("Ungültige Fahrzeuggeschwindigkeit.");
  if (!Number.isFinite(timeFactor) || timeFactor <= 0)
    throw Error("Ungültiger Verkehrsfaktor.");
  const heap: [number, number][] = [],
    costs = new Map<number, number>(),
    previous = new Map<number, number>();
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= item[0]) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = item;
  };
  const pop = () => {
    const result = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1;
        if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++;
        if (heap[c][0] >= last[0]) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = last;
    }
    return result;
  };
  for (const [id, cost] of starts) {
    if (cost < (costs.get(id) ?? Infinity)) {
      costs.set(id, cost);
      push([cost, id]);
    }
  }
  let best = Infinity,
    end = -1;
  while (heap.length) {
    const [cost, id] = pop();
    if (cost !== costs.get(id)) continue;
    if (cost > best) break;
    if (goals.has(id) && cost + goals.get(id)! < best) {
      best = cost + goals.get(id)!;
      end = id;
    }
    for (const e of graph[id]) {
      if (!e.allowed || blocked.has(e.id) || e.limit <= 0) continue;
      if (
        !Number.isFinite(e.meters) ||
        e.meters < 0 ||
        !Number.isFinite(delays.get(e.id) ?? 0) ||
        (delays.get(e.id) ?? 0) < 0
      )
        throw Error("Ungültige Routingkosten.");
      const next =
        cost +
        (e.meters / (Math.min(maxSpeed, e.limit) / 3.6)) * timeFactor +
        (delays.get(e.id) ?? 0);
      if (next < (costs.get(e.to) ?? Infinity)) {
        costs.set(e.to, next);
        previous.set(e.to, id);
        push([next, e.to]);
      }
    }
  }
  if (end < 0) throw Error("Kein erreichbarer Straßenweg.");
  const path = [end];
  while (previous.has(path[0])) path.unshift(previous.get(path[0])!);
  return { path, seconds: best };
}
