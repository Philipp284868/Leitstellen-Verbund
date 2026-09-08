import { routePlan } from "./traffic";
import type { Alarm } from "./schema";
import type { Save, Vehicle, Building } from "../model";
import { vt } from "../catalog";
import { nodes, nearest, route, length, METERS_PER_UNIT } from "../world";
import { sample } from "./random";
import { setFms } from "./fms";
import { record } from "./events";
import { request } from "./incidents";
import { recall } from "../engine";
import type { Station, Duty } from "./organizations-schema";
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
type Person = Save["people"][number];
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
function key(id: string) {
  let n = 2166136261;
  for (const c of id) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0;
  return n;
}
export function personDuty(s: Save, p: Person): Duty {
  if (p.duty) return p.duty;
  const b = s.buildings.find((b) => b.id === p.home)!,
    node = nearest(b.pos);
  const local = IS_GERMANY ? querySites(b.pos, 400, 64) : [];
  const localNode = (offset: number) =>
    local.length ? nearest(local[(key(p.id) + offset) % local.length]) : node;
  return (
    p.duty ?? {
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
    }
  );
}
export function personAvailable(s: Save, p: Person) {
  if (p.training || p.ready > s.time) return "In Ausbildung";
  if (!p.duty) return "";
  const d = personDuty(s, p),
    b = s.buildings.find((b) => b.id === p.home)!;
  if (d.absence !== "none" && (!d.until || d.until > s.time))
    return absenceNames[d.absence];
  if (!d.reachability) return "Nicht erreichbar";
  // Simulated regional clock in fixed UTC+1, independent of host timezone / DST.
  const hour = Math.floor(s.time / 3600 + 1) % 24;
  if (
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
    t = vt(v.type);
  return stationProfile(b).crew === "minimum" && t.home === "fire"
    ? Math.min(t.crew, 3)
    : t.crew;
}
export function suitableCrew(s: Save, v: Vehicle) {
  return s.people.filter(
    (p) =>
      p.vehicle === v.id &&
      !personAvailable(s, p) &&
      (!vt(v.type).training || p.skills.includes(vt(v.type).training)),
  );
}
export function reserveReason(s: Save, v: Vehicle) {
  if (v.reserve) return "Als Reserve zurückgehalten";
  const b = s.buildings.find((b) => b.id === v.home)!;
  const reserve = stationProfile(b).reserve;
  if (
    reserve &&
    s.vehicles.filter(
      (x) =>
        x.home === v.home &&
        x.status === "ready" &&
        (!x.fault || x.fault.state === "repaired") &&
        s.desk.fleet[x.id]?.code !== 6 &&
        suitableCrew(s, x).length >= crewRequired(s, x),
    ).length <= reserve
  )
    return `${reserve} Fahrzeug(e) als Gebietsreserve vorgesehen`;
  return "";
}
export function planTurnout(s: Save, v: Vehicle, fallback: number) {
  const b = s.buildings.find((b) => b.id === v.home)!,
    profile = stationProfile(b);
  const base = b.organization
    ? Math.max(10, profile.turnout * (vt(v.type).skills.command ? 0.5 : 1))
    : fallback;
  const arrivals = s.people
    .filter((p) => p.vehicle === v.id)
    .map((p) => {
      const d = personDuty(s, p),
        reason = personAvailable(s, p);
      let available =
        !reason &&
        (!vt(v.type).training || p.skills.includes(vt(v.type).training)) &&
        (profile.kind !== "ff" ||
          sample(key(`${p.id}:${v.assignment}`), "arrival", 0) * 100 <
            d.reachability);
      let seconds = 0,
        commuteReason = "";
      if (profile.kind === "ff" && !d.standby) {
        const date = new Date((s.time + 3600) * 1000),
          hour = date.getUTCHours(),
          day = date.getUTCDay();
        const work = d.workdays && day > 0 && day < 6 && hour >= 8 && hour < 17;
        const origin = nodes[work ? d.workNode : d.homeNode];
        if (d.commute === "car") {
          try {
            const plan = routePlan(
              s,
              { type: "fustw" },
              origin,
              b.pos,
              "normal",
            );
            seconds = plan.seconds;
            if (plan.blockedUntil) {
              available = false;
              commuteReason =
                "Straßenanreise gesperrt; nach Freigabe erneut alarmieren";
            }
          } catch {
            available = false;
            commuteReason = "Kein Straßenweg zur Wache";
          }
        } else {
          const speed = d.commute === "bicycle" ? 15 : 5;
          seconds =
            (length(route(origin, b.pos, "road", new Set(), speed)) *
              METERS_PER_UNIT) /
            (speed / 3.6);
          if (s.environment?.kind === "ice" || s.environment?.kind === "snow")
            seconds *= 1.4;
        }
        seconds += hour < 6 || hour >= 23 ? 90 : 30;
      }
      return {
        person: p.id,
        at: s.time + base + Math.ceil(seconds),
        available,
        reason: available
          ? profile.kind === "ff" && !d.standby
            ? "Auf dem Weg zur Wache"
            : "Auf der Wache"
          : reason || commuteReason || "Alarm nicht quittiert",
      };
    });
  const minimum = crewRequired(s, v),
    ready = arrivals.filter((a) => a.available).sort((a, b) => a.at - b.at);
  const delay = ready.length >= minimum ? ready[minimum - 1].at - s.time : 600;
  v.turnout = { started: s.time, minimum, arrivals };
  return delay;
}
export function turnoutReady(s: Save, v: Vehicle) {
  const t = v.turnout;
  if (!t) return true;
  const ready = t.arrivals.filter((a) => a.available && a.at <= s.time).length;
  if (ready >= t.minimum) {
    for (const a of t.arrivals.filter((a) => a.available && a.at <= s.time)) {
      const p = s.people.find((p) => p.id === a.person);
      if (p) {
        p.duty = personDuty(s, p);
        p.duty.load++;
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
      `${v.name}: ${ready}/${t.minimum} Kräfte. Alarmierung nach zehn Minuten abgebrochen.`,
    );
    request(
      s,
      m,
      v.id,
      "request",
      `${v.name} nicht ausgerückt: Personal fehlt. Ersatz oder anderes Fahrzeug besetzen.`,
      "DRINGEND",
    );
  }
  recall(s, v);
  setFms(s, v, 1, "server", "Alarmierung mangels Personal abgebrochen");
  return false;
}

export function checkReserveSelection(s: Save, vehicles: Vehicle[]) {
  for (const home of new Set(vehicles.map((v) => v.home))) {
    const b = s.buildings.find((b) => b.id === home)!;
    const count = stationProfile(b).reserve;
    if (!count) continue;
    const available = s.vehicles.filter(
      (v) =>
        v.home === home &&
        v.status === "ready" &&
        (!v.fault || v.fault.state === "repaired") &&
        s.desk.fleet[v.id]?.code !== 6 &&
        suitableCrew(s, v).length >= crewRequired(s, v),
    ).length;
    if (available - vehicles.filter((v) => v.home === home).length < count)
      throw Error("Auswahl unterschreitet die konfigurierte Gebietsreserve.");
  }
}

export function turnoutEstimate(s: Save, v: Vehicle, alarm?: Alarm) {
  const selected = alarm ?? s.desk.alarms[v.home] ?? "dme";
  return planTurnout(
    s,
    structuredClone(v),
    selected === "station" ? 30 : selected === "siren" ? 45 : 60,
  );
}
import { IS_GERMANY } from "../world-choice";
import { querySites } from "../germany/world";
