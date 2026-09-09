import { afterEach, expect, it, vi } from "vitest";
import { phaseFixture } from "./phase-fixture";
import { mt } from "../src/catalog";
import { nodes } from "../src/world";
import * as traffic from "../src/simulation/traffic";
import {
  verifyIncidentLocation,
  clearReachabilityCache,
} from "../src/simulation/location-reachability";
import {
  queueLocationReview,
  repairIncidentLocations,
} from "../src/simulation/location-repair";
import {
  planLocationMigration,
  applyLocationMigration,
} from "../server/location-migration";
import { DatabaseSync } from "node:sqlite";
import { publicSave } from "../src/simulation/incidents";
import { validate } from "../src/model";
import { tick } from "../src/engine";
import { attachDynamics } from "../src/simulation/dynamics";
afterEach(() => {
  vi.restoreAllMocks();
  clearReachabilityCache();
});

it.each([899, 900, 901])(
  "prüft %i Straßenfahrsekunden ohne ETA-Abschneiden oder Katastrophenbonus",
  (seconds) => {
    const s = phaseFixture("owner", "bin"),
      t = mt("bin"),
      pos = s.missions[0].pos;
    const real = traffic.routePlan(s, s.vehicles[0], s.buildings[0].pos, pos);
    const route = vi
      .spyOn(traffic, "routePlan")
      .mockImplementation((_s, _v, _from, target) => ({
        ...real,
        path: [s.buildings[0].pos, target],
        seconds,
        blockedUntil: 0,
      }));
    const result = verifyIncidentLocation(s, t, pos);
    expect(!!result).toBe(seconds <= 900);
    if (result) expect(result.driveSeconds).toBe(seconds);
    expect(route).toHaveBeenCalled();
    expect(s.vehicles.every((v) => v.status === "ready")).toBe(true);
  },
);

it("ein schneller Führungswagen und fremde oder unvollständige Wachen erweitern das Einsatzgebiet nicht", () => {
  const s = phaseFixture("owner", "bin"),
    t = mt("bin"),
    pos = s.missions[0].pos;
  s.vehicles[1].type = "elw";
  const real = traffic.routePlan(s, s.vehicles[0], s.buildings[0].pos, pos);
  vi.spyOn(traffic, "routePlan").mockImplementation((_s, v, _from, target) => ({
    ...real,
    path: [s.buildings[0].pos, target],
    seconds: v.type === "elw" ? 120 : 901,
    blockedUntil: 0,
  }));
  expect(verifyIncidentLocation(s, t, pos)).toBeUndefined();
  s.vehicles[0].owner = "foreign";
  clearReachabilityCache();
  expect(verifyIncidentLocation(s, t, pos)).toBeUndefined();
});

it("gebundene Fahrzeuge erhalten ihr Gebiet; veränderte Sperrungen machen den Routencache ungültig", () => {
  const s = phaseFixture("owner", "bin"),
    t = mt("bin"),
    pos = s.missions[0].pos;
  const real = traffic.routePlan(s, s.vehicles[0], s.buildings[0].pos, pos);
  const route = vi
    .spyOn(traffic, "routePlan")
    .mockImplementation((_s, _v, _from, target) => ({
      ...real,
      path: [s.buildings[0].pos, target],
      seconds: 899,
      blockedUntil: 0,
    }));
  expect(verifyIncidentLocation(s, t, pos)).toBeDefined();
  const n = route.mock.calls.length;
  s.vehicles.forEach((v) => (v.status = "travel"));
  expect(verifyIncidentLocation(s, t, pos)).toBeDefined();
  expect(route.mock.calls.length).toBe(n);
  s.environment!.roads.push({
    id: "new-closure",
    kind: "closure",
    edge: [1, 2],
    start: s.time,
    until: s.time + 600,
    delay: 0,
    blocked: true,
  });
  route.mockImplementation((_s, _v, _from, target) => ({
    ...real,
    path: [s.buildings[0].pos, target],
    seconds: 901,
    blockedUntil: 0,
  }));
  expect(verifyIncidentLocation(s, t, pos)).toBeUndefined();
  expect(route.mock.calls.length).toBeGreaterThan(n);
});

