import { expect, it } from "vitest";
import { recall } from "../src/engine";
import { approachContext } from "../src/germany/approach-key";
import { phaseFixture } from "./dispatch-fixture";
import { sites as nodes } from "./fixtures/germany/locations";

import { approach } from "../src/travel";

it("invalidates cached standby turnout after withdrawal and keeps moving requests stable within one interval", () => {
  const s = phaseFixture("preview-owner"),
    v = s.vehicles[0];
  const standby = approachContext(s, v);
  expect(approach(s, v, nodes[2])).toContain("30 s Ausrücken");
  v.status = "scene";
  v.path = [nodes[12]];
  recall(s, v);
  const returning = approachContext(s, v);
  expect(returning).not.toBe(standby);
  expect(approach(s, v, nodes[2])).toContain("0 s Ausrücken");
  s.time = Math.floor(s.time / 15) * 15 + 1;
  const firstSecond = approachContext(s, v);
  s.time += 1;
  expect(approachContext(s, v)).toBe(firstSecond);
  s.time += 15;
  expect(approachContext(s, v)).not.toBe(firstSecond);
  v.assignment = "new-call";
  expect(approachContext(s, v)).not.toBe(returning);
});
