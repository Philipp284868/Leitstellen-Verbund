import { phaseFixture } from "./phase-fixture";
import { callAction } from "../src/simulation/calls";
import { alarm } from "../src/simulation/dispatch";
import { tick } from "../src/engine";

/** An actual accepted call, dispatch and journey ends at the first radio report. */
export function radioFixture(owner: string) {
  const s = phaseFixture(owner),
    m = s.missions[0],
    call = m.control!.calls[0].id;
  callAction(s, m, call, "accept", owner);
  callAction(s, m, call, "ask", owner, "address");
  tick(s, s.time + 5, {}, false, false);
  callAction(s, m, call, "ask", owner, "report");
  callAction(s, m, call, "end", owner);
  alarm(s, m, [s.vehicles[0].id], owner);
  tick(s, s.vehicles[0].arrive + 1, {}, false, false);
  if (!m.control!.radio.some((r) => r.reason === "arrival"))
    throw Error("First report missing after journey");
  return s;
}
