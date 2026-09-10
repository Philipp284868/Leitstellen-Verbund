import { sites, fixtureDataset } from "./locations";
import { logicFacilityCatalog } from "./facilities";
import { meters, inBounds } from "../../../src/germany/projection";
import {
  installGermanyProvider,
  type GermanyProvider,
  type Point,
  type RoadSection,
  type Anchor,
} from "../../../src/germany/world";
import { GermanyRoutingError } from "../../../src/germany/errors";

/** Consumer-contract fixture for simulation tests. Production simulation, auth,
 * SQLite and routing-plan logic run unchanged. This is explicitly not evidence
 * for GraphHopper or OSM parsing; those use LocalGermanyProvider integration. */
export function installLogicGeography() {
  const anchors: Anchor[] = sites.map((p, id) => ({
    ...p,
    id,
    name: "Straße des 17. Juni",
    roadClass: "primary",
  }));
  const nearest = (p: Point) =>
    anchors.reduce((a, b) => (meters(a, p) < meters(b, p) ? a : b));
  const sections = new Map<string, RoadSection>();
  const key = (a: Point, b: Point) => `${a.x},${a.y}/${b.x},${b.y}`;
  const section = (a: Point, b: Point): RoadSection => {
    const id = key(a, b);
    let value = sections.get(id);
    if (!value) {
      value = {
        id: `osm:${id}`,
        a: nearest(a).id,
        b: nearest(b).id,
        meters: meters(a, b),
        limit: 50,
        name: "Straße des 17. Juni",
        kind: "main",
        direction: "both",
        source: "openstreetmap",
        access: "road",
      };
      sections.set(id, value);
    }
    return value;
  };
  const query = (center: Point, radius: number, limit: number) =>
    anchors
      .filter((p) => meters(p, center) <= radius * 12)
      .sort((a, b) => meters(a, center) - meters(b, center))
      .slice(0, limit);
  const provider: GermanyProvider = {
    facilities: logicFacilityCatalog,
    dataset: fixtureDataset,
    node: (id) => anchors[id],
    nearest,
    querySites: query,
    queryIncidentSites: (center, radius, _kind, limit) =>
      query(center, radius, limit),
    incidentEvidence: (p, kind) =>
      inBounds(p)
        ? { reference: `fixture:${kind}:${nearest(p).id}`, distanceMeters: 0 }
        : undefined,
    projectRoad: (p) => {
      const anchor = nearest(p),
        point = { x: anchor.x, y: anchor.y },
        other =
          anchors[
            anchor.id === anchors.length - 1 ? anchor.id - 1 : anchor.id + 1
          ];
      return {
        point,
        section: section(point, other),
        fraction: 0,
        distance: meters(point, p) / 12,
      };
    },
    sectionBetween: section,
    route: (a, b, mode, blocked) => {
      if (!inBounds(a) || !inBounds(b))
        throw new GermanyRoutingError(
          "Testpunkt liegt außerhalb Deutschlands.",
          "no-route",
        );
      if (mode === "air") return [a, b];
      if (mode === "water")
        throw new GermanyRoutingError(
          "Wasserrouting gehört nicht zum Straßenprofil; MZB fährt als Anhänger.",
          "no-route",
        );
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const path = [a, middle, b];
      for (let i = 1; i < path.length; i++) {
        const e = section(path[i - 1], path[i]);
        if (
          [e.id, `${e.a}:${e.b}`, `${e.b}:${e.a}`].some((k) => blocked.has(k))
        )
          throw new GermanyRoutingError(
            "Kontrollierte Straßensperre.",
            "blocked",
          );
      }
      return path;
    },
    districtAt: () => "Berlin",
    addressAt: (p) => `Straße des 17. Juni ${nearest(p).id + 1}, Berlin`,
    isLandSite: (p) => inBounds(p),
    isWaterSite: (p) => inBounds(p),
    hospitals: () => [
      {
        ...sites[100],
        id: "way:100000",
        name: "Technische Klinik-Fixture Berlin",
      },
    ],
    close: () => {},
  };
  installGermanyProvider(provider);
  return provider;
}
