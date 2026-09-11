import { apply } from "../../src/engine";
import { mt } from "../../src/catalog";
import { attachDynamics } from "../../src/simulation/dynamics";
import { newPatient } from "../../src/simulation/patients";
import { ensureMissionTasks } from "../../src/simulation/mission-tasks";
import { phaseFixture } from "../dispatch-fixture";
import { fixturePurchase } from "../fixtures/germany/facilities";
import { sites } from "../fixtures/germany/locations";
export function prepared(
  count: number,
  ambulances: number,
  owner = "transport-owner",
) {
  const s = phaseFixture(owner, "sick");
  apply(s, fixturePurchase("ems", sites[1]));
  const home = s.buildings.at(-1)!;
  home.ready = s.time;
  for (let i = 0; i < ambulances; i++)
    apply(s, { type: "buy", kind: "rtw", home: home.id });
  const m = s.missions[0];
  attachDynamics(s, m);
  const d = m.dynamics!;
  while (d.patients.length < count) d.patients.push(newPatient(s, m));
  for (const p of d.patients)
    Object.assign(p, {
      age: 30,
      health: 100,
      treatment: 100,
      condition: "recovering",
    });
  for (const h of d.hazards) Object.assign(h, { value: 0, resolved: true });
  d.aftermath = s.time - 1;
  d.nextEvent = s.time + 1e6;
  d.bystanderChecked = true;
  m.control!.briefed = true;
  m.control!.firstArrival = s.vehicles[0].id;
  m.phase = "transport";
  m.progress = mt(m.template).seconds;
  for (const task of ensureMissionTasks(s, m).entries)
    Object.assign(task, {
      done: true,
      progress: task.seconds,
      completedAt: s.time,
    });
  for (const v of s.vehicles.filter((v) => v.type === "rtw"))
    Object.assign(v, {
      mission: m.id,
      assignment: `assignment-${v.id}`,
      status: "scene",
      path: [m.pos],
      depart: s.time,
      arrive: s.time,
    });
  return { s, m };
}
