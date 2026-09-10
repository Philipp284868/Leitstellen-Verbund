import type { Template } from "../catalog";
import { vt } from "../catalog";
import { GermanyRoutingError } from "../germany/errors";
import { queryIncidentSites } from "../germany/world";
import type { Save } from "../model";
import { distance, type Point } from "../world";
import {
  LOCATION_POLICY,
  verifyIncidentLocation,
} from "./location-reachability";
import { sample } from "./random";
import { automaticRouting } from "./routing-context";
import { situationAffects, situationTemplateWeight } from "./world-situation";
/** null means a temporary routing outage; [] means no suitable geographic site. */
export function generationLocations(
  s: Save,
  template: Template,
): Point[] | null {
  try {
    const candidates = incidentLocations(s, template).filter(
      (p) =>
        situationTemplateWeight(s, template) <= 1 ||
        situationAffects(s.worldSituation, p),
    );
    const bases = s.buildings.filter(
      (b) => b.owner === s.player.id && b.ready <= s.time,
    );
    const ranked = candidates.sort(
      (a, b) =>
        Math.min(...bases.map((h) => distance(h.pos, a))) -
        Math.min(...bases.map((h) => distance(h.pos, b))),
    );
    // Most draws favor the nearest half; one in five explores the outer area.
    const offset = ranked.length
      ? Math.floor(
          sample(s.seed, "incident-location") *
            (sample(s.seed, "incident-outer") < 0.2
              ? ranked.length
              : Math.max(1, ranked.length / 2)),
        )
      : 0;
    const selected = [
      ...ranked.slice(offset),
      ...ranked.slice(0, offset),
    ].slice(0, LOCATION_POLICY.maximumCandidates);
    const result = [];
    for (const point of selected) {
      const location = verifyIncidentLocation(s, template, point);
      if (location) result.push(location.access);
      if (result.length >= 4) break;
    }
    if (!result.length)
      generationDeferred(
        s,
        template.id,
        candidates.length,
        "Kein belegter Einsatzort mit passenden eigenen Fahrzeugprofilen innerhalb von 900 Straßenfahrsekunden.",
      );
    return result;
  } catch (error) {
    if (
      automaticRouting() &&
      error instanceof GermanyRoutingError &&
      error.code === "unavailable"
    ) {
      generationDeferred(
        s,
        template.id,
        0,
        "Straßenrouting vorübergehend nicht verfügbar; später erneut versuchen.",
      );
      return null;
    }
    throw error;
  }
}
export function generationDeferred(
  s: Save,
  template: string,
  candidates: number,
  reason: string,
) {
  s.generationLog ??= [];
  if (
    s.generationLog.at(-1)?.reason !== reason ||
    s.time - s.generationLog.at(-1)!.at >= 300
  )
    s.generationLog.push({
      version: 1,
      at: s.time,
      template,
      reason,
      candidates,
    });
  s.generationLog = s.generationLog.slice(-50);
  s.missionWait = Math.max(s.missionWait, 60);
  s.nextMission = s.time + s.missionWait;
}
/** Local, reachable sites of the correct OSM land-use kind; never substitute a random road. */
export function incidentLocations(s: Save, template: Template): Point[] {
  const relevantHomes = new Set(
    s.vehicles
      .filter((v) =>
        Object.keys(vt(v.type).skills).some((k) => template.requirements[k]),
      )
      .map((v) => v.home),
  );
  const bases = s.buildings.filter(
    (b) => b.ready <= s.time && relevantHomes.has(b.id),
  );
  const radius = s.vehicles.length <= 4 ? 180 : 400;
  {
    const kind =
      template.profile?.site ?? (template.water ? "water" : "street");
    return [
      ...new Map(
        bases
          .flatMap((b) => queryIncidentSites(b.pos, radius, kind))
          .map((p) => [`${p.x},${p.y}`, p]),
      ).values(),
    ];
  }
}
