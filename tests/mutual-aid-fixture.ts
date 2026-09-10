import { bookMoney } from "../src/economy/ledger";
import { apply, tick } from "../src/engine";
import { validate, type Save } from "../src/model";
import { euro } from "../src/money";
import { buildReason } from "../src/purchase";
import { attachDynamics } from "../src/simulation/dynamics";
import { attachOrganizations } from "../src/simulation/organizations";
import { sites as nodes } from "./fixtures/germany/locations";
import { phaseFixture } from "./dispatch-fixture";

export function organizationFixture(
  owner: string,
  template = "field",
  identity = "north",
) {
  const raw = phaseFixture(owner, template);
  const s = validate(
    JSON.parse(
      JSON.stringify(raw).replaceAll(raw.generation, `mutual-aid-${identity}`),
    ),
  );
  s.player.station = `Leitstelle ${owner.slice(0, 8)}`;
  const m = s.missions[0];
  m.control!.locationKnown = true;
  m.control!.reportedTemplate = template;
  attachDynamics(s, m);
  attachOrganizations(m);
  return s;
}
export function addAmbulance(s: Save) {
  bookMoney(s, euro(1000000), "Entwickler-Testbudget f�r Rettungswache");
  apply(s, {
    type: "build",
    kind: "ems",
    pos: [nodes[3], ...nodes].find((p) => !buildReason(s, "ems", p))!,
  });
  tick(s, s.time + 30, {}, false, false);
  const b = s.buildings.at(-1)!;
  apply(s, { type: "buy", kind: "rtw", home: b.id });
  const v = s.vehicles.at(-1)!;
  return v;
}
