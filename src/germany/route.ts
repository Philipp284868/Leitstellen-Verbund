import { project, meters, type Point } from "./projection";

/** Each pair of geometry points retains the routing engine's exact edge identity. */
export interface GermanyLeg {
  from: Point;
  to: Point;
  meters: number;
  limit: number;
  legalLimit: number | null;
  edge: string;
  name: string;
  roadClass: string;
  bridge: boolean;
  tunnel: boolean;
  waitSeconds: number;
}
export interface GermanyRoute {
  dataset: string;
  path: Point[];
  legs: GermanyLeg[];
  meters: number;
  routerSeconds: number;
}
type Detail = [number, number, unknown];
type Path = {
  distance: number;
  time: number;
  points: { type: string; coordinates: number[][] };
  details: Record<string, Detail[]>;
};
function pathFrom(raw: unknown): Path {
  if (
    !raw ||
    typeof raw !== "object" ||
    !("paths" in raw) ||
    !Array.isArray(raw.paths)
  )
    throw Error("Routingdienst liefert keine Route.");
  const p = raw.paths[0] as Path | undefined;
  if (
    !p ||
    !Number.isFinite(p.distance) ||
    p.distance < 0 ||
    !Number.isFinite(p.time) ||
    p.time < 0 ||
    p.points?.type !== "LineString" ||
    !Array.isArray(p.points.coordinates) ||
    !p.details
  )
    throw Error("Ungültige Antwort des Routingdienstes.");
  if (p.points.coordinates.length > 200000)
    throw Error("Route überschreitet die unterstützte Geometriegröße.");
  for (const c of p.points.coordinates)
    if (
      !Array.isArray(c) ||
      c.length < 2 ||
      !c.slice(0, 2).every(Number.isFinite) ||
      Math.abs(c[0]) > 180 ||
      Math.abs(c[1]) > 90
    )
      throw Error("Ungültige Routenkoordinaten.");
  return p;
}
/** GraphHopper details are half-open geometry intervals; zero-width turn times are retained. */
export function adaptGraphHopperRoute(
  raw: unknown,
  dataset: string,
  vehicleMaxSpeed = 400,
): GermanyRoute {
  const p = pathFrom(raw),
    path = p.points.coordinates.map(([lon, lat]) => project({ lon, lat }));
  if (!path.length) throw Error("Routingdienst liefert eine leere Geometrie.");
  // GH11 returns two identical snapped coordinates and no edge details for a zero-length route.
  // This validates a location without inventing a traversed road segment.
  if (
    p.distance === 0 &&
    p.time === 0 &&
    path.every((point) => point.x === path[0].x && point.y === path[0].y)
  )
    return { dataset, path: [path[0]], legs: [], meters: 0, routerSeconds: 0 };
  const count = path.length - 1;
  const expand = (key: string, required: boolean) => {
    const values = new Array<unknown>(count);
    for (const row of p.details[key] ?? []) {
      if (
        !Array.isArray(row) ||
        row.length !== 3 ||
        !Number.isInteger(row[0]) ||
        !Number.isInteger(row[1]) ||
        row[0] < 0 ||
        row[1] < row[0] ||
        row[1] > count
      )
        throw Error(`Ungültige Routingdetails: ${key}.`);
      for (let i = row[0]; i < row[1]; i++) {
        if (values[i] !== undefined)
          throw Error(`Überlappende Routingdetails: ${key}.`);
        values[i] = row[2];
      }
    }
    if (
      required &&
      Array.from({ length: count }, (_, i) => values[i]).some(
        (v) => v === undefined,
      )
    )
      throw Error(`Unvollständige Routingdetails: ${key}.`);
    return values;
  };
  const ids = expand("edge_id", true),
    speeds = expand("average_speed", true),
    baseSpeeds = expand("car_average_speed", true),
    limits = expand("max_speed", true),
    names = expand("street_name", true),
    classes = expand("road_class", true),
    environments = expand("road_environment", false);
  const lengths = path.slice(1).map((to, i) => meters(path[i], to));
  const waits = new Array<number>(count).fill(0);
  // Router uses the fixed base car profile; subtract its uncapped speed before applying vehicle limits.
  const timeCoverage = new Array<boolean>(count).fill(false);
  for (const row of p.details.time ?? []) {
    const [from, to, ms] = row;
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to < from ||
      to > count ||
      typeof ms !== "number" ||
      !Number.isFinite(ms) ||
      ms < 0
    )
      throw Error("Ungültige abschnittsbezogene Fahrzeiten.");
    let moving = 0;
    for (let i = from; i < to; i++) {
      const rawSpeed = baseSpeeds[i];
      const speed = typeof rawSpeed === "number" ? rawSpeed : NaN;
      if (typeof speed !== "number" || !Number.isFinite(speed) || speed <= 0)
        throw Error("Nicht befahrbarer Straßenabschnitt.");
      if (timeCoverage[i])
        throw Error("Überlappende abschnittsbezogene Fahrzeiten.");
      moving += lengths[i] / (speed / 3.6);
      timeCoverage[i] = true;
    }
    const residual = ms / 1000 - moving;
    // OSM coordinate precision and millisecond rounding must not create a stop at every edge.
    if (count && residual > Math.max(0.1, moving * 0.001))
      waits[Math.min(from, count - 1)] += residual;
  }
  if (timeCoverage.some((covered) => !covered))
    throw Error("Unvollständige abschnittsbezogene Fahrzeiten.");
  const legs = path.slice(1).map((to, i): GermanyLeg => {
    const edge = ids[i],
      rawSpeed = baseSpeeds[i],
      speed =
        typeof rawSpeed === "number"
          ? Math.min(rawSpeed, vehicleMaxSpeed)
          : NaN,
      legal = limits[i];
    if (
      typeof edge !== "number" ||
      !Number.isSafeInteger(edge) ||
      edge < 0 ||
      !Number.isFinite(speed) ||
      speed <= 0
    )
      throw Error("Ungültige Straßenidentität oder Abschnittsgeschwindigkeit.");
    const legalLimit =
      typeof legal === "number" && Number.isFinite(legal) && legal > 0
        ? legal
        : null;
    if (
      speeds[i] !== null &&
      (typeof speeds[i] !== "number" ||
        !Number.isFinite(speeds[i]) ||
        (speeds[i] as number) < 0)
    )
      throw Error("Ungültige mittlere Abschnittsgeschwindigkeit.");
    return {
      from: path[i],
      to,
      meters: lengths[i],
      limit: Math.min(speed, legalLimit ?? speed),
      legalLimit,
      edge: `gh:${dataset}:${edge}`,
      name: typeof names[i] === "string" ? names[i] : "Unbenannte Straße",
      roadClass: String(classes[i] ?? "OTHER").toLowerCase(),
      bridge: String(environments[i] ?? "").toLowerCase() === "bridge",
      tunnel: String(environments[i] ?? "").toLowerCase() === "tunnel",
      waitSeconds: waits[i],
    };
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  if (Math.abs(total - p.distance) > Math.max(20, p.distance * 0.015))
    throw Error(
      "Routinggeometrie und gemeldete Straßenlänge stimmen nicht überein.",
    );
  return { dataset, path, legs, meters: total, routerSeconds: p.time / 1000 };
}

export function graphHopperRequest(
  from: { lon: number; lat: number },
  to: { lon: number; lat: number },
  maxSpeed: number,
) {
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0 || maxSpeed > 400)
    throw Error("Ungültige Fahrzeuggeschwindigkeit.");
  // A fixed fastest-car route keeps the prepared landmark heuristic effective nationwide.
  // Vehicle/legal speed limits are applied to the analytic motion profile, never as a timing-dependent fallback.
  return {
    profile: "car",
    points: [
      [from.lon, from.lat],
      [to.lon, to.lat],
    ],
    points_encoded: false,
    instructions: false,
    calc_points: true,
    elevation: false,
    way_point_max_distance: 0,
    "ch.disable": true,
    "lm.disable": false,
    "lm.active_landmarks": 16,
    details: [
      "edge_id",
      "time",
      "average_speed",
      "car_average_speed",
      "max_speed",
      "street_name",
      "road_class",
      "road_environment",
    ],
    timeout_ms: 8500,
  };
}
