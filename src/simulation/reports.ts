import type { Save, Mission, Vehicle } from "../model";
import { mt } from "../catalog";
import { vehicleMotion } from "../vehicle-position";
import { timingKeys, type Report } from "./report-schema";

export function telemetry(s: Save, m: Mission) {
  return (m.telemetry ??= {
    since: s.time,
    partial: m.created < s.time,
    meters: 0,
    units: [],
    credits: null,
    xp: null,
    aaos: [],
  });
}
export function reportUnit(s: Save, m: Mission, v: Vehicle) {
  const t = telemetry(s, m);
  let u = t.units.find((u) => u.id === v.id);
  if (!u && t.units.length < 500) {
    u = { id: v.id, name: v.name, type: v.type, meters: 0 };
    t.units.push(u);
  }
  return u;
}
/** Count distance on the current route before a tick changes or replaces it. */
export function measureTravel(s: Save, v: Vehicle, previous: number) {
  if (
    !["travel", "transport", "return"].includes(v.status) ||
    v.journey?.blockedUntil ||
    (v.fault && v.fault.state !== "repaired")
  )
    return;
  const meters = Math.max(
    0,
    vehicleMotion(v, s.time).meters - vehicleMotion(v, previous).meters,
  );
  s.statistics.meters += meters;
  v.odometer = (v.odometer ?? 0) + meters;
  const m = s.missions.find((m) => m.id === v.mission);
  if (m) {
    telemetry(s, m).meters += meters;
    const u = reportUnit(s, m, v);
    if (u) u.meters += meters;
  }
}
export function buildReport(m: Mission): Report {
  const events = m.control?.events ?? [];
  const first = (type: string) => events.find((e) => e.type === type)?.at;
  const interval = (a: number | undefined, b: number | undefined) =>
    a === undefined || b === undefined || b < a ? null : b - a;
  const received = m.control?.calls[0]?.created ?? m.created;
  const accepted = first("CALL_ACCEPTED");
  const alarmed = first("ALARM_STARTED"),
    departed = first("VEHICLE_DEPARTED"),
    arrived = first("VEHICLE_ARRIVED"),
    recon = first("REPORT_RECEIVED");
  const transport = events.find(
    (e) =>
      (e.type === "PATIENT_CHANGED" &&
        /Transport mit .* begonnen\./.test(e.text)) ||
      e.text.startsWith("FMS 7:"),
  )?.at;
  const end = m.phase === "done" ? m.completed : undefined;
  const t = m.telemetry;
  return {
    version: 1,
    at: end ?? m.created,
    partial: !t || t.partial || !!m.control?.legacy,
    timings: {
      reaction: interval(received, accepted),
      disposition: interval(accepted, alarmed),
      turnout: interval(alarmed, departed),
      travel: interval(departed, arrived),
      recon: interval(arrived, recon),
      work: interval(recon, transport ?? end),
      transport: interval(transport, end),
      total: interval(m.created, end),
    },
    calls: m.control?.calls.length ?? 0,
    callSeconds: m.control?.calls.reduce((n, c) => n + c.duration, 0) ?? 0,
    requests:
      m.control?.radio.filter((r) => r.reason === "request").length ?? 0,
    falseAlarm: events.some((e) => e.type === "FALSE_ALARM_CONFIRMED"),
    major: !!m.major,
    patients: {
      total: m.dynamics?.patients.length ?? mt(m.template).patients,
      delivered: m.transports
        .filter((t) => t.status === "delivered")
        .reduce((n, t) => n + t.patients, 0),
      dead:
        m.dynamics?.patients.filter((p) => p.condition === "dead").length ?? 0,
    },
    units: structuredClone(t?.units ?? []),
    meters: t?.meters ?? 0,
    credits: t?.credits ?? null,
    xp: t?.xp ?? null,
    aaos: structuredClone(t?.aaos ?? []),
  };
}
export function finalizeReport(s: Save, m: Mission) {
  if (m.phase !== "done" || m.report) return;
  const r = (m.report = buildReport(m)),
    t = s.statistics;
  if (!t.since) t.since = s.time;
  t.completed++;
  t.calls += r.calls;
  t.callSeconds += r.callSeconds;
  t.requests += r.requests;
  t.falseAlarms += Number(r.falseAlarm);
  t.major += Number(r.major);
  t.delivered += r.patients.delivered;
  t.dead += r.patients.dead;
  t.credits += r.credits ?? 0;
  t.xp += r.xp ?? 0;
  for (const k of timingKeys) {
    const value = r.timings[k];
    if (value !== null) {
      const bucket = (t.timings[k] ??= { sum: 0, count: 0 });
      bucket.sum += value;
      bucket.count++;
    }
  }
  for (const a of r.aaos) {
    const key = `aao:${a.id}`;
    if (!Object.hasOwn(t.aaos, key) && Object.keys(t.aaos).length >= 500)
      continue;
    const entry = (t.aaos[key] ??= { name: a.name, uses: 0, sufficient: 0 });
    entry.uses++;
    entry.sufficient += Number(a.sufficient);
  }
}
export function migrateReports(s: Save) {
  // Preserve measurements already present in a restored or forward-compatible save.
  // Old saves receive the statistics default when parsed; missing reports are backfilled once.
  for (const m of s.archive) finalizeReport(s, m);
  for (const m of s.missions) if (!m.telemetry) telemetry(s, m).partial = true;
}
