import type { Alarm } from "./schema";
import type { Save, Vehicle, Building } from "../model";
import { bt, vt, BALANCE } from "../catalog";
import { nodes, nearest, distance } from "../world";
import { setFms } from "./fms";
import { record } from "./events";
import { request } from "./incidents";
import { recall } from "../engine";
import type { Station, Duty } from "./organizations-schema";
import { IS_GERMANY } from "../world-choice";
import { querySites } from "../germany/world";
import { volunteerArrival, volunteerAvailability } from "./volunteers";
import { injuryReason } from "./responder-recovery";

export const absenceNames = {
  none: "Verfügbar",
  vacation: "Urlaub",
  ill: "Krank",
  training: "Fortbildung",
  unreachable: "Nicht erreichbar",
  asleep: "Verschlafen",
  unavailable: "Nicht verfügbar",
};
export const roleNames = {
  crew: "Einsatzkraft",
  driver: "Maschinist / Fahrer",
  leader: "Führungskraft",
};
export const PROFESSIONAL_FIRE = {
  level: 6,
  price: 240000,
  seconds: BALANCE.upgradeSeconds * 3,
} as const;
type Person = Save["people"][number];

/** Missing profiles are historical BF saves. New stations explicitly use newStationProfile. */
export function stationProfile(b: Building): Station {
  return (
    b.organization ?? {
      kind:
        b.type === "fire"
          ? "bf"
          : b.type === "heli"
            ? "ems"
            : (b.type as Station["kind"]),
      turnout: b.type === "thw" ? 180 : 30,
      crew: "normal",
      reserve: 0,
    }
  );
}
export function newStationProfile(type: string): Station | undefined {
  if (["hospital", "school"].includes(type)) return undefined;
  return {
    kind:
      type === "fire"
        ? "ff"
        : type === "heli"
          ? "ems"
          : (type as Station["kind"]),
    turnout: type === "thw" ? 180 : 30,
    crew: "normal",
    reserve: 0,
  };
}
export function stationCapacity(b: Building) {
  const multiplier =
    b.type === "fire" && stationProfile(b).kind === "bf" ? 2 : 1;
  return {
    slots: bt(b.type).slots * b.level * multiplier,
    people: bt(b.type).people * b.level * multiplier,
  };
}
function key(id: string) {
  let value = 2166136261;
  for (const c of id)
    value = Math.imul(value ^ c.charCodeAt(0), 16777619) >>> 0;
  return value;
}
export function personDuty(s: Save, p: Person): Duty {
  if (p.duty) return p.duty;
  const b = s.buildings.find((b) => b.id === p.home)!,
    node = nearest(b.pos);
  const local = IS_GERMANY ? querySites(b.pos, 250, 48) : [];
  const localNode = (offset: number) =>
    local.length ? nearest(local[(key(p.id) + offset) % local.length]) : node;
  return {
    name: `Einsatzkraft ${p.id.slice(-5)}`,
    role: "crew",
    shift: "24h",
    absence: "none",
    until: 0,
    reachability: 100,
    homeNode: IS_GERMANY
      ? localNode(0)
      : Math.min(nodes.length - 1, node + 1 + (key(p.id) % 8)),
    workNode: IS_GERMANY
      ? localNode(17)
      : Math.min(nodes.length - 1, node + 5 + (key(p.id) % 20)),
    commute: "car",
    workdays: true,
    standby: false,
    load: 0,
  };
}
export function personAvailable(s: Save, p: Person) {
  const injury = injuryReason(s, p);
  if (injury) return injury;
  if (p.training || p.ready > s.time) return "In Ausbildung";
  const b = s.buildings.find((b) => b.id === p.home);
  // Private FF responses are decided by the simulation after an alarm. They
  // must not be exposed as an editable roster or rerolled by readiness checks.
  if (b && stationProfile(b).kind === "ff") return "";
  if (!p.duty) return "";
  const d = p.duty;
  if (d.absence !== "none" && (!d.until || d.until > s.time))
    return absenceNames[d.absence];
  if (!d.reachability) return "Nicht erreichbar";
  const hour = Math.floor(s.time / 3600 + 1) % 24;
  if (
    b &&
    stationProfile(b).kind === "ems" &&
    !d.standby &&
    ((d.shift === "day" && (hour < 6 || hour >= 14)) ||
      (d.shift === "late" && (hour < 14 || hour >= 22)) ||
      (d.shift === "night" && hour >= 6 && hour < 22))
  )
    return "Außerhalb der Schicht";
  return "";
}
export function crewRequired(s: Save, v: Vehicle) {
  const b = s.buildings.find((b) => b.id === v.home)!,
    t = vt(v.type),
    profile = stationProfile(b);
  const minimum =
    (t as typeof t & { crewMinimum?: number }).crewMinimum ??
    (t.home === "fire" ? (t.crew >= 9 ? 6 : t.crew >= 6 ? 4 : t.crew) : t.crew);
  return t.home === "fire" &&
    profile.crew !== "full" &&
    (profile.kind === "ff" || profile.crew === "minimum")
    ? minimum
    : t.crew;
}
function rosterIndex(s: Save) {
  const homes = new Map<string, Person[]>(),
    assigned = new Map<string, Person[]>();
  const vehicles = new Map(s.vehicles.map((v) => [v.id, v])),
    bindings = new Map<string, Set<string>>();
  const bind = (person: string, vehicle: string) => {
    const entry = bindings.get(person) ?? new Set<string>();
    entry.add(vehicle);
    bindings.set(person, entry);
  };
  for (const p of s.people) {
    const home = homes.get(p.home) ?? [];
    home.push(p);
    homes.set(p.home, home);
    if (p.vehicle) {
      const own = assigned.get(p.vehicle) ?? [];
      own.push(p);
      assigned.set(p.vehicle, own);
      if (vehicles.get(p.vehicle)?.status !== "ready") bind(p.id, p.vehicle);
    }
  }
  for (const v of s.vehicles)
    if (v.status !== "ready")
      for (const a of v.turnout?.arrivals ?? [])
        if (a.available) bind(a.person, v.id);
  return { homes, assigned, bindings };
}
function indexedCrew(
  s: Save,
  v: Vehicle,
  index: ReturnType<typeof rosterIndex>,
) {
  const ff =
      stationProfile(s.buildings.find((b) => b.id === v.home)!).kind === "ff",
    type = vt(v.type);
  const pool =
    ff && v.status === "ready"
      ? (index.homes.get(v.home) ?? [])
      : (index.assigned.get(v.id) ?? []);
  return pool.filter(
    (p) =>
      (!ff ||
        [...(index.bindings.get(p.id) ?? [])].every((id) => id === v.id)) &&
      !personAvailable(s, p) &&
      (!type.training || p.skills.includes(type.training)),
  );
}
export function suitableCrew(s: Save, v: Vehicle) {
  return indexedCrew(s, v, rosterIndex(s));
}
/** Dry-run station-pool allocation; it neither calls volunteers nor changes bindings. */
export function crewAllocator(s: Save) {
  const index = rosterIndex(s),
    reserved = new Set<string>();
  return (v: Vehicle) => {
    const required = crewRequired(s, v);
    const crew = indexedCrew(s, v, index)
      .filter((p) => !reserved.has(p.id))
      .sort(
        (a, b) => a.skills.length - b.skills.length || a.id.localeCompare(b.id),
      )
      .slice(0, required);
    if (crew.length < required) return false;
    crew.forEach((p) => reserved.add(p.id));
    return true;
  };
}
function indexedSummary(
  s: Save,
  v: Vehicle,
  index: ReturnType<typeof rosterIndex>,
) {
  const ff =
    stationProfile(s.buildings.find((b) => b.id === v.home)!).kind === "ff";
  const eligibleCrew = indexedCrew(s, v, index);
  const eligible = eligibleCrew.length;
  const eligibleIds = new Set(eligibleCrew.map((person) => person.id));
  return {
    present:
      v.status === "alarmed" && v.turnout
        ? v.turnout.arrivals.filter(
            (a) => a.available && a.at <= s.time && eligibleIds.has(a.person),
          ).length
        : ff && v.status === "ready"
          ? 0
          : eligible,
    required:
      v.status === "alarmed" && v.turnout
        ? v.turnout.minimum
        : crewRequired(s, v),
    capacity: vt(v.type).crew,
    eligible,
  };
}
export function crewSummary(s: Save, v: Vehicle) {
  return indexedSummary(s, v, rosterIndex(s));
}
/** One immutable roster index for the complete public fleet, rebuilt per snapshot. */
export function crewSummaries(s: Save) {
  const index = rosterIndex(s);
  return new Map(s.vehicles.map((v) => [v.id, indexedSummary(s, v, index)]));
}
/** Reserve thresholds are advice, never a hidden dispatch prohibition. */
export function reserveReason(_s: Save, _v: Vehicle) {
  return "";
}
export function reserveWarning(s: Save, v: Vehicle) {
  if (v.reserve) return "Als Reserve vorgesehen; Alarmierung bleibt möglich";
  const b = s.buildings.find((b) => b.id === v.home)!;
  const reserve = stationProfile(b).reserve;
  const available = s.vehicles.filter(
    (x) =>
      x.home === v.home &&
      x.status === "ready" &&
      (!x.fault || x.fault.state === "repaired") &&
      s.desk.fleet[x.id]?.code !== 6 &&
      suitableCrew(s, x).length >= crewRequired(s, x),
  ).length;
  return reserve && available <= reserve
    ? `Gebietsreserve kritisch: ${available} Fahrzeug(e) verfügbar`
    : "";
}
export function checkReserveSelection(s: Save, vehicles: Vehicle[]) {
  return vehicles.map((v) => reserveWarning(s, v)).filter(Boolean);
}