it("prüft tatsächliche Straßenroute, verwirft Nullpunkte und verbirgt interne Ortsreferenzen bis zur Abfrage", () => {
  const s = phaseFixture("owner", "bin"),
    m = s.missions[0],
    t = mt("bin");
  const result = verifyIncidentLocation(s, t, m.pos);
  expect(result).toBeDefined();
  expect(result!.driveSeconds).toBeLessThanOrEqual(900);
  expect(result!.profiles).toContain("hlf");
  expect(result!.siteRef).toContain("node:");
  expect(verifyIncidentLocation(s, t, { x: 0, y: 0 })).toBeUndefined();
  expect(verifyIncidentLocation(s, t, { x: NaN, y: 7 })).toBeUndefined();
  m.location = result;
  expect(publicSave(s).missions[0].location).toBeUndefined();
  m.control!.locationKnown = true;
  expect(publicSave(s).missions[0].location).toEqual(result);
});

it("hebt einen belegbar kaputten Altort einmalig ohne Geld-, XP- oder Statistikänderung auf", () => {
  const s = phaseFixture("owner", "bin"),
    m = s.missions[0];
  m.pos = { x: 0, y: 0 };
  delete m.location;
  const before = {
    money: s.money,
    xp: s.xp,
    completed: s.completed,
    stats: structuredClone(s.statistics),
  };
  queueLocationReview(s, m);
  repairIncidentLocations(s);
  expect(s.missions).toHaveLength(0);
  expect(s.archive[0].location!.state).toBe("technical-closure");
  tick(s, s.time + 10, {}, false, false);
  repairIncidentLocations(s);
  expect({
    money: s.money,
    xp: s.xp,
    completed: s.completed,
    stats: s.statistics,
  }).toEqual(before);
  expect(s.archive).toHaveLength(1);
  expect(
    validate(s).archive[0].control!.events.some(
      (e) => e.type === "LOCATION_TECHNICAL_CLOSURE",
    ),
  ).toBe(true);
});

it("migriert Ortsprüfung wiederholbar mit unveränderten Patienten, Vermögen und Originalort", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE saves(user_id TEXT PRIMARY KEY,data TEXT)");
  try {
    const s = phaseFixture("owner", "sick");
    attachDynamics(s, s.missions[0]);
    s.missions[0].pos = { ...nodes[25] };
    delete s.missions[0].location;
    const data = JSON.stringify(s);
    db.prepare("INSERT INTO saves VALUES(?,?)").run("owner", data);
    const plan = planLocationMigration(db);
    expect(plan.summary.pending).toBe(1);
    expect(db.prepare("SELECT data FROM saves").get()!.data).toBe(data);
    applyLocationMigration(db);
    const after = JSON.parse(
      String(db.prepare("SELECT data FROM saves").get()!.data),
    );
    expect(after.missions[0].location.original).toEqual(s.missions[0].pos);
    expect(after.money).toBe(s.money);
    expect(after.missions[0].dynamics.patients).toEqual(
      s.missions[0].dynamics!.patients,
    );
    expect(planLocationMigration(db).summary.pending).toBe(0);
  } finally {
    db.close();
  }
});

it("Bestandsprüfung erhält den Ort trotz inzwischen verkauftem Fachfahrzeug und pausiert technische Wartefälle ohne Vergütung", () => {
  const s = phaseFixture("owner", "bin"),
    m = s.missions[0];
  s.vehicles.forEach((v) => (v.type = "elw"));
  expect(verifyIncidentLocation(s, mt("bin"), m.pos)).toBeUndefined();
  expect(verifyIncidentLocation(s, mt("bin"), m.pos, false)).toBeDefined();
  queueLocationReview(s, m);
  m.control!.briefed = true;
  const before = { progress: m.progress, money: s.money, xp: s.xp };
  tick(s, s.time + 30, {}, false, false);
  expect({ progress: m.progress, money: s.money, xp: s.xp }).toEqual(before);
  repairIncidentLocations(s);
  expect(m.location!.state).toBe("verified");
});
