import { xpForLevel } from "../src/progression";
import { organizationFixture } from "./phase-three-fixture";
import { vt } from "../src/catalog";
import { nodes, distance } from "../src/world";
import { simId } from "../src/simulation/events";
import { validate, type Save, type Vehicle } from "../src/model";
export function majorFixture(
  owner = "north",
  template = "field",
  identity = "north",
) {
  const s = organizationFixture(owner, template, `four-${identity}`);
  s.money = 1000000;
  s.xp = xpForLevel(30);
  s.buildings[0].level = 10;
  s.missions[0].control!.briefed = true;
  s.missions[0].control!.stage = "working";
  for (const kind of [
    "elw",
    "hlf",
    "lf",
    "rtw",
    "rtw",
    "rtw",
    "rtw",
    "nef",
    "fustw",
    "pmtw",
    "gkw",
    "mzgw",
    "tmtw",
    "air",
    "haz",
  ])
    addUnit(s, kind);
  return validate(s);
}
export function addUnit(s: Save, kind: string) {
  const type = vt(kind);
  let home = s.buildings.find((b) => b.type === type.home);
  if (!home) {
    home = {
      id: simId(s),
      owner: s.player.id,
      type: type.home,
      name: type.home,
      pos: nodes.find((n) =>
        s.buildings.every((b) => distance(b.pos, n) > 25),
      )!,
      level: 10,
      ready: 0,
      extensions: ["technical", "hazmat", "air", "doctor"],
    };
    s.buildings.push(home);
  }
  const v: Vehicle = {
    id: simId(s),
    owner: s.player.id,
    home: home.id,
    type: kind,
    name: `${type.name} ${s.vehicles.length + 1}`,
    favorite: false,
    status: "ready",
    mission: null,
    assignment: null,
    path: [home.pos],
    depart: 0,
    arrive: 0,
    patients: 0,
  };
  s.vehicles.push(v);
  for (let i = 0; i < type.crew; i++)
    s.people.push({
      id: simId(s),
      home: home.id,
      vehicle: v.id,
      training: "",
      ready: 0,
      skills: type.training ? [type.training] : [],
    });
  return v;
}
export function atScene(s: Save, v: Vehicle, mission = s.missions[0].id) {
  v.mission = mission;
  v.assignment = simId(s);
  v.status = "scene";
  v.path = [s.missions[0].pos];
  v.depart = s.time;
  v.arrive = s.time;
}
