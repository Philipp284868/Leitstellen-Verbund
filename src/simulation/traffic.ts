import { vt } from "../catalog";
import { GermanyRoutingError } from "../germany/errors";
import type { Save, Vehicle } from "../model";
import { motionProfile } from "../motion";
import { vehicleMotion, vehiclePosition } from "../vehicle-position";
import {
  distance,
  METERS_PER_UNIT,
  roadSectionBetween,
  route,
  type Point,
} from "../world";
import type { TravelMode } from "./dynamics-schema";
import { record } from "./events";
import { DYNAMICS } from "./random";
import { remainingRoadLegs } from "./road-continuation";
import { automaticRouting } from "./routing-context";
import { roadNames, weatherAtPoint } from "./weather";
const pathSections = (path: Point[]) =>
  path
    .slice(1)
    .map((p, i) => roadSectionBetween(path[i], p))
    .filter((e) => e !== null);
const roadKeys = (e: NonNullable<Save["environment"]>["roads"][number]) =>
  e.roadId
    ? [e.roadId]
    : [`${e.edge[0]}:${e.edge[1]}`, `${e.edge[1]}:${e.edge[0]}`];
export const travelNames = {
  normal: "Normalfahrt",
  priority: "Sonderrechte",
  emergency: "Notfallfahrt",
};
export const routeWeatherKey = (s: Save) =>
  `weather-${s.environment?.period ?? 0}${s.worldSituation ? `-${s.worldSituation.id}-${s.worldSituation.phase}` : ""}`;
