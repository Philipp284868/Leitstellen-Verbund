import { expect, it } from "vitest";
import { apply, recall } from "../src/shared/engine";
import { garageIndex } from "../src/simulation/garage";
import { phaseFixture } from "./dispatch-fixture";
import { sites as nodes } from "./fixtures/germany/locations";

import { setFms } from "../src/simulation/fms";
it("Garagen zeigen reale Anwesenheit unabhängig von FMS und ordnen unterwegs befindliche Fahrzeuge getrennt zu", () => {
  const s = phaseFixture("garage"),
    b = s.buildings[0],
    v = s.vehicles[0];
  setFms(s, v, 6);
  expect(garageIndex(s).get(b.id)!.inside).toContain(v);
  v.status = "scene";
  v.path = [nodes[12]];
  recall(s, v);
  s.time = v.depart + (v.arrive - v.depart) / 2;
  expect(garageIndex(s).get(b.id)!.inside).not.toContain(v);
  expect(garageIndex(s).get(b.id)!.away).toContain(v);
  const purchased = s.vehicles.length;
  apply(s, { type: "buy", home: b.id, kind: "tsf" });
  expect(garageIndex(s).get(b.id)!.inside).toContain(s.vehicles[purchased]);
  s.time = v.arrive;
  expect(garageIndex(s).get(b.id)!.inside).toContain(v);
  expect(
    [...garageIndex(s).values()].flatMap((g) => [...g.inside, ...g.away]),
  ).toHaveLength(s.vehicles.length);
});
