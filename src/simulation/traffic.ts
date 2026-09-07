import type { Save, Vehicle } from "../model";
import { vt } from "../catalog";
import {
  route,
  length,
  along,
  nearest,
  nodes,
  METERS_PER_UNIT,
  type Point,
} from "../world";
import type { TravelMode } from "./dynamics-schema";
import { sample, DYNAMICS } from "./random";
import { record } from "./events";
import { roadNames } from "./weather";
const nodeIds = new Map(nodes.map((p, i) => [`${p.x}:${p.y}`, i]));
const pathIds = (path: Point[]) =>
  path.map((p) => nodeIds.get(`${p.x}:${p.y}`) ?? nearest(p));
export const travelNames = {
  normal: "Normalfahrt",
  priority: "Sonderrechte",
  emergency: "Notfallfahrt",
};
export function travelFactor(s: Save, v: Vehicle, mode: TravelMode) {
  const e = s.environment;
  const urgency = mode === "normal" ? 1.2 : mode === "emergency" ? 0.9 : 1;
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
  v: Vehicle,
  origin: Point,
  target: Point,
  mode: TravelMode = "priority",
) {
  const t = vt(v.type),
    planned = route(origin, target, t.mode);
  const events = (s.environment?.roads ?? []).filter((e) => e.until > s.time);
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
  if (t.mode === "road" && blocked.size) {
    try {
      path = route(origin, target, "road", blocked);
    } catch {
      blockedUntil = Math.max(
        s.time,
        ...events.filter((e) => e.blocked).map((e) => e.until),
      );
      path = [origin];
    }
  }
  const ids = pathIds(path);
  const relevant =
    t.mode === "road"
      ? events.filter((e) =>
          ids.some(
            (id, i) =>
              i > 0 &&
              ((ids[i - 1] === e.edge[0] && id === e.edge[1]) ||
                (ids[i - 1] === e.edge[1] && id === e.edge[0])),
          ),
        )
      : [];
  const plannedSeconds = Math.max(
    3,
    (length(planned) * METERS_PER_UNIT) / (t.speed / 3.6),
  );
  const driving = Math.max(
    3,
    ((length(path) * METERS_PER_UNIT) / (t.speed / 3.6)) *
      travelFactor(s, v, mode),
  );
  const seconds = blockedUntil
    ? blockedUntil - s.time
    : driving + relevant.reduce((n, e) => n + e.delay, 0);
  return {
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
  const serial = j.serial++;
  if (vt(v.type).mode !== "road") return;
  const origin = along(
    v.path,
    (s.time - v.depart) / Math.max(1, v.arrive - v.depart),
  );
  const active =
    s.environment?.roads.filter(
      (e) => e.until > s.time && !j.events.includes(e.id),
    ) ?? [];
  const ids = pathIds(route(origin, j.target, "road"));
  const event = active.find((e) =>
    ids.some(
      (id, i) =>
        i > 0 &&
        ((id === e.edge[0] && ids[i - 1] === e.edge[1]) ||
          (id === e.edge[1] && ids[i - 1] === e.edge[0])),
    ),
  );
  const randomDelay =
    !!s.missions.find((m) => m.id === v.mission)?.dynamics?.active &&
    sample(s.seed, `traffic-${v.id}`, serial) < DYNAMICS.trafficChance;
  const weatherKey = `weather-${s.environment?.period ?? 0}`;
  const weatherChange = !j.events.includes(weatherKey);
  if (!event && !randomDelay && !weatherChange) return;
  j.distanceDone +=
    length(v.path) *
    METERS_PER_UNIT *
    Math.max(
      0,
      Math.min(1, (s.time - v.depart) / Math.max(1, v.arrive - v.depart)),
    );
  const plan = routePlan(s, v, origin, j.target, j.mode);
  const extra =
    event || weatherChange
      ? 0
      : 30 + Math.floor(sample(s.seed, `delay-${v.id}`, serial) * 45);
  j.events.push(event?.id ?? (weatherChange ? weatherKey : `delay-${serial}`));
  j.delay += Math.max(0, s.time + plan.seconds + extra - v.arrive);
  j.blockedUntil = plan.blockedUntil;
  j.reason = event
    ? `${roadNames[event.kind]}: ${plan.blockedUntil ? "keine Umleitung; warte auf Freigabe" : "Route neu berechnet"}`
    : weatherChange
      ? "Wetter und Verkehrslage geändert; Ankunft neu berechnet"
      : `Dichter Verkehr: ${extra} Sekunden Verzögerung`;
  v.path = plan.path;
  v.depart = s.time;
  v.arrive = s.time + plan.seconds + extra;
  const m = s.missions.find((m) => m.id === v.mission);
  if (m)
    record(s, m, "TRAFFIC_DELAY", `${v.name}: ${j.reason}.`, "server", v.id);
}