export function travelFactor(
  s: Save,
  v: Pick<Vehicle, "type">,
  mode: TravelMode,
  point?: Point,
) {
  const e = point ? weatherAtPoint(s, point) : s.environment;
  const urgency = 1;
  void mode;
  if (!e) return urgency;
  if (vt(v.type).mode !== "road") return urgency * (1 + e.wind / 250);
  return (
    urgency *
    (1 +
      e.density * 0.18 +
      e.rain / 250 +
      (e.visibility < 1000 ? 0.25 : 0) +
      (["snow", "ice", "frost"].includes(e.kind) ? 0.3 : 0))
  );
}
export function routePlan(
  s: Save,
  v:
    | Vehicle
    | {
        type: string;
      },
  origin: Point,
  target: Point,
  mode: TravelMode = "priority",
) {
  try {
    return calculateRoutePlan(s, v, origin, target, mode);
  } catch (error) {
    if (
      !automaticRouting() ||
      !(error instanceof GermanyRoutingError) ||
      error.code === "blocked"
    )
      throw error;
    // Keep the target and assignment, but never invent a replacement road or continue through a new closure.
    const remainder = remainingRoadLegs(s, v, origin);
    return {
      motion: motionProfile(remainder).phases,
      wait: 0,
      path: [origin],
      planned: [origin],
      plannedSeconds: 0,
      seconds: 60,
      delay: 60,
      blockedUntil: s.time + 60,
      events: [],
      reason:
        "Straßenrouting vorübergehend nicht verfügbar; Fahrzeug wartet. Neuer Versuch in 60 s.",
    };
  }
}
function calculateRoutePlan(
  s: Save,
  v:
    | Vehicle
    | {
        type: string;
      },
  origin: Point,
  target: Point,
  mode: TravelMode,
) {
  const t = vt(v.type),
    prefix = remainingRoadLegs(s, v, origin);
  const routedOrigin = prefix.at(-1)?.to ?? origin;
  const withPrefix = (path: Point[]) =>
    prefix.length
      ? [origin, ...prefix.slice(0, -1).map((leg) => leg.to), ...path]
      : path;
  const planned = withPrefix(
    route(routedOrigin, target, t.mode, new Set(), t.speed),
  );
  const events = (s.environment?.roads ?? [])
    .filter((e) => e.until > s.time)
    .map((e) => {
      // Replanning during a known wait must retain its elapsed time.
      const phases =
        "status" in v &&
        ["travel", "return", "transport"].includes(v.status) &&
        s.time < v.arrive
          ? v.journey?.motion
          : undefined;
      const elapsed = "depart" in v ? s.time - v.depart : 0;
      const wait = phases?.find(
        (p) =>
          p.velocity === 0 &&
          p.acceleration === 0 &&
          roadKeys(e).includes(p.edge),
      );
      return wait
        ? {
            ...e,
            delay: Math.max(
              0,
              Math.min(e.delay, wait.duration) -
                Math.min(wait.duration, Math.max(0, elapsed - wait.start)),
            ),
          }
        : e;
    });
  const blocked = new Set(events.filter((e) => e.blocked).flatMap(roadKeys));
  let path = planned;
  let blockedUntil = 0;
  if (
    t.mode === "air" &&
    Math.max(
      weatherAtPoint(s, origin)?.wind || 0,
      weatherAtPoint(s, target)?.wind || 0,
    ) >= 80
  ) {
    blockedUntil = (s.environment!.period + 1) * DYNAMICS.weatherPeriod;
    path = [origin];
  }
  if (t.mode === "road") {
    try {
      if (prefix.some((leg) => blocked.has(leg.edge)))
        throw new GermanyRoutingError(
          "Aktuell befahrener Straßenabschnitt gesperrt.",
          "blocked",
        );
      path = withPrefix(
        route(
          routedOrigin,
          target,
          "road",
          blocked,
          t.speed,
          new Map(
            events.flatMap((e) =>
              roadKeys(e).map((key) => [key, e.delay] as const),
            ),
          ),
          Math.max(
            travelFactor(s, v, mode, origin),
            travelFactor(s, v, mode, target),
          ),
        ),
      );
    } catch (error) {
      if (!(error instanceof GermanyRoutingError) || error.code !== "blocked")
        throw error;
      if (!blocked.size) throw error;
      blockedUntil = Math.min(
        ...events.filter((e) => e.blocked).map((e) => e.until),
      );
      path = [origin];
    }
  }
  const sections =
    t.mode === "road"
      ? pathSections(
          prefix.length && !blockedUntil ? path.slice(prefix.length) : path,
        )
      : [];
  const relevant =
    t.mode === "road"
      ? events.filter(
          (e) =>
            prefix.some((leg) => roadKeys(e).includes(leg.edge)) ||
            sections.some((section) =>
              e.roadId
                ? section.id === e.roadId
                : (section.a === e.edge[0] && section.b === e.edge[1]) ||
                  (section.a === e.edge[1] && section.b === e.edge[0]),
            ),
        )
      : [];
  const profile = (points: Point[], conditions: boolean) => {
    const paused = new Set<string>();
    return motionProfile(
      points.slice(1).map((to, i) => {
        const from = points[i],
          first =
            prefix[i] && distance(to, prefix[i].to) < 1e-7
              ? prefix[i]
              : undefined,
          road =
            t.mode === "road" && !first ? roadSectionBetween(from, to) : null;
        const waits =
          conditions && (road || first)
            ? relevant.filter(
                (e) =>
                  !paused.has(e.id) &&
                  (first
                    ? roadKeys(e).includes(first.edge)
                    : e.roadId
                      ? e.roadId === road!.id
                      : (e.edge[0] === road!.a && e.edge[1] === road!.b) ||
                        (e.edge[0] === road!.b && e.edge[1] === road!.a)),
              )
            : [];
        waits.forEach((e) => paused.add(e.id));
        return {
          from,
          to,
          meters: first
            ? first.meters
            : road
              ? road.meters
              : distance(from, to) * METERS_PER_UNIT,
          limit: first
            ? first.limit
            : Math.min(t.speed, road?.limit ?? t.speed) /
              (conditions
                ? travelFactor(s, v, mode, {
                    x: (from.x + to.x) / 2,
                    y: (from.y + to.y) / 2,
                  })
                : 1),
          edge: first?.edge ?? road?.id ?? t.mode,
          waitSeconds:
            Math.max(
              first?.waitSeconds ?? 0,
              waits.reduce((n, e) => n + e.delay, 0),
            ) +
            (road && "waitSeconds" in road ? Number(road.waitSeconds || 0) : 0),
        };
      }),
      t.mode === "road" ? (t.crew >= 6 ? 0.9 : 1.5) : 2,
      t.mode === "road" ? 2 : 3,
      conditions &&
        "status" in v &&
        ["travel", "transport", "return"].includes(v.status)
        ? vehicleMotion(v, s.time).kmh
        : 0,
    );
  };
  const baseline = profile(planned, false),
    actual = profile(
      blockedUntil && prefix.length
        ? [origin, ...prefix.map((leg) => leg.to)]
        : path,
      true,
    );
  const plannedSeconds = baseline.seconds;
  const wait = 0; // Waiting is scheduled at its affected road section in the motion profile.
  const seconds = blockedUntil ? blockedUntil - s.time : actual.seconds + wait;
  return {
    motion: actual.phases,
    wait,
    path,
    planned,
    plannedSeconds,
    seconds,
    delay: Math.max(0, seconds - plannedSeconds),
    blockedUntil,
    events: relevant.map((e) => e.id),
    reason: "",
  };
}
export function trafficTick(s: Save, v: Vehicle) {
  const j = v.journey;
  if (
    !j ||
    !["travel", "transport", "return"].includes(v.status) ||
    (v.fault && v.fault.state !== "repaired")
  )
    return;
  if (j.blockedUntil) {
    if (j.blockedUntil > s.time) return;
    const plan = routePlan(s, v, v.path[0], j.target, j.mode);
    j.motion = plan.motion;
    j.motionVersion = 1;
    j.wait = plan.wait;
    v.path = plan.path;
    v.depart = s.time;
    v.arrive = s.time + plan.seconds;
    j.blockedUntil = plan.blockedUntil;
    if (!j.plannedSeconds && !plan.blockedUntil) {
      j.planned = plan.planned;
      j.plannedSeconds = plan.plannedSeconds;
    }
    j.delay += plan.delay;
    j.reason =
      plan.reason ||
      (plan.blockedUntil
        ? "Fahrt weiterhin ausgesetzt; warte auf Freigabe"
        : "Verbindung wieder frei; Fahrt fortgesetzt");
  }
  if (s.time < j.nextCheck || s.time >= v.arrive || j.events.length >= 30)
    return;
  j.nextCheck = s.time + 60;
  j.serial++;
  if (vt(v.type).mode !== "road") return;
  const origin = vehiclePosition(v, s.time);
  const active =
    s.environment?.roads.filter(
      (e) => e.until > s.time && !j.events.includes(e.id),
    ) ?? [];
  const remainingEdges = new Set(
    (j.motion ?? [])
      .filter((phase) => phase.start + phase.duration >= s.time - v.depart)
      .map((phase) => phase.edge),
  );
  const event = active.find((e) =>
    roadKeys(e).some((key) => remainingEdges.has(key)),
  );
  const weatherKey = routeWeatherKey(s);
  const weatherChange = !j.events.includes(weatherKey);
  if (!event && !weatherChange) return;
  const plan = routePlan(s, v, origin, j.target, j.mode);
  j.distanceDone += vehicleMotion(v, s.time).meters;
  if (!plan.reason) j.events.push(event?.id ?? weatherKey);
  j.delay += Math.max(0, s.time + plan.seconds - v.arrive);
  j.blockedUntil = plan.blockedUntil;
  j.reason =
    plan.reason ||
    (event
      ? `${roadNames[event.kind]}: ${plan.blockedUntil ? "keine Umleitung; warte auf Freigabe" : "Route neu berechnet"}`
      : "Wetter und Verkehrslage geändert; Ankunft neu berechnet");
  j.motion = plan.motion;
  j.motionVersion = 1;
  j.wait = plan.wait;
  v.path = plan.path;
  v.depart = s.time;
  v.arrive = s.time + plan.seconds;
  const m = s.missions.find((m) => m.id === v.mission);
  if (m)
    record(s, m, "TRAFFIC_DELAY", `${v.name}: ${j.reason}.`, "server", v.id);
}
