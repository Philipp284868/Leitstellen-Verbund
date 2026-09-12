import { fixturePurchase } from "./fixtures/germany/facilities";
import { describe, expect, it } from "vitest";
import { apply, generate, recall, tick } from "../src/shared/engine";
import { fresh, validate, type Save } from "../src/shared/model";
import { sites as nodes } from "./fixtures/germany/locations";

import { BALANCE, vt } from "../src/shared/catalog";
import { xpForLevel } from "../src/shared/progression";
import { vehicleAvailability } from "../src/simulation/availability";
import {
  buildingStaffingPlan,
  buildingStaffingStatus,
  migrateBuildingStaffing,
  reconcileBuildingStaffing,
} from "../src/simulation/building-staffing";
import { attachIncident } from "../src/simulation/calls";
import { alarm } from "../src/simulation/dispatch";
import {
  crewAllocator,
  crewSummary,
  newStationProfile,
  personAvailable,
  personDuty,
  stationCapacity,
  stationProfile,
} from "../src/simulation/staffing";
import { volunteerAvailability } from "../src/simulation/volunteers";
import { vehiclePosition } from "../src/shared/vehicle-position";

function emptyDesk() {
  const s = fresh("Automatik", "Testwache", 1000);
  s.generation = "aa310000-2222-4333-8444-555555555555";
  s.xp = xpForLevel(30);
  s.seed = 124;
  s.money = 1e10;
  return s;
}

function station(type = "fire", professional = false) {
  const s = emptyDesk();
  apply(s, fixturePurchase(type, nodes[0]));
  if (professional && type === "fire")
    s.buildings[0].organization = { ...newStationProfile("fire")!, kind: "bf" };
  tick(s, s.time + BALANCE.buildSeconds, {}, false, false);
  return s;
}
function buy(s: Save, type: string) {
  apply(s, { type: "buy", home: s.buildings[0].id, kind: type });
  return s.vehicles.at(-1)!;
}
function mission(s: Save) {
  generate(s);
  const m = s.missions.at(-1)!;
  m.template = "field";
  m.pos = nodes[2];
  attachIncident(s, m);
  m.control!.locationKnown = true;
  m.control!.reportedTemplate = "reported-fire";
  return m;
}

