import { missions } from "../src/shared/catalog";
import { expect, it, vi } from "vitest";
import * as traffic from "../src/simulation/traffic";
import { GermanyRoutingError } from "../src/shared/germany/errors";
import { tick } from "../src/shared/engine";
import { validate } from "../src/shared/model";
import { endIncident, outcomeTick } from "../src/simulation/outcomes";
import { orderReturn, advanceReturn } from "../src/simulation/return-orders";
import { withdraw } from "../src/simulation/withdrawal";
import { breakVehicle } from "../src/simulation/faults";
import { incidentLoad } from "../src/simulation/workload";
import { radioFixture } from "./radio-fixture";
import { prepared } from "./helpers/patient-transport";
import { phaseFixture } from "./dispatch-fixture";
import { attachDynamics } from "../src/simulation/dynamics";
import { outcomeSchema } from "../src/simulation/outcome-schema";

it("weist widersprüchliche Ergebnis-Auslöser, Abwicklungszeiten und doppelte Patienten zurück", () => {
  const valid = {
    result: "abandoned",
    reason: "Ausdrückliche Aufgabe",
    at: 100,
    actor: "owner",
    trigger: "player",
    settlement: {
      state: "mobilizing",
      arrival: 280,
      handover: 580,
      patients: ["patient-1"],
    },
  };
  expect(outcomeSchema.safeParse(valid).success).toBe(true);
  for (const invalid of [
    { ...valid, settlement: undefined },
    { ...valid, trigger: "completion" },
    { ...valid, result: "failed" },
    { ...valid, settlement: { ...valid.settlement, arrival: 99 } },
    { ...valid, settlement: { ...valid.settlement, handover: 200 } },
    {
      ...valid,
      settlement: { ...valid.settlement, patients: ["patient-1", "patient-1"] },
    },
    { ...valid, result: "success", trigger: "completion" },
    { ...valid, secret: "untrusted" },
  ])
    expect(outcomeSchema.safeParse(invalid).success).toBe(false);
});

it("nimmt Rückzug vor erster Lagemeldung trotz Restbedarf an und lässt den Einsatz offen", () => {
  const s = radioFixture("return-owner"),
    m = s.missions[0],
    v = s.vehicles[0];
  expect(m.control!.briefed).toBe(false);
  const beforeMoney = s.money;
  withdraw(s, m, [v.id], s.player.id);
  const actual = s.vehicles.find((x) => x.id === v.id)!;
  expect(actual.status).toBe("return");
  expect(actual.returnOrder!.state).toBe("returning");
  expect(s.missions[0].outcome).toBeUndefined();
  expect(incidentLoad(s).used).toBe(1);
  expect(s.money).toBe(beforeMoney);
  expect(() => validate(s)).not.toThrow();
});
it("ein defektes Fahrzeug hält den anderen Rückkehrer nicht auf; Auftrag übersteht Speicherung", () => {
  const s = radioFixture("pending-owner"),
    m = s.missions[0];
  const broken = s.vehicles[1];
  Object.assign(broken, {
    mission: m.id,
    assignment: "broken-assignment",
    status: "scene",
    path: [m.pos],
    arrive: s.time,
    depart: s.time,
  });
  breakVehicle(s, broken, "engine");
  withdraw(s, m, [s.vehicles[0].id, broken.id], s.player.id);
  const restored = validate(JSON.parse(JSON.stringify(s)));
  expect(restored.vehicles[0].status).toBe("return");
  const waiting = restored.vehicles.find((v) => v.id === broken.id)!;
  expect(waiting.returnOrder!.state).toBe("pending");
  const before = structuredClone(waiting.path);
  advanceReturn(restored, waiting);
  expect(waiting.path).toEqual(before);
  expect(waiting.status).toBe("scene");
});
it("ein Patient wird vor Rückkehr wirklich übergeben, ohne neue Patientenrunde", () => {
  const { s, m } = prepared(2, 1);
  tick(s, s.time + 1, {}, false, false);
  const v = s.vehicles.find((v) => v.type === "rtw")!;
  expect(v.patients).toBe(1);
  orderReturn(s, v, s.player.id);
  expect(v.returnOrder!.state).toBe("clinic");
  expect(v.status).toBe("transport");
  const restored = validate(JSON.parse(JSON.stringify(s)));
  const carrier = restored.vehicles.find((x) => x.id === v.id)!;
  tick(restored, carrier.arrive + 1, {}, false, false);
  expect(carrier.patients).toBe(0);
  expect(["return", "ready"]).toContain(carrier.status);
  expect(
    restored.missions[0].dynamics!.patients.filter(
      (p) => p.transport === "delivered",
    ),
  ).toHaveLength(1);
  expect(
    restored.missions[0].dynamics!.patients.filter(
      (p) => p.transport === "scene",
    ),
  ).toHaveLength(1);
  expect(restored.missions[0].id).toBe(m.id);
});
it("Aufgabe behält Patienten, belegt den Slot bis zur externen Übernahme und vergütet nichts", () => {
  const { s, m } = prepared(2, 1),
    before = { money: s.money, xp: s.xp };
  endIncident(s, m, "abandoned", s.player.id, "Bewusst aufgegeben.");
  expect(incidentLoad(s).used).toBe(1);
  expect(m.dynamics!.patients.every((p) => p.transport === "scene")).toBe(true);
  tick(s, m.outcome!.settlement!.arrival, {}, false, false);
  expect(m.outcome!.settlement!.state).toBe("on-scene");
  expect(incidentLoad(s).used).toBe(1);
  tick(s, m.outcome!.settlement!.handover + 1, {}, false, false);
  const report = s.archive.find((x) => x.id === m.id)!;
  expect(report.outcome!.result).toBe("abandoned");
  expect(
    report.dynamics!.patients.every((p) => p.transport === "external"),
  ).toBe(true);
  expect(report.report!.patients.delivered).toBe(0);
  expect(s.statistics.abandoned).toBe(1);
  expect(s.money).toBe(before.money);
  expect(s.xp).toBe(before.xp);
  expect(incidentLoad(s).used).toBe(0);
  tick(s, s.time + 5, {}, false, false);
  expect(s.statistics.abandoned).toBe(1);
  expect(() => validate(s)).not.toThrow();
});
it("der Tod aller Zielpatienten beendet das dokumentierte Rettungsziel, ein einzelner Tod nicht", () => {
  const s = phaseFixture(
      "failure-owner",
      missions.find((m) => m.id.startsWith("case-reanimation-"))!.id,
    ),
    m = s.missions[0];
  attachDynamics(s, m);
  m.control!.briefed = true;
  expect(m.dynamics!.patients.length).toBeGreaterThan(0);
  for (const p of m.dynamics!.patients) {
    p.condition = "dead";
    p.health = 0;
  }
  outcomeTick(s, m);
  expect(m.outcome!.result).toBe("failed");
  const { s: multi, m: job } = prepared(2, 0);
  job.dynamics!.patients[0].condition = "dead";
  outcomeTick(multi, job);
  expect(job.outcome).toBeUndefined();
});
it("ein alter Rückruf verdrängt keine neuere Einsatzzuordnung", () => {
  const s = radioFixture("order-owner"),
    v = s.vehicles[0];
  orderReturn(s, v, s.player.id);
  v.assignment = "new-assignment";
  v.mission = "new-mission";
  v.status = "travel";
  const path = structuredClone(v.path);
  advanceReturn(s, v);
  expect(v.returnOrder).toBeUndefined();
  expect(v.mission).toBe("new-mission");
  expect(v.path).toEqual(path);
});

