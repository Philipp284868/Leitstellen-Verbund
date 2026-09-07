import { xpForLevel } from "../src/progression";
import { fresh, type Save } from "../src/model";
import { apply, generate, tick } from "../src/engine";
import { nodes } from "../src/world";
import { attachIncident } from "../src/simulation/calls";
export function phaseFixture(owner: string, template = "field"): Save {
  const s = fresh("Disponent", "Testleitstelle", 1000);
  s.player.id = owner;
  s.generation = "11111111-2222-4333-8444-555555555555";
  s.seed = 124;
  s.xp = xpForLevel(30);
  s.tutorial = 6;
  apply(s, { type: "build", kind: "fire", pos: nodes[0] });
  tick(s, s.time + 30, {}, false, false);
  const home = s.buildings[0].id;
  for (const [kind, count] of [
    ["hlf", 9],
    ["tlf", 3],
  ] as const) {
    apply(s, { type: "buy", kind, home });
    apply(s, { type: "hire", home, count });
    apply(s, { type: "assign", vehicle: s.vehicles.at(-1)!.id });
  }
  generate(s);
  s.missions[0].template = template;
  s.missions[0].pos = nodes[2];
  s.seed = 124;
  attachIncident(s, s.missions[0]);
  s.missionWait = 210;
  return s;
}
