import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../server/database";
import { historyPage } from "../server/history";
import { phaseFixture } from "./phase-fixture";
import { generate, recall, readiness, tick } from "../src/engine";
import { validate, type Save } from "../src/model";
import { attachIncident, callsTick, callAction } from "../src/simulation/calls";
import { publicSave } from "../src/simulation/incidents";
import { vehicleAvailability } from "../src/simulation/availability";
import { nextCallDelay } from "../src/simulation/balance";
import {
  priorityRank,
  priorities,
  visiblePriority,
} from "../src/simulation/priority";
import { forceRows, openForceLabels } from "../src/simulation/force-plan";
import { missionList } from "../src/workspace";
import { vt } from "../src/catalog";
import { nodes } from "../src/world";

const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function database(s: Save) {
  const dir = mkdtempSync(join(tmpdir(), "lv-expansion-"));
  paths.push(dir);
  const db = new Database(dir);
  db.sql
    .prepare("INSERT INTO users VALUES (?,?,?,?,?)")
    .run(s.player.id, "Prüfung", "test-hash", "player", 0);
  return db;
}
function ambulance() {
  const s = phaseFixture("dispatch-owner", "sick"),
    v = s.vehicles[0];
  s.buildings[0].type = "ems";
  s.buildings[0].organization = {
    kind: "ems",
    turnout: 30,
    crew: "normal",
    reserve: 0,
  };
  v.type = "rtw";
  v.name = "RTW 1";
  s.vehicles = [v];
  s.people = s.people.filter((p) => p.vehicle === v.id).slice(0, 2);
  v.status = "scene";
  v.mission = s.missions[0].id;
  v.assignment = "medical-assignment";
  v.path = [nodes[2]];
  v.patients = 1;
  return { s, v };
}
it("generates and reloads more than 60 simultaneous incidents without a hidden count limit", () => {
  const s = phaseFixture("many-calls");
  for (let i = 0; i < 74; i++) generate(s);
  expect(s.missions).toHaveLength(75);
  const db = database(s),
    dir = db.dir;
  db.save(s.player.id, s);
  db.close();
  const restarted = new Database(dir);
  try {
    expect(restarted.all().get(s.player.id)!.missions).toHaveLength(75);
  } finally {
    restarted.close();
  }
});
it("normal calls receive no automatic duplicate, including legacy pending timers", () => {
  const s = phaseFixture("normal", "flat"),
    m = s.missions[0];
  m.control!.secret!.secondaryAt = s.time + 45;
  for (let i = 0; i < 400; i++) {
    s.time++;
    callsTick(s);
  }
  expect(m.control!.calls).toHaveLength(1);
});
it("major callers contribute different observations and incomplete lost calls can recover", () => {
  const s = phaseFixture("major", "bus"),
    m = s.missions[0];
  s.time = m.control!.secret!.secondaryAt + 1;
  callsTick(s);
  expect(m.control!.calls).toHaveLength(2);
  expect(m.control!.secret!.observations![0]).not.toBe(
    m.control!.secret!.observations![1],
  );
  const n = structuredClone(m);
  n.id += "normal";
  n.template = "flat";
  delete n.control;
  s.missions = [n];
  attachIncident(s, n);
  const c = n.control!.calls[0];
  c.callback = false;
  callAction(s, n, c.id, "accept", "owner");
  callAction(s, n, c.id, "end", "owner");
  s.time += 31;
  callsTick(s);
  expect(n.control!.calls[1].kind).toBe("recovery");
});
it("returning FMS 1 is unavailable, then real home arrival starts persisted medical aftercare", () => {
  const { s, v } = ambulance();
  recall(s, v);
  expect(s.desk.fleet[v.id].code).toBe(1);
  expect(readiness(s, v)).toBe("Noch auf Rückfahrt.");
  expect(vehicleAvailability(s, v).state).toBe("RETURNING");
  const until = v.arrive;
  s.missions = [];
  tick(s, until - 0.01, {}, false, false);
  expect(v.status).toBe("return");
  tick(s, until, {}, false, false);
  expect(v.status).toBe("ready");
  expect(readiness(s, v)).toBe("Desinfektion läuft.");
  expect(vehicleAvailability(s, v).state).toBe("POST_INCIDENT");
  const restored = validate(JSON.parse(JSON.stringify(s)));
  expect(restored.vehicles[0].postIncident).toEqual(v.postIncident);
  const end = s.time + 600;
  tick(s, end, {}, false, false);
  tick(restored, end, {}, false, false);
  expect(restored).toEqual(s);
  expect(readiness(s, v)).toBe("");
  expect(s.desk.fleet[v.id].code).toBe(2);
  expect(v.postIncident).toBeUndefined();
});
it("server readiness overrides forged cached availability and manual FMS changes", () => {
  const { s, v } = ambulance();
  recall(s, v);
  v.availability = {
    state: "AVAILABLE",
    alarmable: true,
    dispatchable: true,
    reason: "",
    crewPresent: 2,
    crewRequired: 2,
    crewCapacity: 2,
  };
  s.desk.fleet[v.id].code = 2;
  expect(readiness(s, v)).toBe("Noch auf Rückfahrt.");
  expect(publicSave(s).vehicles[0].availability!.alarmable).toBe(false);
});
it("unbounded history is persistent and paginated without leaking to other owners", () => {
  const s = phaseFixture("archive-owner"),
    source = s.missions[0];
  s.missions = [];
  s.archive = Array.from({ length: 620 }, (_, i) => ({
    ...structuredClone(source),
    id: `archived-${i}`,
    round: `round-${i}`,
    phase: "done" as const,
    completed: s.time + 620 - i,
  }));
  const db = database(s),
    dir = db.dir;
  db.save(s.player.id, s);
  db.close();
  const restarted = new Database(dir);
  try {
    expect(restarted.all().get(s.player.id)!.archive.length).toBe(100);
    const old = historyPage(restarted.sql, s.player.id, "multi", {
      page: 24,
      query: "",
      org: "Alle",
      major: false,
    });
    expect(old.total).toBe(620);
    expect(old.missions).toHaveLength(20);
    expect(old.missions[0].control!.secret).toBeUndefined();
    expect(
      historyPage(restarted.sql, "other", "multi", {
        page: 0,
        query: "",
        org: "Alle",
        major: false,
      }).total,
    ).toBe(0);
  } finally {
    restarted.close();
  }
});
it("six priorities preserve legacy values and sort high urgency first", () => {
  expect(priorities).toHaveLength(6);
  expect(visiblePriority("PRIORITÄT")).toBe("HOCH");
  expect(priorityRank("KRITISCH")).toBeGreaterThan(priorityRank("HOCH"));
  const s = phaseFixture("priorities");
  s.missions = priorities.map((priority, i) => ({
    ...structuredClone(s.missions[0]),
    id: `priority-${i}`,
    control: { ...structuredClone(s.missions[0].control!), priority },
  }));
  expect(missionList(s, "", "all", "priority")[0].control!.priority).toBe(
    "NOTFALL",
  );
});
it("vehicle requirements recognize equivalent equipment without raw skill names", () => {
  expect(
    openForceLabels({ medical: 1, transport: 1 }, vt("rtw").skills),
  ).toEqual([]);
  expect(
    forceRows({ fire: 1, rescue: 1 }, vt("hlf").skills).every(
      (row) => row.present === row.required,
    ),
  ).toBe(true);
  expect(
    openForceLabels(
      { medical: 1, transport: 1, doctor: 1 },
      vt("rtw").skills,
    ).join(" "),
  ).toMatch(/NEF|Notarzt/);
});
it("arrival rate changes with time/weather but not current open incident count", () => {
  const s = phaseFixture("cadence");
  const before = nextCallDelay(120, s);
  s.missions.push(
    ...Array.from({ length: 200 }, () => structuredClone(s.missions[0])),
  );
  expect(nextCallDelay(120, s)).toBe(before);
  s.time = 18 * 3600;
  expect(nextCallDelay(120, s)).not.toBe(before);
});
