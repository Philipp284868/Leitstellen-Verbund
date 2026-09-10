import { phaseFixture } from "../../dispatch-fixture";
import { sites } from "./locations";
import { fixtureMission } from "./mission";
import { beginTrip } from "../../../src/engine";
import { reconcileBuildingStaffing } from "../../../src/simulation/building-staffing";
import { validate } from "../../../src/model";
import { logicFacilityCatalog } from "./facilities";
import { facilityBinding } from "../../../server/facilities/migration";

/** A current populated save for UI load measurement. Purchasing and staffing
 * transactions have separate tests; automatic staffing provisions this fixture. */
export function loadFixture(owner: string) {
  const s = phaseFixture(owner),
    home = structuredClone(s.buildings[0]),
    unit = structuredClone(s.vehicles[1]);
  s.buildings = [];
  s.vehicles = [];
  s.people = [];
  s.missions = [];
  s.desk.fleet = {};
  s.environment = undefined;
  s.missionWait = 99999;
  s.nextMission = s.time + 99999;
  for (let i = 0; i < 100; i++) {
    const pos = sites[i];
    s.buildings.push({
      ...structuredClone(home),
      id: `load-station-${i}`,
      name: `Regionswache ${i}`,
      pos,
      facility: facilityBinding(logicFacilityCatalog.get(`fixture:fire:${i}`)!),
      level: 2,
    });
    for (let j = 0; j < 5; j++)
      s.vehicles.push({
        ...structuredClone(unit),
        id: `load-unit-${i}-${j}`,
        name: `Regionsfahrzeug ${i}-${j}`,
        home: `load-station-${i}`,
        path: [pos],
        status: "ready",
      });
  }
  reconcileBuildingStaffing(s);
  for (let i = 0; i < 100; i++) {
    const v = s.vehicles[i * 5],
      target = s.buildings[i].pos;
    v.path = [sites[(i + 64) % 128]];
    beginTrip(s, v, target, "return");
  }
  for (let i = 0; i < 40; i++)
    s.missions.push(fixtureMission(s, "bin", sites[i]));
  return validate(s);
}
