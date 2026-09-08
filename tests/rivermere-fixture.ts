export { phaseFixture } from "./phase-fixture";
export * from "../src/world";
export {
  settlements,
  wet,
  inLake,
  riverDistance,
  river,
  extent,
} from "../src/rivermere/geography";
export { alarm } from "../src/simulation/dispatch";
export { tick, beginTrip } from "../src/engine";
export { validate } from "../src/model";
export { buildReason } from "../src/purchase";

import { phaseFixture as baseFixture } from "./phase-fixture";
import { nodes, nearest } from "../src/world";
import { settlements } from "../src/rivermere/geography";
import { beginTrip } from "../src/engine";
export function regionalLoadFixture(owner: string, destinationOffset = 3) {
  const s = baseFixture(owner),
    home = structuredClone(s.buildings[0]),
    unit = structuredClone(s.vehicles[1]);
  s.buildings = [];
  s.vehicles = [];
  s.people = [];
  s.missions = [];
  s.desk.fleet = {};
  s.environment = undefined;
  s.missionWait = 99999;
  for (let i = 0; i < 100; i++) {
    const pos = nodes[nearest(settlements[i % settlements.length])];
    s.buildings.push({
      ...home,
      id: `rm-load-station-${i}`,
      name: `Regionswache ${i}`,
      pos,
      level: 2,
    });
    for (let j = 0; j < 5; j++) {
      const v = {
        ...structuredClone(unit),
        id: `rm-load-unit-${i}-${j}`,
        name: `Regionsfahrzeug ${i}-${j}`,
        home: `rm-load-station-${i}`,
        path: [pos],
        status: "ready" as const,
      };
      if (j === 0) {
        v.path = [
          nodes[
            nearest(settlements[(i + destinationOffset) % settlements.length])
          ],
        ];
        beginTrip(s, v, pos, "return");
      }
      s.vehicles.push(v);
    }
  }
  for (let i = 0; i < 40; i++)
    s.missions.push({
      id: `rm-load-mission-${i}`,
      template: "bin",
      pos: nodes[nearest(settlements[i % settlements.length])],
      progress: 0,
      phase: "offered",
      created: s.time,
      completed: 0,
      shared: false,
      round: `rm-load-round-${i}`,
      contributors: [],
      transports: [],
    });
  return s;
}
export { listenBrowserServer } from "./e2e/server-helper";
