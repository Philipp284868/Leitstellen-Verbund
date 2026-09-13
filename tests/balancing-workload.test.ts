import { saveIndependentFixture } from "./helpers/independent-sites";
import { expect, it } from "vitest";
import { phaseFixture } from "./dispatch-fixture";
import { organizationFixture } from "./mutual-aid-fixture";
import { fixtureMission } from "./fixtures/germany/mission";
import { xpForLevel } from "../src/shared/progression";
import {
  incidentLoad,
  createIncident,
  assertAssistanceCapacity,
  incidentKeys,
} from "../src/simulation/workload";
import { generate, recall } from "../src/shared/engine";
import { campaignTick } from "../src/simulation/major-incidents";
import { followupsTick } from "../src/simulation/dynamics";
import { withCallGeneration } from "../src/simulation/call-generation";
import {
  prepareCallPacing,
  recordIncidentCreated,
  mayCreateIncident,
} from "../src/simulation/pacing";
import { Database } from "../src/server/database";
import { Game } from "../src/server/game";
import type { ServerAction } from "../src/server/actions";
import "./fixtures/germany/session";

it.each([1, 2, 5, 7, 8, 10, 20, 50])(
  "stoppt die Erzeugung auf Stufe %i exakt an der Obergrenze, auch bei wiederholten Erzeugern",
  (level) => {
    const s = phaseFixture("limit"),
      limit = Math.min(10, level + 2);
    s.xp = xpForLevel(level);
    s.missions = [];
    for (let i = 0; i < limit; i++)
      expect(createIncident(s, fixtureMission(s, "bin"))).toBe(true);
    const before = structuredClone(s);
    for (let i = 0; i < 100; i++) {
      generate(s);
      followupsTick(s);
      expect(
        campaignTick(s, () => {
          throw Error("Kampagne darf keinen Einsatz anlegen.");
        }),
      ).toBe(false);
      expect(
        createIncident(s, {
          ...s.missions[0],
          id: `rejected-${i}`,
          round: `round-${i}`,
        }),
      ).toBe(false);
      s.time += 120;
      expect(incidentLoad(s).used).toBe(limit);
    }
    expect(s.seed).toBe(before.seed);
    expect(s.missions).toEqual(before.missions);
    expect(s.money).toBe(before.money);
    const closed = s.missions[0];
    closed.phase = "done";
    expect(incidentLoad(s).used).toBe(limit - 1);
    expect(createIncident(s, fixtureMission(s, "bin"))).toBe(true);
    expect(incidentLoad(s).used).toBe(limit);
  },
);

it("zählt Anrufer, eigene Transporte, fremde Aufträge und reine Rückfahrten anhand des Einsatzes", () => {
  const s = phaseFixture("owner"),
    m = s.missions[0];
  s.xp = 0;
  m.control!.calls.push({
    ...structuredClone(m.control!.calls[0]),
    id: "second-call",
  });
  expect(incidentLoad(s).used).toBe(1);
  m.phase = "done";
  expect(incidentLoad(s).used).toBe(0);
  m.transports.push({
    assignment: "transport-a",
    vehicle: s.vehicles[0].id,
    owner: "owner",
    patients: 1,
    status: "ordered",
  });
  expect(incidentLoad(s).used).toBe(1);
  m.transports[0].status = "delivered";
  const v = s.vehicles[0];
  v.status = "return";
  v.mission = m.id;
  expect(incidentLoad(s).used).toBe(0);
  for (const id of ["a", "b"])
    s.contributions.push({
      assignment: id,
      peer: "other",
      mission: "job",
      round: "round",
      vehicle: id,
      maxReward: 1,
      status: "active",
    });
  expect([...incidentKeys(s)]).toEqual(["remote:other:job"]);
  v.mission = "remote:other:job";
  v.status = "scene";
  expect(incidentLoad(s).used).toBe(1);
  expect(() => assertAssistanceCapacity(s, "other", "job")).not.toThrow();
  s.contributions.forEach((c) => (c.status = "returned"));
  v.status = "return";
  expect(incidentLoad(s).used).toBe(0);
});

