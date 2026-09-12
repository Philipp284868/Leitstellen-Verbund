import {
  facilityKinds,
  type Facility,
  type FacilityCatalog,
  type FacilityQuery,
} from "../../../src/shared/facilities/types";
import {
  meters,
  unproject,
  type Point,
} from "../../../src/shared/germany/projection";
import { sites } from "./locations";

/** Fixed, explicitly synthetic catalog. Test purchases still use IDs and the production purchase action. */
export const facilitiesAt = (positions: Point[]): Facility[] =>
  facilityKinds
    .filter((k) => k !== "other")
    .flatMap((kind) =>
      positions.map((pos, i) => ({
        id: `fixture:${kind}:${i}`,
        kind,
        name: `Teststandort ${kind} ${i}`,
        address: `Prüfstraße ${i + 1}, Berlin`,
        state: "DE-BE",
        snapshot: "2026-09-10",
        sources: [`node:${9000000 + i * 10 + facilityKinds.indexOf(kind)}`],
        subtype: kind === "fire" ? "FF" : "unknown",
        emergency: "unknown",
        status: "active",
        quality: ["Synthetische CI-Fixture; kein realer Standort"],
        pos,
        ...unproject(pos),
        access: {
          pos,
          source: `road-node:${i}`,
          method: kind === "heli" ? "air-base" : "onsite-road",
        },
      })),
    );
export const fixtureFacilities = facilitiesAt(sites);
const byId = new Map(fixtureFacilities.map((f) => [f.id, f]));
export function fixturePurchase(
  kind: string,
  pos: Point,
  positions: Point[] = sites,
) {
  const nearest = positions.reduce((a, b) =>
    meters(a, pos) < meters(b, pos) ? a : b,
  );
  return {
    type: "purchase-facility" as const,
    facility: `fixture:${kind}:${positions.indexOf(nearest)}`,
  };
}
export const logicFacilityCatalog: FacilityCatalog = {
  snapshot: "2026-09-10",
  get: (id) => byId.get(id),
  query: (q: FacilityQuery) =>
    fixtureFacilities
      .filter(
        (f) =>
          (!q.kind || f.kind === q.kind) &&
          (!q.offerFilter ||
            (!q.offerFilter.owned.includes(f.id) &&
              (f.status === "active" &&
                !!f.access &&
                q.offerFilter.kinds.includes(f.kind)) ===
                q.offerFilter.available)) &&
          (!q.ids || q.ids.includes(f.id)) &&
          (!q.bbox ||
            (f.lon >= q.bbox[0] &&
              f.lat >= q.bbox[1] &&
              f.lon <= q.bbox[2] &&
              f.lat <= q.bbox[3])) &&
          (!q.search ||
            `${f.name} ${f.address} ${f.state}`
              .toLowerCase()
              .includes(q.search.toLowerCase())),
      )
      .slice(0, q.limit || 80),
  clusters: (bbox, _zoom, kind) =>
    logicFacilityCatalog.query({ bbox, kind, limit: 200 }).map((f) => ({
      id: f.id,
      kind: f.kind,
      name: f.name,
      lon: f.lon,
      lat: f.lat,
      count: 1,
      usable: true,
    })),
};
