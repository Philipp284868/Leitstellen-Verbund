import { sumCents } from "../money";
import type { Save, Mission, Vehicle } from "../model";
import { mt, vt } from "../catalog";
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
export function reportUnit(
  s: Save,
  m: Mission,
  v: Vehicle,
  dispatched = false,
) {
  const t = telemetry(s, m);
  let u = t.units.find((u) => u.id === v.id);
  if (!u) {
    u = { id: v.id, name: v.name, type: v.type, meters: 0 };
    t.units.push(u);
  }
  if (u && (v.status === "alarmed" || dispatched) && u.alarmed === undefined) {
    u.alarmed = s.time;
    u.plannedTurnout = Math.max(0, v.depart - s.time);
    if (v.journey) u.plannedSeconds = v.journey.plannedSeconds;
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
      delivered: m.dynamics?.active
        ? m.dynamics.patients.filter((p) => p.transport === "delivered").length
        : m.transports
            .filter((t) => t.status === "delivered")
            .reduce((n, t) => n + t.patients, 0),
      dead:
        m.dynamics?.patients.filter((p) => p.condition === "dead").length ?? 0,
    },
    units: structuredClone(t?.units ?? []),
    meters: t?.meters ?? 0,
    credits:
      m.location?.state === "technical-closure" ? 0 : (t?.credits ?? null),
    xp: m.location?.state === "technical-closure" ? 0 : (t?.xp ?? null),
    aaos: structuredClone(t?.aaos ?? []),
    quality: incidentQuality(m),
  };
}
/** A transparent gameplay assessment; historical reports never invent missing timing data. */
export function incidentQuality(m: Mission): NonNullable<Report["quality"]> {
  const events = m.control?.events || [],
    units = m.telemetry?.units || [];
  const assessed =
    m.location?.state !== "technical-closure" &&
    !!m.telemetry &&
    !m.telemetry.partial &&
    !m.control?.legacy;
  const accepted = events.find((e) => e.type === "CALL_ACCEPTED")?.at;
  const alarmed = events.find((e) => e.type === "ALARM_STARTED")?.at;
  const disposition =
    accepted === undefined || alarmed === undefined
      ? 0
      : Math.max(0, alarmed - accepted);
  const escalations = events.filter(
    (e) => e.type === "MISSION_ESCALATED",
  ).length;
  const patients = m.dynamics?.patients || [],
    dead = patients.filter((p) => p.condition === "dead").length;
  const losses = patients.length ? dead / patients.length : 0;
  const need = {
      ...(m.dynamics?.scenario?.requirements ?? mt(m.template).requirements),
    },
    supplied: Record<string, number> = {};
  let reserveUnits = 0,
    unitMinutes = 0,
    actualTravel = 0,
    plannedTravel = 0,
    turnoutDelay = 0,
    measuredTurnouts = 0;
  for (const unit of units) {
    const skills = vt(unit.type).skills;
    if (
      !Object.entries(skills).some(
        ([k, n]) => n > 0 && (supplied[k] || 0) < (need[k] || 0),
      )
    )
      reserveUnits++;
    for (const [k, n] of Object.entries(skills))
      supplied[k] = (supplied[k] || 0) + n;
    const dispatched = events.find(
      (e) => e.vehicle === unit.id && e.type === "VEHICLE_DEPARTED",
    )?.at;
    const arrival = events.find(
      (e) => e.vehicle === unit.id && e.type === "VEHICLE_ARRIVED",
    )?.at;
    if (
      dispatched !== undefined &&
      arrival !== undefined &&
      unit.plannedSeconds !== undefined &&
      unit.plannedSeconds > 0
    ) {
      actualTravel += Math.max(0, arrival - dispatched);
      plannedTravel += unit.plannedSeconds;
    }
    if (
      dispatched !== undefined &&
      unit.alarmed !== undefined &&
      unit.plannedTurnout !== undefined
    ) {
      turnoutDelay += Math.max(
        0,
        dispatched - unit.alarmed - unit.plannedTurnout,
      );
      measuredTurnouts++;
    }
    let boundAt: number | undefined;
    for (const event of events.filter((e) => e.vehicle === unit.id)) {
      if (["ALARM_STARTED", "VEHICLE_DEPARTED"].includes(event.type))
        boundAt ??= event.at;
      else if (event.type === "VEHICLE_RELEASED" && boundAt !== undefined) {
        unitMinutes += Math.max(0, event.at - boundAt) / 60;
        boundAt = undefined;
      }
    }
    if (boundAt !== undefined && m.completed >= boundAt)
      unitMinutes += (m.completed - boundAt) / 60;
  }
  const travelRatio = plannedTravel
    ? Math.round((actualTravel / plannedTravel) * 100) / 100
    : null;
  const averageTurnout = measuredTurnouts
    ? Math.round(turnoutDelay / measuredTurnouts)
    : null;
  // Route-relative delay treats a distant rural response like an equally punctual city response.
  // Required reinforcements and declared initial major incidents carry no automatic penalty.
  const score = assessed
    ? Math.max(
        0,
        Math.round(
          100 -
            Math.min(20, Math.max(0, disposition - 120) / 30) -
            Math.min(12, Math.max(0, (travelRatio ?? 1) - 1.5) * 8) -
            Math.min(8, (averageTurnout ?? 0) / 30) -
            Math.min(10, escalations * 3) -
            losses * 40,
        ),
      )
    : 0;
  return {
    score,
    grade:
      score >= 85
        ? "Sehr gut"
        : score >= 65
          ? "Gut"
          : score >= 40
            ? "Verbesserungsbedarf"
            : "Kritisch",
    escalations,
    reserveUnits,
    unitMinutes: Math.round(unitMinutes * 10) / 10,
    travelRatio,
    turnoutDelay: averageTurnout,
    duration: Math.max(0, m.completed - m.created),
    requests:
      m.control?.radio.filter((r) => r.reason === "request").length ?? 0,
    assessed,
  };
}
/** Quality only reduces the immutable scenario reward; escalation cannot create bonus farming. */
export function qualityFactor(m: Mission) {
  const quality = incidentQuality(m);
  return quality.assessed ? 0.75 + quality.score / 400 : 1;
}
export function finalizeReport(s: Save, m: Mission) {
  if (m.location?.state === "technical-closure") return;
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
  t.credits = sumCents([t.credits, r.credits ?? 0]);
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
