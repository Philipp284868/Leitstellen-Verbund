import { fixturePurchase } from "./fixtures/germany/facilities";
import { bookMoney } from "../src/economy/ledger";
import { apply, tick } from "../src/engine";
import { fresh, type Save } from "../src/model";
import { euro } from "../src/money";
import { xpForLevel } from "../src/progression";
import { sites as nodes } from "./fixtures/germany/locations";
import { fixtureMission } from "./fixtures/germany/mission";

import { attachIncident } from "../src/simulation/calls";
export function phaseFixture(owner: string, template = "field"): Save {
  const s = fresh("Disponent", "Testleitstelle", 1000);
  s.player.id = owner;
  s.generation = "11111111-2222-4333-8444-555555555555";
  s.seed = 124;
  bookMoney(s, euro(100000000) - s.money, "Entwickler-Testbudget");
  // Mission suites isolate payouts; recurring financing has dedicated economy-server tests.
  s.xp = xpForLevel(30);

  apply(s, fixturePurchase("fire", nodes[0]));
  // Existing phase suites model an established professional station. Volunteer starts have their own suite.
  s.buildings[0].organization = {
    kind: "bf",
    turnout: 30,
    crew: "normal",
    reserve: 0,
  };
  tick(s, s.time + 30, {}, false, false);
  const home = s.buildings[0].id;
  for (const kind of ["hlf", "tlf"] as const) {
    apply(s, { type: "buy", kind, home });
  }
  s.missions = [fixtureMission(s, template)];
  s.seed = 124;
  attachIncident(s, s.missions[0]);
  s.missionWait = 210;
  return s;
}