it("überspringt abwesende Leitstellen und behält ruhige Fristen nach Neustart, Levelwechsel und versäumter Zeit", () => {
  const s = phaseFixture("pacing");
  s.missions = [];
  s.xp = 0;
  withCallGeneration(
    () => false,
    () => {
      generate(s);
      expect(createIncident(s, fixtureMission(s, "bin"))).toBe(false);
    },
  );
  expect(s.missions).toHaveLength(0);
  prepareCallPacing(s, 0);
  const due = s.callPacing!.notBefore;
  s.xp = xpForLevel(50);
  prepareCallPacing(s, 0);
  expect(s.callPacing!.notBefore).toBe(due);
  s.time += 3600;
  prepareCallPacing(s, 3600);
  expect(mayCreateIncident(s)).toBe(false);
  expect(s.callPacing!.notBefore).toBeGreaterThan(s.time);
  s.time = s.callPacing!.notBefore;
  expect(mayCreateIncident(s)).toBe(true);
  generate(s);
  recordIncidentCreated(s);
  expect(s.missions).toHaveLength(1);
  expect(mayCreateIncident(s)).toBe(false);
  expect(s.callPacing!.notBefore - s.time).toBeGreaterThanOrEqual(60);
});

it("prüft Unterstützungsannahmen atomar am gemeinsamen Leitstellenlimit, nicht am Level des bedienenden Disponenten", () => {
  const db = new Database("", { memory: true });
  try {
    for (const id of ["owner", "helper", "operator", "stranger"]) {
      db.sql
        .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
        .run(id, id, "unused", "player", 0);
      saveIndependentFixture(db, id, organizationFixture(id, "field", id));
    }
    const helper = db.all().get("helper")!;
    helper.xp = 0;
    while (helper.missions.length < 3)
      helper.missions.push(fixtureMission(helper, "bin"));
    db.save("helper", helper);
    db.sql
      .prepare("INSERT INTO desk_members VALUES(?,?)")
      .run("operator", "helper");
    const game = new Game(db),
      command = (user: string, action: ServerAction) =>
        game.command(user, { id: crypto.randomUUID(), action });
    const m = db.all().get("owner")!.missions[0];
    command("owner", {
      type: "aid-draft",
      peer: "helper",
      mission: m.id,
      types: ["hlf", "tlf"],
      message: "Unterstützung",
      priority: "NORMAL",
    });
    const request = db.all().get("owner")!.aid.at(-1)!;
    command("owner", { type: "aid-send", id: request.id });
    const action = {
      type: "aid-accept" as const,
      owner: "owner",
      id: request.id,
      vehicles: [helper.vehicles[0].id],
    };
    const before = JSON.stringify(db.all().get("helper"));
    expect(() => command("operator", action)).toThrow(/Einsatzobergrenze/);
    expect(JSON.stringify(db.all().get("helper"))).toBe(before);
    expect(() => command("stranger", action)).toThrow(/zugänglich/);
    const released = db.all().get("helper")!;
    released.missions.pop();
    db.save("helper", released);
    const envelope = { id: crypto.randomUUID(), action };
    game.command("operator", envelope);
    game.command("operator", envelope);
    expect(incidentLoad(db.all().get("helper")!).used).toBe(3);
    command("operator", { ...action, vehicles: [helper.vehicles[1].id] });
    expect(incidentLoad(db.all().get("helper")!).used).toBe(3);
    expect(db.all().get("owner")!.aid.at(-1)!.assignments).toHaveLength(2);
    const returning = db.all().get("helper")!;
    for (const v of returning.vehicles) recall(returning, v);
    expect(incidentLoad(returning).used).toBe(2);
  } finally {
    db.close();
  }
});
