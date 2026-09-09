import type { Save } from "../model";
import { vt, type Template, type Skills } from "../catalog";
import {
  WORLD,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  distance,
  nearest,
  nodes,
  projectRoad,
  type Point,
} from "../world";
import { IS_GERMANY } from "../world-choice";
import { germanyProvider } from "../germany/world";
import { GermanyRoutingError } from "../germany/errors";
import { generationRequirements } from "./feasibility";
import { routePlan } from "./traffic";
import type { IncidentLocation } from "./location-schema";

export const LOCATION_POLICY = {
  maximumDriveSeconds: 900,
  maximumCandidates: 16,
  maximumProfiles: 64,
  cacheEntries: 2048,
  repairRadius: 8,
} as const;
type CachedRoute = { seconds: number; blocked: boolean; reached: boolean };
const cache = new Map<string, CachedRoute>();
export function clearReachabilityCache() {
  cache.clear();
}
export const validIncidentPoint = (p: Point) =>
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  p.x > 0 &&
  p.y > 0 &&
  p.x <= WORLD_WIDTH &&
  p.y <= WORLD_HEIGHT;
function planned(
  s: Save,
  type: string,
  origin: Point,
  target: Point,
): CachedRoute {
  const e = s.environment;
  const key = JSON.stringify([
    IS_GERMANY ? germanyProvider().dataset : WORLD,
    type,
    origin,
    target,
    e?.kind,
    e?.wind,
    e?.rain,
    e?.visibility,
    e?.density,
    s.worldSituation && [
      s.worldSituation.id,
      s.worldSituation.profile,
      s.worldSituation.phase,
      s.worldSituation.intensity,
      s.worldSituation.scope,
    ],
    e?.roads
      .filter((r) => r.until > s.time)
      .map((r) => [r.id, r.edge, r.roadId, r.blocked, r.delay, r.until]),
  ]);
  const old = cache.get(key);
  if (old) return old;
  const plan = routePlan(s, { type }, origin, target);
  if (
    IS_GERMANY &&
    plan.blockedUntil &&
    plan.reason?.toLowerCase().includes("routing")
  )
    throw new GermanyRoutingError(
      "Straßenrouting derzeit nicht verfügbar.",
      "unavailable",
    );
  const result = {
    seconds: plan.seconds,
    blocked: !!plan.blockedUntil,
    reached: !!plan.path.at(-1) && distance(plan.path.at(-1)!, target) < 0.2,
  };
  cache.set(key, result);
  while (cache.size > LOCATION_POLICY.cacheEntries)
    cache.delete(cache.keys().next().value!);
  return result;
}
function covers(have: Skills, need: Skills) {
  return Object.entries(need).every(([k, n]) => (have[k] ?? 0) >= n);
}
/** Every required capability must be reachable with its actual vehicle profile.
 * A station with a core response capability anchors the territory; aircraft and
 * command cars never open a road-response area for slower operational units. */
