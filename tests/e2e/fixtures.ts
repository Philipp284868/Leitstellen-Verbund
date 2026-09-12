import { logicFacilityCatalog } from "../fixtures/germany/facilities";
import { facilityBinding } from "../../src/server/facilities/migration";
import { fixturePurchase } from "../fixtures/germany/facilities";
import { apply, tick } from "../../src/shared/engine";
import { fresh, uid, type Save } from "../../src/shared/model";
import { xpForLevel } from "../../src/shared/progression";
import { fixtureTime, sites as nodes } from "../fixtures/germany/locations";
import { fixtureMission } from "../fixtures/germany/mission";
import { fundTestBudget } from "../money-fixture";

export function established(name: string): Save {
  const s = fresh(name, `Leitstelle ${name}`, fixtureTime);
  s.seed = 124;
  fundTestBudget(s, 4000000);
  s.xp = xpForLevel(4);
  s.completed = 3;
  s.speed = 1;
  apply(s, fixturePurchase("fire", nodes[0]));
  s.buildings[0].organization = {
    kind: "bf",
    turnout: 30,
    crew: "normal",
    reserve: 0,
  };
  tick(s, s.time + 30, {}, false, false);
  apply(s, { type: "buy", kind: "tsf", home: s.buildings[0].id });
  s.missions = [];
  return s;
}
export function emsProfile(name: string) {
  const s = established(name);
  s.xp = Math.max(s.xp, xpForLevel(4));
  apply(s, fixturePurchase("ems", nodes[3]));
  tick(s, s.time + 30, {}, false, false);
  const home = s.buildings.find((b) => b.type === "ems")!;
  apply(s, { type: "buy", kind: "rtw", home: home.id });
  s.missions = [fixtureMission(s, "sick")];
  return s;
}
export function largeProfile() {
  const s = fresh("Lasttest", "Große Leitstelle", 1000);

  for (let i = 0; i < 100; i++) {
    const home = uid();
    s.buildings.push({
      id: home,
      owner: s.player.id,
      type: "fire",
      name: `Wache ${i}`,
      pos: nodes[i],
      facility: facilityBinding(logicFacilityCatalog.get(`fixture:fire:${i}`)!),
      level: 1,
      ready: 0,
      extensions: [],
    });
    for (let j = 0; j < 3; j++) {
      const id = uid();
      s.vehicles.push({
        id,
        owner: s.player.id,
        type: "tsf",
        name: `TSF ${i}-${j}`,
        home,
        favorite: false,
        status: "ready",
        mission: null,
        assignment: null,
        path: [nodes[i]],
        depart: 0,
        arrive: 0,
        patients: 0,
      });
      for (let p = 0; p < 6; p++)
        s.people.push({
          id: uid(),
          home,
          vehicle: id,
          skills: [],
          training: "",
          ready: 0,
        });
    }
  }
  for (let i = 0; i < 50; i++)
    s.missions.push({
      id: uid(),
      template: "bin",
      pos: nodes[i],
      progress: 0,
      phase: "offered",
      created: 1000,
      completed: 0,
      shared: false,
      round: uid(),
      contributors: [],
      transports: [],
    });
  return s;
}
