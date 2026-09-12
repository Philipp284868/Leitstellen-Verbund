import { configuredSkills } from "./vehicle-equipment";
import { vt, type Skills, type Template } from "../shared/catalog";
import { GermanyRoutingError } from "../shared/germany/errors";
import { germanyProvider } from "../shared/germany/world";
import type { Save } from "../shared/model";
import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  distance,
  projectRoad,
  type Point,
} from "../shared/world";
import { generationRequirements } from "./feasibility";
import type { IncidentLocation } from "./location-schema";
import { routePlan } from "./traffic";
export const LOCATION_POLICY = {
  maximumDriveSeconds: 900,
  maximumCandidates: 16,
  maximumProfiles: 64,
  cacheEntries: 2048,
  repairRadius: 8,
} as const;
type CachedRoute = {
  seconds: number;
  blocked: boolean;
  reached: boolean;
};
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
    germanyProvider().dataset,
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
  if (plan.blockedUntil && plan.reason?.toLowerCase().includes("routing"))
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
  const sites = incidentSiteReferences(t, pos);
  let disconnected = 0;
  for (const site of sites) {
    try {
      const location = verifyAccess(s, t, pos, requireRange, site);
      if (location) return location;
    } catch (error) {
      if (error instanceof GermanyRoutingError && error.code === "no-route") {
        disconnected++;
        continue;
      }
      throw error;
    }
  }
  if (!requireRange && sites.length && disconnected === sites.length)
    throw new GermanyRoutingError(
      "Alle geprüften Zufahrten zum ursprünglichen Einsatzort sind unerreichbar.",
      "no-route",
    );
}
function verifyAccess(
  s: Save,
  t: Template,
  pos: Point,
  requireRange: boolean,
  site: NonNullable<ReturnType<typeof incidentSiteReference>>,
): IncidentLocation | undefined {
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
        ? Object.keys(configuredSkills(v)).some((k) => required[k])
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
    // A bounded search is not proof that every station is disconnected.
    // Preserve an old case if additional profiles have not been evaluated.
    byProfile.length <= LOCATION_POLICY.maximumProfiles &&
    permanentFailures === byProfile.length
  )
    throw new GermanyRoutingError(
      "Kein zulässiger Straßenweg vom vorhandenen eigenen Straßennetz zum ursprünglichen Einsatzort.",
      "no-route",
    );
  const supplied: Skills = {};
  for (const v of units.filter((v) => reached.has(`${v.home}:${v.type}`)))
    for (const [k, n] of Object.entries(configuredSkills(v)))
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
      : primary.reduce((n, v) => n + (configuredSkills(v)[coreKey] ?? 0), 0) >=
          Math.min(1, required[coreKey] ?? 1);
  });
  if (!base) return;
  const primary = units.filter(
    (v) =>
      v.home === base.id &&
      vt(v.type).mode === "road" &&
      (!requireRange || (configuredSkills(v)[coreKey] ?? 0) > 0) &&
      reached.has(`${v.home}:${v.type}`),
  );
  return {
    version: 1,
    dataset: germanyProvider().dataset,
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
  return incidentSiteReferences(t, pos)[0];
}
export function incidentSiteReferences(t: Template, pos: Point) {
  const result: {
    kind: NonNullable<Template["profile"]>["site"];
    siteRef: string;
    roadRef: string;
    access: Point;
  }[] = [];
  if (!validIncidentPoint(pos)) return result;
  const kind = t.profile?.site ?? (t.water ? "water" : "street");
  const provider = germanyProvider(),
    evidence = provider.incidentEvidence?.(pos, kind);
  if (!evidence) return result;
  const points = [
    pos,
    ...provider
      .querySites(pos, LOCATION_POLICY.repairRadius, 16)
      .sort((a, b) => distance(pos, a) - distance(pos, b) || a.id - b.id),
  ];
  const used = new Set<string>();
  for (const point of points) {
    try {
      const road = projectRoad(point);
      if (
        distance(pos, road.point) > LOCATION_POLICY.repairRadius ||
        !validIncidentPoint(road.point)
      )
        continue;
      const key = `${road.section.id}:${road.point.x}:${road.point.y}`;
      if (used.has(key)) continue;
      used.add(key);
      result.push({
        kind,
        siteRef: evidence.reference,
        roadRef: road.section.id,
        access: { ...road.point },
      });
      if (result.length === 3) break;
    } catch (error) {
      // A confirmed OSM place can still lack a usable road entrance. Skip
      // that candidate; outages and malformed provider responses remain errors.
      if (error instanceof GermanyRoutingError && error.code === "no-route")
        continue;
      throw error;
    }
  }
  return result;
}
