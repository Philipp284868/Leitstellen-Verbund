import type { Save } from "../model";
import type { Template } from "../catalog";
import { vt } from "../catalog";
import { IS_GERMANY } from "../world-choice";
import { nodes, docks, distance, type Point } from "../world";
import { queryIncidentSites } from "../germany/world";
import { GermanyRoutingError } from "../germany/errors";
import { automaticRouting } from "./routing-context";

/** null means a temporary routing outage; [] means no suitable geographic site. */
export function generationLocations(
  s: Save,
  template: Template,
): Point[] | null {
  try {
    return incidentLocations(s, template);
  } catch (error) {
    if (
      IS_GERMANY &&
      automaticRouting() &&
      error instanceof GermanyRoutingError &&
      error.code === "unavailable"
    )
      return null;
    throw error;
  }
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
  if (IS_GERMANY) {
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
  return (template.water ? docks : nodes).filter((p) =>
    bases.some((b) => distance(b.pos, p) <= radius),
  );
}