describe("automatic building staffing", () => {
  it("commissions a new station with real staff without a hire action", () => {
    const s = emptyDesk();
    apply(s, fixturePurchase("fire", nodes[0]));
    expect(s.people).toHaveLength(0);
    tick(s, s.time + BALANCE.buildSeconds, {}, false, false);
    expect(s.people.length).toBeGreaterThanOrEqual(vt("tsf").crew);
  });

  it("makes a permitted ambulance usable immediately after purchase without assignment", () => {
    const s = emptyDesk();
    apply(s, fixturePurchase("ems", nodes[0]));
    tick(s, s.time + BALANCE.buildSeconds, {}, false, false);
    apply(s, { type: "buy", home: s.buildings[0].id, kind: "rtw" });
    const crew = crewSummary(s, s.vehicles[0]);
    expect(crew.present).toBeGreaterThanOrEqual(crew.required);
  });

  it("provisions all legal fire slots, with separate crews for one simultaneous alarm", () => {
    const s = station(),
      b = s.buildings[0];
    const fleet = Array.from({ length: stationCapacity(b).slots }, () =>
      buy(s, "lf"),
    );
    expect(s.people.length).toBeGreaterThanOrEqual(
      fleet.length * vt("lf").crew,
    );
    const allocate = crewAllocator(s);
    expect(fleet.map(allocate)).toEqual([true, true, true, true]);
    alarm(
      s,
      mission(s),
      fleet.map((v) => v.id),
      s.player.id,
    );
    const ids = fleet.flatMap((v) =>
      v.turnout!.arrivals.filter((a) => a.available).map((a) => a.person),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      fleet.every((v) => v.turnout!.arrivals.length >= v.turnout!.minimum),
    ).toBe(true);
    expect(
      fleet.every((v) =>
        v.turnout!.arrivals.every((a) =>
          s.people.find((p) => p.id === a.person)?.professional
            ? a.at === s.time
            : !!a.path?.length && a.at > s.time,
        ),
      ),
    ).toBe(true);
    expect(() => validate(s)).not.toThrow();
  });

  it("keeps FF calendar and response time while guaranteeing ordinary baseline availability", () => {
    const s = station(),
      p = s.people[0];
    p.duty = personDuty(s, p);
    for (const time of [
      Date.UTC(2026, 8, 7, 9),
      Date.UTC(2026, 8, 6, 3),
      Date.UTC(2026, 11, 25, 23),
    ]) {
      s.time = time / 1000;
      expect(volunteerAvailability(s, p, p.duty)).toBe(true);
    }
    p.injury = {
      mission: "old-incident",
      patient: "old-patient",
      since: s.time,
      state: "recovery",
      until: s.time + 100,
    };
    expect(volunteerAvailability(s, p, p.duty)).toBe(false);
  });

  it("does not introduce a roster absence for automatically covered professional stations", () => {
    const s = station("ems"),
      v = buy(s, "rtw"),
      p = s.people.find((p) => p.vehicle === v.id)!;
    p.duty = {
      ...personDuty(s, p),
      shift: "day",
      absence: "vacation",
      until: s.time + 1000,
      reachability: 0,
    };
    expect(personAvailable(s, p)).toBe("");
    expect(vehicleAvailability(s, v).alarmable).toBe(true);
    expect(buildingStaffingStatus(s, s.buildings[0]).label).toBe(
      "Betriebsbereit",
    );
  });

  it("provides newly unlocked qualifications only with the actual completed building function", () => {
    const s = emptyDesk();
    s.xp = xpForLevel(11);
    apply(s, fixturePurchase("ems", nodes[0]));
    tick(s, s.time + BALANCE.buildSeconds, {}, false, false);
    const b = s.buildings[0];
    expect(buildingStaffingPlan(s, b).qualifications).not.toContain("Notarzt");
    apply(s, { type: "extension", id: b.id, kind: "doctor" });
    expect(s.people.every((p) => !p.skills.includes("Notarzt"))).toBe(true);
    tick(s, b.ready, {}, false, false);
    expect(s.people.every((p) => p.skills.includes("Notarzt"))).toBe(true);
    const v = buy(s, "nef");
    expect(vehicleAvailability(s, v).dispatchable).toBe(true);
    expect(
      s.people
        .filter((p) => p.vehicle === v.id)
        .every((p) => p.skills.includes("Notarzt")),
    ).toBe(true);
  });

  it("makes additional slots usable after an upgrade without a second recruitment delay", () => {
    const s = station(),
      b = s.buildings[0];
    for (let i = 0; i < 4; i++) buy(s, "lf");
    const oldIds = s.people.map((p) => p.id);
    apply(s, { type: "upgrade", id: b.id });
    expect(s.people.map((p) => p.id)).toEqual(oldIds);
    tick(s, b.ready, {}, false, false);
    for (let i = 0; i < 4; i++) buy(s, "lf");
    expect(s.vehicles).toHaveLength(8);
    expect(s.people.length).toBeGreaterThanOrEqual(72);
    expect(s.vehicles.every((v) => vehicleAvailability(s, v).alarmable)).toBe(
      true,
    );
  });

  it("never adds a replacement to a transport or heals its injured bound crew", () => {
    const s = station("ems"),
      v = buy(s, "rtw");
    v.status = "transport";
    v.mission = "bound-incident";
    v.assignment = "bound-assignment";
    v.patients = 1;
    v.destination = "public";
    const p = s.people.find((p) => p.vehicle === v.id)!;
    p.injury = {
      mission: "bound-incident",
      patient: "bound-patient",
      since: s.time,
      state: "treatment",
      until: 0,
    };
    const before = structuredClone({
      vehicle: v,
      people: s.people.filter((p) => p.vehicle === v.id),
    });
    reconcileBuildingStaffing(s);
    expect(v).toEqual(before.vehicle);
    expect(s.people.filter((p) => p.vehicle === v.id)).toEqual(before.people);
    expect(vehicleAvailability(s, v).alarmable).toBe(false);
  });

  it("replaces an injured standby member within station capacity and retains the injury record", () => {
    const s = station("ems"),
      v = buy(s, "rtw"),
      p = s.people.find((p) => p.vehicle === v.id)!;
    p.injury = {
      mission: "previous",
      patient: "casualty",
      since: s.time,
      state: "recovery",
      until: s.time + 900,
    };
    const injury = structuredClone(p.injury),
      identity = p.id;
    reconcileBuildingStaffing(s);
    expect(s.people.find((person) => person.id === identity)?.injury).toEqual(
      injury,
    );
    expect(p.vehicle).toBeNull();
    expect(
      s.people
        .filter((person) => person.vehicle === v.id)
        .map((person) => person.id),
    ).not.toContain(identity);
    expect(vehicleAvailability(s, v).dispatchable).toBe(true);
    expect(s.people.length).toBeLessThanOrEqual(
      stationCapacity(s.buildings[0]).people,
    );
  });

  it("preserves a returning occupied crew and exact road position through provisioning and an upgrade", () => {
    const s = station("fire", true),
      v = buy(s, "lf"),
      b = s.buildings[0];
    v.status = "scene";
    v.path = [nodes[12]];
    recall(s, v);
    s.time = v.depart + Math.min(2, (v.arrive - v.depart) / 3);
    const before = structuredClone(v),
      ids = s.people.filter((p) => p.vehicle === v.id).map((p) => p.id),
      position = vehiclePosition(v, s.time);
    apply(s, { type: "upgrade", id: b.id });
    reconcileBuildingStaffing(s);
    expect(v).toEqual(before);
    expect(vehiclePosition(v, s.time)).toEqual(position);
    expect(s.people.filter((p) => p.vehicle === v.id).map((p) => p.id)).toEqual(
      ids,
    );
    expect(vehicleAvailability(s, v)).toMatchObject({
      state: "RETURNING",
      alarmable: true,
    });
  });

  it("migrates paid training once and preserves profiles, original people and balance", () => {
    const s = station("fire", true),
      v = buy(s, "lf"),
      b = s.buildings[0];
    delete s.staffing;
    delete b.organization;
    const person = s.people[0];
    person.training = "Gefahrgut";
    person.ready = s.time + 180;
    const ids = s.people.map((p) => p.id),
      originalMoney = s.money;
    const change = migrateBuildingStaffing(s);
    expect(change.completedTraining).toBe(1);
    expect(stationProfile(b).kind).toBe("bf");
    expect(s.people.filter((p) => ids.includes(p.id))).toHaveLength(ids.length);
    expect(person.skills).toContain("Gefahrgut");
    expect(person.training).toBe("");
    expect(s.money).toBe(originalMoney);
    expect(vehicleAvailability(s, v).dispatchable).toBe(true);
    const migrated = structuredClone(s);
    expect(migrateBuildingStaffing(s)).toMatchObject({
      migrated: false,
      added: 0,
      assigned: 0,
      completedTraining: 0,
    });
    expect(s).toEqual(migrated);
    expect(
      migrateBuildingStaffing(validate(JSON.parse(JSON.stringify(s)))),
    ).toMatchObject({ migrated: false, added: 0 });
  });

  it("finishes pending training in a cloned dry run without touching its source", () => {
    const source = station();
    delete source.staffing;
    source.people[0].training = "Führung";
    source.people[0].ready = source.time + 500;
    const before = structuredClone(source),
      preview = structuredClone(source);
    expect(migrateBuildingStaffing(preview).completedTraining).toBe(1);
    expect(source).toEqual(before);
  });

  it("does not materialize dispatch crews for real map POIs or infrastructure service buildings", () => {
    const s = emptyDesk();
    reconcileBuildingStaffing(s);
    expect(s.people).toHaveLength(0);
    for (const [index, type] of ["hospital", "school"].entries()) {
      s.buildings.push({
        id: `service-${index}`,
        owner: s.player.id,
        type,
        name: type,
        pos: nodes[index * 10],
        level: 1,
        ready: s.time,
        extensions: [],
      });
    }
    reconcileBuildingStaffing(s);
    expect(s.people).toHaveLength(0);
    expect(s.buildings.map((b) => buildingStaffingStatus(s, b).label)).toEqual([
      "Betriebsbereit",
      "Betriebsbereit",
    ]);
  });

  it("treats repeated old hire and assign requests as free no-ops on a complete station", () => {
    const s = station("ems"),
      v = buy(s, "rtw"),
      before = structuredClone(s);
    for (let i = 0; i < 3; i++) {
      apply(s, { type: "hire", home: v.home, count: 30 });
      apply(s, { type: "assign", vehicle: v.id });
    }
    expect(s.people).toEqual(before.people);
    expect(s.money).toBe(before.money);
    expect(s.journal).toEqual(before.journal);
  });
});