it("eine blockierte Rückroute nach Klinikübergabe erzeugt weder erneute Aufnahme noch zusätzliche Betten", () => {
  const { s } = prepared(1, 1);
  tick(s, s.time + 1, {}, false, false);
  const carrier = s.vehicles.find((v) => v.type === "rtw")!;
  orderReturn(s, carrier, s.player.id);
  const spy = vi.spyOn(traffic, "routePlan").mockImplementation(() => {
    throw new GermanyRoutingError("Test-Rückroute blockiert", "no-route");
  });
  try {
    tick(s, carrier.arrive + 1, {}, false, false);
    expect(carrier.patients).toBe(0);
    expect(carrier.status).toBe("scene");
    expect(carrier.returnOrder!.state).toBe("pending");
    const beds = s.beds.map((b) => b.id);
    expect(beds).toHaveLength(1);
    const restored = validate(JSON.parse(JSON.stringify(s)));
    tick(restored, restored.time + 20, {}, false, false);
    expect(restored.beds.map((b) => b.id)).toEqual(beds);
    const all = [...restored.missions, ...restored.archive].flatMap(
      (m) => m.dynamics?.patients ?? [],
    );
    expect(all.filter((p) => p.transport === "delivered")).toHaveLength(1);
  } finally {
    spy.mockRestore();
  }
  tick(s, s.time + 35, {}, false, false);
  expect(["return", "ready"]).toContain(carrier.status);
  expect(s.beds).toHaveLength(1);
});

it("eine erwartete Routenstörung hält nur das betroffene Fahrzeug zurück und wird nach Neustart erneut geprüft", () => {
  const s = radioFixture("route-return-owner"),
    m = s.missions[0];
  Object.assign(s.vehicles[1], {
    mission: m.id,
    assignment: "second",
    status: "scene",
    path: [m.pos],
    arrive: s.time,
    depart: s.time,
  });
  const original = traffic.routePlan;
  let calls = 0;
  const spy = vi.spyOn(traffic, "routePlan").mockImplementation((...args) => {
    if (++calls === 2) throw new GermanyRoutingError("Keine Route", "no-route");
    return original(...args);
  });
  try {
    withdraw(
      s,
      m,
      s.vehicles.slice(0, 2).map((v) => v.id),
      s.player.id,
    );
    expect(s.vehicles[0].status).toBe("return");
    expect(s.vehicles[1].status).toBe("scene");
    expect(s.vehicles[1].returnOrder!.state).toBe("pending");
    const restored = validate(JSON.parse(JSON.stringify(s)));
    const waiting = restored.vehicles[1];
    restored.time = waiting.returnOrder!.retryAt;
    advanceReturn(restored, waiting);
    expect(waiting.status).toBe("return");
    expect(calls).toBe(3);
  } finally {
    spy.mockRestore();
  }
});
