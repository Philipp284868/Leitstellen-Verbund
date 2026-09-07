import { motionProfile } from "../motion";
import { vehiclePosition, vehicleMotion } from "../vehicle-position";
import { roadSectionBetween, distance } from "../world";
import type { Save, Vehicle } from "../model";
import { vt } from "../catalog";
import { route, METERS_PER_UNIT, type Point } from "../world";
import type { TravelMode } from "./dynamics-schema";
import { DYNAMICS } from "./random";
import { record } from "./events";
import { roadNames } from "./weather";
const pathSections = (path: Point[]) =>
  path
    .slice(1)
    .map((p, i) => roadSectionBetween(path[i], p))
    .filter((e) => e !== null);
export const travelNames = {
  normal: "Normalfahrt",
  priority: "Sonderrechte",
  emergency: "Notfallfahrt",
};
export function travelFactor(
  s: Save,
  v: Pick<Vehicle, "type">,
  mode: TravelMode,
) {
  const e = s.environment;
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
  v: Vehicle | { type: string },
  origin: Point,
  target: Point,
  mode: TravelMode = "priority",
) {
  const t = vt(v.type),
    planned = route(origin, target, t.mode, new Set(), t.speed);
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
          (p.edge === `${e.edge[0]}:${e.edge[1]}` ||
            p.edge === `${e.edge[1]}:${e.edge[0]}`),
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
  const blocked = new Set(
    events
      .filter((e) => e.blocked)
      .flatMap((e) => [
        `${e.edge[0]}:${e.edge[1]}`,
        `${e.edge[1]}:${e.edge[0]}`,
      ]),
  );
  let path = planned;
  let blockedUntil = 0;
  if (t.mode === "air" && (s.environment?.wind || 0) >= 80) {
    blockedUntil = (s.environment!.period + 1) * DYNAMICS.weatherPeriod;
    path = [origin];
  }
  if (t.mode === "road") {
    try {
      path = route(
        origin,
        target,
        "road",
        blocked,
        t.speed,
        new Map(
          events.flatMap((e) => [
            [`${e.edge[0]}:${e.edge[1]}`, e.delay] as const,
            [`${e.edge[1]}:${e.edge[0]}`, e.delay] as const,
          ]),
        ),
        travelFactor(s, v, mode),
      );
    } catch (error) {
      if (!blocked.size) throw error;
      blockedUntil = Math.min(
        ...events.filter((e) => e.blocked).map((e) => e.until),
      );
      path = [origin];
    }
  }
  const sections = t.mode === "road" ? pathSections(path) : [];
  const relevant =
    t.mode === "road"
      ? events.filter((e) =>
          sections.some(
            (section) =>
              (section.a === e.edge[0] && section.b === e.edge[1]) ||
              (section.a === e.edge[1] && section.b === e.edge[0]),
          ),
        )
      : [];
  const profile = (points: Point[], conditions: boolean) => {
    const paused = new Set<string>();
    return motionProfile(
      points.slice(1).map((to, i) => {
        const from = points[i],
          road = t.mode === "road" ? roadSectionBetween(from, to) : null;
        const waits =
          conditions && road
            ? relevant.filter(
                (e) =>
                  !paused.has(e.id) &&
                  ((e.edge[0] === road.a && e.edge[1] === road.b) ||
                    (e.edge[0] === road.b && e.edge[1] === road.a)),
              )
            : [];
        waits.forEach((e) => paused.add(e.id));
        return {
          from,
          to,
          meters: distance(from, to) * METERS_PER_UNIT,
          limit:
            Math.min(t.speed, road?.limit ?? t.speed) /
            (conditions ? travelFactor(s, v, mode) : 1),
          edge: road?.id ?? t.mode,
          waitSeconds: waits.reduce((n, e) => n + e.delay, 0),
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
    actual = profile(path, true);
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
    j.delay += plan.delay;
    j.reason = plan.blockedUntil
      ? "Fahrt weiterhin ausgesetzt; warte auf Freigabe"
      : "Verbindung wieder frei; Fahrt fortgesetzt";
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
  let passed = 0;
  const covered = vehicleMotion(v, s.time).meters;
  const remaining = v.path.filter((p, i) => {
    if (i) passed += distance(v.path[i - 1], p) * METERS_PER_UNIT;
    return passed > covered;
  });
  const sections = pathSections([origin, ...remaining]);
  const event = active.find((e) =>
    sections.some(
      (section) =>
        (section.a === e.edge[0] && section.b === e.edge[1]) ||
        (section.a === e.edge[1] && section.b === e.edge[0]),
    ),
  );
  const weatherKey = `weather-${s.environment?.period ?? 0}`;
  const weatherChange = !j.events.includes(weatherKey);
  if (!event && !weatherChange) return;
  j.distanceDone += vehicleMotion(v, s.time).meters;
  const plan = routePlan(s, v, origin, j.target, j.mode);
  j.events.push(event?.id ?? weatherKey);
  j.delay += Math.max(0, s.time + plan.seconds - v.arrive);
  j.blockedUntil = plan.blockedUntil;
  j.reason = event
    ? `${roadNames[event.kind]}: ${plan.blockedUntil ? "keine Umleitung; warte auf Freigabe" : "Route neu berechnet"}`
    : "Wetter und Verkehrslage geändert; Ankunft neu berechnet";
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
