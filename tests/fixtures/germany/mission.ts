import type { Save, Mission } from "../../../src/shared/model";
import { simId } from "../../../src/simulation/events";
import { mt } from "../../../src/shared/catalog";
import { sites } from "./locations";

// Explicit scenario precondition; generator decisions are tested separately.
export function fixtureMission(
  save: Save,
  template: string,
  pos = sites[2],
): Mission {
  return {
    id: simId(save),
    round: simId(save),
    template,
    paymentCents: mt(template).reward,
    pos,
    progress: 0,
    phase: "offered",
    created: save.time,
    completed: 0,
    shared: false,
    contributors: [],
    transports: [],
  };
}
