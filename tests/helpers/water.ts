import type { WaterSource } from "../../src/shared/germany/water";
import {
  germanyProvider,
  installGermanyProvider,
} from "../../src/shared/germany/world";
import { meters, type Point } from "../../src/shared/germany/projection";
export function waterFixture(point: Point, flowLpm = 600) {
  const provider = germanyProvider(),
    access = provider.nearest(point);
  const source: WaterSource = {
    id: "osm:node:water-test",
    pos: { x: access.x, y: access.y },
    access: { x: access.x, y: access.y },
    kind: "hydrant",
    origin: "openstreetmap",
    snapshot: "fixture",
    dataset: provider.dataset,
    area: "village",
    flowLpm,
    flowSource: "simulation-v1",
    properties: { emergency: "fire_hydrant" },
    quality: ["Isolierte Fixture, keine reale Versorgungszusage"],
  };
  installGermanyProvider({
    ...provider,
    waterSources: () => [source],
    waterConnection: (source, target) => {
      const path = provider.route(
        source.access,
        target,
        "road",
        new Set(),
        40,
        new Map(),
        1,
      );
      return {
        source,
        path,
        meters: path
          .slice(1)
          .reduce((sum, p, i) => sum + meters(p, path[i]), 0),
      };
    },
  });
  return { source, restore: () => installGermanyProvider(provider) };
}