export function verifyIncidentLocation(
  s: Save,
  t: Template,
  pos: Point,
  requireRange = true,
): IncidentLocation | undefined {
  const site = incidentSiteReference(t, pos);
  if (!site) return;
  const { access, kind, siteRef, roadRef } = site;
  const required = generationRequirements(t),
    coreKeys = Object.keys(t.requirements).filter(
      (k) =>
        ![
          "command",
          "logistics",
          "transport",
          "doctor",
          "intensive",
          "care",
        ].includes(k),
    );
  const coreKey =
    coreKeys.find((k) => t.org !== "Feuerwehr" || k !== "medical") ??
    coreKeys[0];
  if (requireRange && !coreKey) return;
  const homes = s.buildings.filter(
    (b) => b.owner === s.player.id && b.ready <= s.time,
  );
  const units = s.vehicles.filter(
    (v) =>
      v.owner === s.player.id &&
      homes.some((b) => b.id === v.home) &&
      (requireRange
        ? Object.keys(vt(v.type).skills).some((k) => required[k])
        : vt(v.type).mode === "road"),
  );
  const byProfile = [...new Set(units.map((v) => `${v.home}:${v.type}`))];
  if (byProfile.length > LOCATION_POLICY.maximumProfiles) {
    // The nearest profile groups are evaluated first; distant duplicate profiles
    // need not multiply route requests for a nationwide fleet.
    byProfile.sort((a, b) => {
      const va = units.find((v) => `${v.home}:${v.type}` === a)!,
        vb = units.find((v) => `${v.home}:${v.type}` === b)!;
      return (
        distance(homes.find((h) => h.id === va.home)!.pos, access) -
          distance(homes.find((h) => h.id === vb.home)!.pos, access) ||
        a.localeCompare(b)
      );
    });
  }
  const reached = new Map<string, CachedRoute>();
  let permanentFailures = 0;
  for (const key of byProfile.slice(0, LOCATION_POLICY.maximumProfiles)) {
    const unit = units.find((v) => `${v.home}:${v.type}` === key)!;
    try {
      const plan = planned(
        s,
        unit.type,
        homes.find((b) => b.id === unit.home)!.pos,
        access,
      );
      if (
        !plan.blocked &&
        plan.reached &&
        Number.isFinite(plan.seconds) &&
        (!requireRange || plan.seconds <= LOCATION_POLICY.maximumDriveSeconds)
      )
        reached.set(key, plan);
    } catch (error) {
      if (
        error instanceof GermanyRoutingError &&
        ["no-route", "blocked"].includes(error.code)
      ) {
        if (error.code === "no-route") permanentFailures++;
        continue;
      }
      throw error;
    }
  }
  if (
    !requireRange &&
    byProfile.length > 0 &&
    permanentFailures ===
      Math.min(byProfile.length, LOCATION_POLICY.maximumProfiles)
  )
    throw new GermanyRoutingError(
      "Kein zulässiger Straßenweg vom vorhandenen eigenen Straßennetz zum ursprünglichen Einsatzort.",
      "no-route",
    );
  const supplied: Skills = {};
  for (const v of units.filter((v) => reached.has(`${v.home}:${v.type}`)))
    for (const [k, n] of Object.entries(vt(v.type).skills))
      supplied[k] = (supplied[k] ?? 0) + n;
  if (requireRange && !covers(supplied, required)) return;
  const base = homes.find((b) => {
    const primary = units.filter(
      (v) =>
        v.home === b.id &&
        vt(v.type).mode === "road" &&
        reached.has(`${v.home}:${v.type}`),
    );
    return !requireRange
      ? primary.length > 0
      : primary.reduce((n, v) => n + (vt(v.type).skills[coreKey] ?? 0), 0) >=
          Math.min(1, required[coreKey] ?? 1);
  });
  if (!base) return;
  const primary = units.filter(
    (v) =>
      v.home === base.id &&
      vt(v.type).mode === "road" &&
      (!requireRange || (vt(v.type).skills[coreKey] ?? 0) > 0) &&
      reached.has(`${v.home}:${v.type}`),
  );
  return {
    version: 1,
    dataset: IS_GERMANY ? germanyProvider().dataset : WORLD,
    kind,
    siteRef,
    roadRef,
    original: { ...pos },
    access,
    station: base.id,
    profiles: [
      ...new Set(
        units
          .filter((v) => reached.has(`${v.home}:${v.type}`))
          .map((v) => v.type),
      ),
    ],
    driveSeconds: Math.max(
      ...primary.map((v) => reached.get(`${v.home}:${v.type}`)!.seconds),
    ),
    checkedAt: s.time,
    state: "verified",
    reason:
      "Ort, Zugang und eigene Fahrzeugprofile über Straßenrouting geprüft.",
  };
}

export function incidentSiteReference(t: Template, pos: Point) {
  if (!validIncidentPoint(pos)) return;
  const kind = t.profile?.site ?? (t.water ? "water" : "street");
  let access = { ...pos },
    siteRef: string,
    roadRef: string;
  if (IS_GERMANY) {
    const provider = germanyProvider(),
      evidence = provider.incidentEvidence?.(pos, kind);
    if (!evidence) return;
    const road = projectRoad(pos);
    if (road.distance > LOCATION_POLICY.repairRadius) return;
    access = { ...road.point };
    siteRef = evidence.reference;
    roadRef = road.section.id;
  } else {
    const index = nearest(pos),
      point = nodes[index];
    if (!point || distance(point, pos) > LOCATION_POLICY.repairRadius) return;
    access = { ...point };
    siteRef = `${WORLD}:node:${index}`;
    roadRef = siteRef;
  }
  if (!validIncidentPoint(access)) return;
  return { kind, siteRef, roadRef, access };
}
