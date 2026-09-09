import type { Save, Vehicle, Building } from "../model";
import {
  along,
  distance,
  METERS_PER_UNIT,
  nodes,
  route,
  roadSectionBetween,
  type Point,
} from "../world";
import { motionAt, motionProfile } from "../motion";
import { sample } from "./random";
import { injuryReason } from "./responder-recovery";
import type { Duty } from "./organizations-schema";

type Person = Save["people"][number];
type Arrival = NonNullable<Vehicle["turnout"]>["arrivals"][number];
function volunteerSeed(s: Save) {
  let seed = 2166136261;
  for (const char of s.generation)
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return seed;
}

/** Fixed regional calendar: deterministic on every host, including replay. */
export function volunteerCalendar(time: number) {
  const date = new Date((time + 3600) * 1000),
    hour = date.getUTCHours(),
    day = date.getUTCDay();
  const monthDay = `${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  // National fixed holidays; Easter-based national holidays are calculated below.
  const year = date.getUTCFullYear(),
    a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100;
  const d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31),
    easterDay = ((h + l - 7 * m + 114) % 31) + 1;
  const daysFromEaster = Math.round(
    (Date.UTC(year, date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(year, month - 1, easterDay)) /
      86400000,
  );
  const holiday =
    ["1-1", "5-1", "10-3", "12-25", "12-26"].includes(monthDay) ||
    [-2, 1, 39, 50].includes(daysFromEaster);
  return {
    hour,
    weekend: day === 0 || day === 6,
    holiday,
    work: day > 0 && day < 6 && !holiday && hour >= 8 && hour < 17,
  };
}

export function volunteerAvailability(s: Save, p: Person, duty: Duty) {
  if (injuryReason(s, p)) return false;
  if (p.training || p.ready > s.time) return false;
  if (duty.simulationOverride && duty.simulationOverride.until > s.time)
    return duty.simulationOverride.available;
  if (s.staffing?.version === 1) return true;
  const seed = volunteerSeed(s),
    calendar = volunteerCalendar(s.time),
    bucket = Math.floor(s.time / 1800);
  // Stable personal work patterns and a stable half-hour response draw prevent
  // repeated alarms from rerolling the same member's private availability.
  const worksLocally = sample(seed, `volunteer-local-work:${p.id}`) < 0.45;
  let probability = calendar.work
    ? worksLocally
      ? 0.81
      : 0.49
    : calendar.weekend || calendar.holiday
      ? 0.9
      : 0.93;
  if (calendar.hour < 6 || calendar.hour >= 23) probability -= 0.06;
  if (
    ["storm", "gale", "hurricane", "ice", "snow"].includes(
      s.environment?.kind ?? "",
    )
  )
    probability -= 0.08;
  if ((s.environment?.density ?? 0) > 1.2) probability -= 0.07;
  if (
    sample(seed, `volunteer-absence:${p.id}`, Math.floor(s.time / 86400)) <
    0.035
  )
    return false;
  return sample(seed, `volunteer-response:${p.id}`, bucket) < probability;
}

/** Real road geometry; all NPCs currently use a private car without special rights. */
export function volunteerArrival(
  s: Save,
  p: Person,
  duty: Duty,
  b: Building,
): Arrival {
  const failure: Arrival = {
    person: p.id,
    at: s.time + 600,
    available: false,
    reason: "Keine Rückmeldung auf den Alarm",
  };
  if (!volunteerAvailability(s, p, duty)) return failure;
  const calendar = volunteerCalendar(s.time);
  const origin = nodes[calendar.work ? duty.workNode : duty.homeNode];
  if (!origin) return failure;
  const reaction =
    (calendar.hour < 6 || calendar.hour >= 23 ? 75 : 20) +
    Math.floor(
      sample(
        volunteerSeed(s),
        `volunteer-reaction:${p.id}`,
        Math.floor(s.time / 1800),
      ) * 70,
    );
  try {
    const roads = (s.environment?.roads ?? []).filter((r) => r.until > s.time);
    const keys = (r: (typeof roads)[number]) =>
      r.roadId
        ? [r.roadId]
        : [`${r.edge[0]}:${r.edge[1]}`, `${r.edge[1]}:${r.edge[0]}`];
    const blocked = new Set(roads.filter((r) => r.blocked).flatMap(keys));
    const delay = new Map(
      roads.flatMap((r) => keys(r).map((key) => [key, r.delay] as const)),
    );
    const factor =
      1 +
      (s.environment?.rain ?? 0) / 180 +
      (s.environment?.density ?? 0) * 0.2 +
      (["ice", "snow"].includes(s.environment?.kind ?? "") ? 0.4 : 0);
    const path = route(origin, b.pos, "road", blocked, 50, delay, factor);
    const waited = new Set<string>();
    const profile = motionProfile(
      path.slice(1).map((to, index) => {
        const from = path[index],
          road = roadSectionBetween(from, to);
        const waits = road
          ? roads.filter(
              (event) =>
                !waited.has(event.id) &&
                (event.roadId
                  ? event.roadId === road.id
                  : (event.edge[0] === road.a && event.edge[1] === road.b) ||
                    (event.edge[0] === road.b && event.edge[1] === road.a)),
            )
          : [];
        waits.forEach((event) => waited.add(event.id));
        return {
          from,
          to,
          meters: road?.meters ?? distance(from, to) * METERS_PER_UNIT,
          limit: Math.min(50, road?.limit ?? 50) / factor,
          edge: road?.id ?? "private-road",
          waitSeconds:
            waits.reduce((seconds, event) => seconds + event.delay, 0) +
            (road && "waitSeconds" in road ? Number(road.waitSeconds || 0) : 0),
        };
      }),
    );
    const depart = s.time + reaction;
    return {
      person: p.id,
      depart,
      at: depart + profile.seconds,
      available: true,
      reason: "Auf dem Weg zur Wache",
      path,
      motion: profile.phases,
    };
  } catch {
    return { ...failure, reason: "Anreise zur Wache derzeit nicht möglich" };
  }
}

export function volunteerPosition(
  arrival: Arrival,
  time: number,
): Point | null {
  if (
    !arrival.available ||
    !arrival.path?.length ||
    arrival.depart === undefined ||
    time < arrival.depart ||
    time >= arrival.at
  )
    return null;
  const motion =
    arrival.motion && motionAt(arrival.motion, time - arrival.depart);
  return (
    motion?.position ??
    along(
      arrival.path,
      Math.max(
        0,
        Math.min(
          1,
          (time - arrival.depart) / Math.max(1, arrival.at - arrival.depart),
        ),
      ),
    )
  );
}

export function volunteerMarkers(s: Save, time = s.time) {
  return s.vehicles
    .filter((v) => v.status === "alarmed")
    .flatMap((v) =>
      (v.turnout?.arrivals ?? []).flatMap((arrival, index) => {
        const pos = volunteerPosition(arrival, time);
        return pos
          ? [
              {
                id: `volunteer:${v.id}:${index}`,
                home: v.home,
                vehicle: v.id,
                pos,
                name: `FF-Anfahrt zur Wache · Ankunft in ${Math.max(1, Math.ceil(arrival.at - time))} s`,
              },
            ]
          : [];
      }),
    );
}

/** Only the isolated admin laboratory calls this helper. No normal action accepts it. */
export function forceVolunteerAvailability(
  s: Save,
  available: boolean,
  seconds = 3600,
) {
  for (const p of s.people)
    if (
      p.duty &&
      s.buildings.find((b) => b.id === p.home)?.organization?.kind === "ff"
    )
      p.duty.simulationOverride = { available, until: s.time + seconds };
}
