import { buildReason } from "../../src/purchase";
import { xpForLevel } from "../../src/progression";
import { fresh, uid, type Save } from "../../src/model";
import { apply, tick, generate } from "../../src/engine";
import { nodes } from "../../src/world";
export function established(name: string): Save {
  const s = fresh(name, `Leitstelle ${name}`, Date.now() / 1000);
  s.speed = 1;
  apply(s, { type: "build", kind: "fire", pos: nodes[0] });
  s.buildings[0].organization = {
    kind: "bf",
    turnout: 30,
    crew: "normal",
    reserve: 0,
  };
  tick(s, s.time + 30);
  apply(s, { type: "buy", kind: "tsf", home: s.buildings[0].id });
  apply(s, { type: "hire", home: s.buildings[0].id, count: 6 });
  apply(s, { type: "assign", vehicle: s.vehicles[0].id });
  for (let i = 0; i < 3; i++) {
    s.missions = [];
    generate(s);
    apply(s, {
      type: "dispatch",
      mission: s.missions[0].id,
      vehicles: [s.vehicles[0].id],
    });
    tick(s, s.time + 10000);
  }
  s.missions = [];
  return s;
}
export function emsProfile(name: string) {
  const s = established(name);
  s.xp = Math.max(s.xp, xpForLevel(4));
  apply(s, {
    type: "build",
    kind: "ems",
    pos: [nodes[3], ...nodes].find((p) => !buildReason(s, "ems", p))!,
  });
  tick(s, s.time + 30);
  const home = s.buildings.find((b) => b.type === "ems")!;
  apply(s, { type: "buy", kind: "rtw", home: home.id });
  apply(s, { type: "hire", home: home.id, count: 2 });
  apply(s, {
    type: "assign",
    vehicle: s.vehicles.find((v) => v.type === "rtw")!.id,
  });
  s.missions = [];
  generate(s);
  s.missions[0].template = "sick";
  s.missions[0].pos = nodes[2];
  return s;
}
export function largeProfile() {
  const s = fresh("Lasttest", "Große Leitstelle", 1000);
  s.tutorial = 6;
  for (let i = 0; i < 100; i++) {
    const home = uid();
    s.buildings.push({
      id: home,
      owner: s.player.id,
      type: "fire",
      name: `Wache ${i}`,
      pos: nodes[i],
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
