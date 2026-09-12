import { germanyProvider } from "../../src/shared/germany/world";
import { apply } from "../../src/shared/engine";
import type { Save } from "../../src/shared/model";
import type { FacilityKind } from "../../src/shared/facilities/types";
import {
  meters,
  unproject,
  type Point,
} from "../../src/shared/germany/projection";

/** Acceptance fixtures buy documented catalog entries through the production action. */
export function buyRealFacility(s: Save, kind: string, origin: Point) {
  const p = unproject(origin),
    catalog = germanyProvider().facilities;
  if (!catalog) throw Error("Real facility catalog missing");
  const candidates = catalog
    .query({
      kind: kind as FacilityKind,
      usable: true,
      bbox: [p.lon - 0.5, p.lat - 0.3, p.lon + 0.5, p.lat + 0.3],
      limit: 200,
    })
    .filter((f) => !s.buildings.some((b) => b.facility?.id === f.id))
    .sort((a, b) => meters(a.pos, origin) - meters(b.pos, origin));
  const errors = [];
  for (const f of candidates) {
    try {
      apply(s, { type: "purchase-facility", facility: f.id });
      return;
    } catch (e) {
      errors.push(String(e));
    }
  }
  throw Error(
    `No usable real ${kind} near acceptance region: ${errors.join("; ")}`,
  );
}