export function planTurnout(s: Save, v: Vehicle, fallback: number) {
  const b = s.buildings.find((b) => b.id === v.home)!,
    profile = stationProfile(b),
    minimum = crewRequired(s, v);
  const base = b.organization
    ? Math.max(10, profile.turnout * (vt(v.type).skills.command ? 0.5 : 1))
    : fallback;
  let arrivals: NonNullable<Vehicle["turnout"]>["arrivals"];
  if (profile.kind === "ff") {
    // v already has its new assignment, but is still ready during planning.
    const pool = suitableCrew(s, v).sort(
      (a, b) => a.skills.length - b.skills.length || a.id.localeCompare(b.id),
    );
    arrivals = [];
    for (const p of pool) {
      p.duty = personDuty(s, p);
      if (!volunteerAvailability(s, p, p.duty)) continue;
      const arrival = volunteerArrival(s, p, p.duty, b);
      if (!arrival.available) continue;
      arrivals.push(arrival);
      if (arrivals.length >= minimum) break;
    }
    // Only the actually responding crew is bound. Other station members remain
    // available for another vehicle; an alarm cannot claim the same member twice.
    for (const p of s.people.filter((p) => p.vehicle === v.id))
      p.vehicle = null;
    for (const arrival of arrivals)
      s.people.find((p) => p.id === arrival.person)!.vehicle = v.id;
  } else
    arrivals = s.people
      .filter((p) => p.vehicle === v.id)
      .map((p) => ({
        person: p.id,
        at: s.time + base,
        available:
          !personAvailable(s, p) &&
          (!vt(v.type).training || p.skills.includes(vt(v.type).training)),
        reason: "Besatzung auf der Wache",
      }));
  const ready = arrivals.filter((a) => a.available).sort((a, b) => a.at - b.at);
  const delay =
    ready.length >= minimum
      ? Math.max(base, ready[minimum - 1].at - s.time)
      : 600;
  v.turnout = { started: s.time, minimum, arrivals };
  return delay;
}
export function turnoutReady(s: Save, v: Vehicle) {
  const t = v.turnout;
  if (!t) return true;
  const ready = t.arrivals.filter(
    (a) =>
      a.available &&
      a.at <= s.time &&
      s.people.some(
        (p) =>
          p.id === a.person &&
          p.home === v.home &&
          p.vehicle === v.id &&
          !p.training &&
          !injuryReason(s, p) &&
          (!vt(v.type).training || p.skills.includes(vt(v.type).training)),
      ),
  );
  if (ready.length >= t.minimum) {
    for (const a of ready) {
      const p = s.people.find((p) => p.id === a.person)!;
      if (!a.boarded) {
        p.duty = personDuty(s, p);
        p.duty.load++;
        a.boarded = true;
      }
    }
    return true;
  }
  const m = s.missions.find((m) => m.id === v.mission);
  if (m?.control) {
    record(
      s,
      m,
      "TURNOUT_FAILED",
      `${v.name}: ${ready.length}/${t.minimum} Kräfte. Alarmierung nach zehn Minuten abgebrochen.`,
    );
    request(
      s,
      m,
      v.id,
      "request",
      `${v.name} nicht ausgerückt: Besatzung fehlt. Weiteres Personal oder kleineres Fahrzeug erforderlich.`,
      "DRINGEND",
    );
  }
  recall(s, v);
  setFms(s, v, 1, "server", "Alarmierung mangels Personal abgebrochen");
  return false;
}
export function releaseVolunteerCrew(s: Save, v: Vehicle) {
  if (stationProfile(s.buildings.find((b) => b.id === v.home)!).kind !== "ff")
    return;
  for (const p of s.people) if (p.vehicle === v.id) p.vehicle = null;
  delete v.turnout;
}
export function turnoutEstimate(s: Save, v: Vehicle, alarm?: Alarm) {
  const b = s.buildings.find((b) => b.id === v.home)!,
    profile = stationProfile(b);
  if (profile.kind === "ff") return profile.turnout + 180;
  const selected = alarm ?? s.desk.alarms[v.home] ?? "dme";
  return b.organization
    ? Math.max(10, profile.turnout * (vt(v.type).skills.command ? 0.5 : 1))
    : selected === "station"
      ? 30
      : selected === "siren"
        ? 45
        : 60;
}
export function validateStaffing(s: Save) {
  const bound = new Set<string>();
  for (const v of s.vehicles) {
    if (v.status !== "alarmed" || !v.turnout) continue;
    for (const a of v.turnout.arrivals) {
      if (!a.available) continue;
      const p = s.people.find((p) => p.id === a.person);
      if (!p || p.home !== v.home || p.vehicle !== v.id || bound.has(p.id))
        throw Error(
          "Ungültige oder doppelte Personalbindung einer Alarmierung.",
        );
      bound.add(p.id);
      if (
        a.path &&
        (a.depart === undefined ||
          a.at < a.depart ||
          !a.path.length ||
          distance(
            a.path.at(-1)!,
            s.buildings.find((b) => b.id === v.home)!.pos,
          ) > 1)
      )
        throw Error("Ungültige Anreise einer Einsatzkraft.");
    }
  }
}
