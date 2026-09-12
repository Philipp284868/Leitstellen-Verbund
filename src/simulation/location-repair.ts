import { mt } from "../shared/catalog";
import { beginTrip, recall } from "../shared/engine";
import { GermanyRoutingError } from "../shared/germany/errors";
import { queryIncidentSites } from "../shared/germany/world";
import type { Mission, Save } from "../shared/model";
import { WORLD, distance, type Point } from "../shared/world";
import { record, simId } from "./events";
import {
  LOCATION_POLICY,
  incidentSiteReference,
  validIncidentPoint,
  verifyIncidentLocation,
} from "./location-reachability";
function technicalClose(s: Save, m: Mission, reason: string) {
  // A transport already carrying a patient keeps its assignment and hospital
  // handover. Its original incident can be archived only after that handover.
  if (
    s.vehicles.some((v) => v.mission === m.id && v.patients > 0) ||
    m.transports.some((t) => t.status === "ordered")
  )
    return false;
  for (const v of s.vehicles.filter((v) => v.mission === m.id)) recall(s, v);
  m.phase = "done";
  m.completed = s.time;
  if (m.location) {
    m.location.state = "technical-closure";
    m.location.reason = reason;
    m.location.checkedAt = s.time;
  }
  if (m.telemetry) {
    m.telemetry.credits = 0;
    m.telemetry.xp = 0;
  }
  if (m.control) {
    m.control.stage = "closed";
    for (const c of m.control.calls) {
      if (c.state === "active") c.duration += s.time - c.started;
      c.state = "ended";
      c.ended = s.time;
    }
    for (const r of m.control.radio) {
      r.state = "handled";
      r.answered = s.time;
      delete r.handling;
    }
    m.control.facts.push({
      key: "technical",
      text: reason,
      source: "server",
      confidence: "bestätigt",
    });
  }
  record(s, m, "LOCATION_TECHNICAL_CLOSURE", reason);
  // Preserve the complete case, including patient facts, but bypass reward,
  // performance assessment and contributor payouts.
  s.archive.unshift(m);
  s.missions = s.missions.filter((x) => x.id !== m.id);
  return true;
}
export function repairIncidentLocations(
  s: Save,
  rerouteHelpers?: (m: Mission) => void,
) {
  const review = s.locationReview;
  if (!review || !review.pending.length || s.time < review.nextAt) return;
  const id = review.pending[0],
    m = s.missions.find((m) => m.id === id);
  if (!m) {
    review.pending.shift();
    return;
  }
  review.nextAt = s.time + 60;
  try {
    const t = mt(m.template),
      original = m.location?.original ?? m.pos;
    let target: Point | undefined = incidentSiteReference(t, original)?.access;
    if (!target && validIncidentPoint(original))
      target = queryIncidentSites(
        original,
        LOCATION_POLICY.repairRadius,
        t.profile?.site ?? (t.water ? "water" : "street"),
        8,
      ).find((p) => distance(p, original) <= LOCATION_POLICY.repairRadius);
    if (!target) {
      if (
        technicalClose(
          s,
          m,
          "Technisch aufgehoben: Am ursprünglichen Einsatzort ist keine belegte, geeignete Zufahrt vorhanden. Keine Vergütung und keine Wertung.",
        )
      ) {
        review.pending.shift();
        review.checked++;
      }
      return;
    }
    const location = verifyIncidentLocation(s, t, target, false);
    if (!location) {
      if (m.location)
        m.location.reason =
          "Zufahrt vorhanden; zulässige Straßenverbindung wird erneut geprüft. Bestehende Aufgaben und Patienten bleiben erhalten.";
      return;
    }
    const moved = distance(m.pos, location.access) > 0.01;
    m.location = { ...location, original: { ...original } };
    m.pos = { ...location.access };
    if (moved) {
      for (const v of s.vehicles.filter(
        (v) => v.mission === m.id && ["alarmed", "travel"].includes(v.status),
      )) {
        const pendingDeparture =
          v.status === "alarmed" ? Math.max(s.time, v.depart) : s.time;
        beginTrip(s, v, m.pos, v.status, v.journey?.mode ?? "priority");
        v.arrive += pendingDeparture - s.time;
        v.depart = pendingDeparture;
      }
      rerouteHelpers?.(m);
      record(
        s,
        m,
        "LOCATION_REPAIRED",
        "Zufahrt an der ursprünglichen Lage korrigiert. Anfahrende Kräfte werden von ihrer tatsächlichen Position neu geroutet.",
      );
    } else
      record(
        s,
        m,
        "LOCATION_VERIFIED",
        "Bestandsort und bestehende Zufahrt anhand des installierten Datenstands geprüft.",
      );
    review.pending.shift();
    review.checked++;
  } catch (error) {
    if (error instanceof GermanyRoutingError) {
      if (
        error.code === "no-route" &&
        technicalClose(
          s,
          m,
          `Technisch aufgehoben: ${error.message} Keine Vergütung und keine Wertung.`,
        )
      ) {
        review.pending.shift();
        review.checked++;
        return;
      }
      if (m.location)
        m.location.reason = `Straßenprüfung wartet: ${error.message}`.slice(
          0,
          600,
        );
      return;
    }
    throw error;
  } finally {
    // One temporarily blocked case must not prevent every other old case from
    // being verified. Preserve its retry deadline and move it to the queue end.
    if (review.pending[0] === id && review.pending.length > 1)
      review.pending.push(review.pending.shift()!);
  }
}
/** Explicitly queue an individual technical report without moving its location. */
export function queueLocationReview(s: Save, m: Mission) {
  s.locationReview ??= { version: 1, pending: [], nextAt: s.time, checked: 0 };
  if (!s.locationReview.pending.includes(m.id))
    s.locationReview.pending.push(m.id);
  m.location ??= {
    version: 1,
    dataset: WORLD,
    kind: "legacy",
    siteRef: `review:${simId(s)}`,
    roadRef: "unverified",
    original: { ...m.pos },
    access: { ...m.pos },
    station: "unverified",
    profiles: [],
    driveSeconds: 0,
    checkedAt: s.time,
    state: "repair-pending",
    reason: "Technische Ortsprüfung läuft.",
  };
  m.location.state = "repair-pending";
}
