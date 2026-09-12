import { describe, expect, it, vi } from "vitest";
import { vt } from "../src/shared/catalog";
import { beginTrip, readiness, recall, tick } from "../src/shared/engine";
import { validate } from "../src/shared/model";
import { motionProfile } from "../src/shared/motion";
import { vehicleAvailability } from "../src/simulation/availability";
import { alarm } from "../src/simulation/dispatch";
import { FAULT_RECOVERY_GRACE } from "../src/simulation/fault-config";
import { breakVehicle, faultsTick } from "../src/simulation/faults";
import { setFms } from "../src/simulation/fms";
import {
  postIncidentTick,
  queuePostIncident,
  startPostIncident,
} from "../src/simulation/post-incident";
import * as random from "../src/simulation/random";
import { remainingRoadLegs } from "../src/simulation/road-continuation";
import { turnoutEstimate } from "../src/simulation/staffing";
import { vehiclePosition } from "../src/shared/vehicle-position";
import { distance } from "../src/shared/world";
import { phaseFixture } from "./dispatch-fixture";
import { sites as nodes } from "./fixtures/germany/locations";

function fixture() {
  const s = phaseFixture("return-fault-owner"),
    v = s.vehicles[0],
    m = s.missions[0];
  m.control!.locationKnown = true;
  m.control!.reportedTemplate = m.template;
  m.control!.briefed = true;
  v.path = [nodes[12]];
  v.status = "scene";
  v.mission = m.id;
  v.assignment = "previous-assignment";
  recall(s, v);
  s.time = v.depart + Math.min(8, (v.arrive - v.depart) / 3);
  return { s, v, m };
}
describe("return readiness and re-dispatch", () => {
  it.each(["rtw", "ktw", "grtw", "itw", "ith"])(
    "keeps an empty %s ready and queues work only for an actual transport",
    (type) => {
      const { s, v } = fixture(),
        t = vt(type);
      s.buildings[0].type = t.home;
      delete s.buildings[0].organization;
      v.type = type;
      for (const person of s.people)
        if (t.training) person.skills.push(t.training);
      expect(vehicleAvailability(s, v).alarmable).toBe(true);
      v.status = "scene";
      queuePostIncident(s, v);
      expect(v.postIncident).toBeUndefined();
      v.status = "transport";
      v.patients = 1;
      queuePostIncident(s, v);
      expect(v.postIncident!.tasks.map((task) => task.kind)).toEqual([
        "disinfection",
        "cleaning",
        "refill",
      ]);
      expect(
        v.postIncident!.tasks.reduce((sum, task) => sum + task.seconds, 0),
      ).toBeLessThanOrEqual(135);
      expect(() => recall(s, v)).toThrow("Personen");
      expect(v.patients).toBe(1);
      v.patients = 0;
      v.status = "return";
      expect(vehicleAvailability(s, v)).toMatchObject({
        alarmable: false,
        state: "POST_INCIDENT",
      });
      expect(readiness(s, v)).toContain("Desinfektion nach Rückkehr");
    },
  );
  it("preserves every shape vertex on the occupied directed edge and its partial distance", () => {
    const { s, v } = fixture();
    const from = nodes[0],
      via = { x: from.x + 1, y: from.y },
      end = { x: from.x + 2, y: from.y + 1 },
      next = { x: end.x + 1, y: end.y };
    v.path = [from, via, end, next];
    v.depart = s.time;
    const profile = motionProfile([
      { from, to: via, meters: 100, limit: 30, edge: "directed-road" },
      { from: via, to: end, meters: 150, limit: 30, edge: "directed-road" },
      { from: end, to: next, meters: 100, limit: 30, edge: "next-road" },
    ]);
    v.journey!.motion = profile.phases;
    v.arrive = s.time + profile.seconds;
    s.time += 4;
    const position = vehiclePosition(v, s.time),
      remaining = remainingRoadLegs(s, v, position);
    expect(remaining).toHaveLength(2);
    expect(remaining[0].from).toEqual(position);
    expect(remaining[0].to).toEqual(via);
    expect(remaining[0].meters).toBeCloseTo(
      100 - (position.x - from.x) * 100,
      8,
    );
    expect(remaining[1]).toMatchObject({
      from: via,
      to: end,
      meters: 150,
      edge: "directed-road",
    });
    v.journey!.blockedUntil = s.time + 60;
    v.journey!.motion = motionProfile(remaining).phases;
    v.path = [position];
    expect(vehiclePosition(v, s.time + 59)).toEqual(position);
    s.time += 59;
    expect(remainingRoadLegs(s, v, position).map((leg) => leg.to)).toEqual([
      via,
      end,
    ]);
  });
  it("reassigns the same boarded crew from the exact current road section, with FMS 1→3 and no turnout", () => {
    const { s, v, m } = fixture();
    const before = vehiclePosition(v, s.time),
      oldArrival = v.arrive;
    const crew = s.people.filter((p) => p.vehicle === v.id).map((p) => p.id);
    expect(distance(before, s.buildings[0].pos)).toBeGreaterThan(0.01);
    expect(vehicleAvailability(s, v)).toMatchObject({
      state: "RETURNING",
      alarmable: true,
      dispatchable: true,
      reason: "",
    });
    expect(turnoutEstimate(s, v)).toBe(0);
    alarm(s, m, [v.id], "owner");
    expect(v.status).toBe("travel");
    expect(v.depart).toBe(s.time);
    expect(v.turnout).toBeUndefined();
    expect(v.path[0]).toEqual(before);
    expect(vehiclePosition(v, s.time)).toEqual(before);
    expect(s.desk.fleet[v.id].code).toBe(3);
    expect(s.people.filter((p) => p.vehicle === v.id).map((p) => p.id)).toEqual(
      crew,
    );
    const assignment = v.assignment;
    expect(assignment).not.toBe("previous-assignment");
    expect(() => alarm(s, m, [v.id], "other-dispatcher")).toThrow();
    expect(v.assignment).toBe(assignment);
    // Tick the superseded home-arrival time with incident completion disabled.
    s.missions = [];
    tick(s, Math.max(s.time + 1, oldArrival + 1), {}, false, false);
    expect(v.status).not.toBe("ready");
    expect(v.mission).toBe(m.id);
    expect(v.assignment).toBe(assignment);
    expect(s.people.filter((p) => p.vehicle === v.id).map((p) => p.id)).toEqual(
      crew,
    );
  });
  it("does not schedule generic medical aftercare for a nontransport NEF", () => {
    const { s, v } = fixture();
    s.buildings[0].type = "ems";
    v.type = "nef";
    s.people.forEach((p) => p.skills.push("Notarzt"));
    v.status = "scene";
    queuePostIncident(s, v);
    expect(v.postIncident).toBeUndefined();
    recall(s, v);
    expect(readiness(s, v)).toBe("");
  });
  it("blocks actual passengers independently of the movement label or cached DTO", () => {
    const { s, v } = fixture();
    v.patients = 1;
    v.availability = {
      state: "AVAILABLE",
      alarmable: true,
      dispatchable: true,
      reason: "",
      crewPresent: 9,
      crewRequired: 9,
      crewCapacity: 9,
    };
    expect(vehicleAvailability(s, v).alarmable).toBe(false);
    expect(readiness(s, v)).toMatch(/Patient|Personen|Transport/);
  });
});
describe("persistent automatic short defect recovery", () => {
  it("keeps passengers and their hospital destination through repair", () => {
    const { s, v, m } = fixture();
    v.mission = m.id;
    v.assignment = "patient-trip";
    v.patients = 1;
    v.destination = "public-clinic";
    beginTrip(s, v, nodes[8], "transport");
    s.time += 1;
    const position = vehiclePosition(v, s.time);
    breakVehicle(s, v, "tire");
    const target = v.journey!.target;
    s.time = v.fault!.repairAt;
    faultsTick(s, v);
    expect(v.status).toBe("transport");
    expect(v.path[0]).toEqual(position);
    expect(v.journey!.target).toEqual(target);
    expect(v.destination).toBe("public-clinic");
    expect(v.assignment).toBe("patient-trip");
    expect(v.patients).toBe(1);
    expect(s.desk.fleet[v.id].code).toBe(7);
    expect(readiness(s, v)).toContain("an Bord");
  });
  it("preserves independent station aftercare and does not reroll faults during its grace period", () => {
    const { s, v } = fixture();
    v.status = "ready";
    v.path = [s.buildings[0].pos];
    v.postIncident = {
      mission: "",
      queuedAt: s.time,
      current: 0,
      tasks: [{ kind: "maintenance", seconds: 120 }],
    };
    startPostIncident(s, v);
    breakVehicle(s, v, "radio");
    s.time = v.fault!.repairAt;
    faultsTick(s, v);
    expect(v.status).toBe("ready");
    expect(v.postIncident).toBeDefined();
    expect(s.desk.fleet[v.id].code).toBe(6);
    expect(readiness(s, v)).toBe("Wartung läuft.");
    s.time = v.postIncident!.until!;
    postIncidentTick(s, v);
    expect(readiness(s, v)).toBe("");
    expect(s.desk.fleet[v.id].code).toBe(2);
    beginTrip(s, v, nodes[12], "travel");
    const draw = vi.spyOn(random, "sample").mockReturnValue(0);
    try {
      s.time = v.fault!.repairAt + FAULT_RECOVERY_GRACE - 1;
      faultsTick(s, v, true);
      expect(draw).not.toHaveBeenCalled();
      s.time++;
      faultsTick(s, v, true);
      expect(v.fault!.state).toBe("repairing");
      expect(draw).toHaveBeenCalled();
    } finally {
      draw.mockRestore();
    }
  });
  it("automatically repairs without an order and resumes the same trip, crew and assignment", () => {
    const { s, v, m } = fixture();
    v.status = "ready";
    v.path = [nodes[0]];
    v.mission = m.id;
    v.assignment = "fault-assignment";
    beginTrip(s, v, nodes[12], "travel");
    s.time = v.depart + 4;
    const before = vehiclePosition(v, s.time);
    breakVehicle(s, v, "technical");
    expect(s.desk.fleet[v.id].code).toBe(6);
    expect(v.fault).toMatchObject({ state: "repairing", position: before });
    expect(v.fault!.repairAt).toBeGreaterThan(s.time);
    expect(v.fault!.repairAt - s.time).toBeLessThanOrEqual(180);
    const restored = validate(JSON.parse(JSON.stringify(s)));
    const end = v.fault!.repairAt;
    for (const save of [s, restored]) {
      save.time = end;
      faultsTick(save, save.vehicles[0]);
      faultsTick(save, save.vehicles[0]);
    }
    expect(restored).toEqual(s);
    expect(v.fault!.state).toBe("repaired");
    expect(v.path[0]).toEqual(before);
    expect(vehiclePosition(v, s.time)).toEqual(before);
    expect(v.assignment).toBe("fault-assignment");
    expect(v.mission).toBe(m.id);
    expect(v.status).toBe("travel");
    expect(s.desk.fleet[v.id].code).toBe(3);
    expect(
      m.control!.events.filter((e) => e.type === "VEHICLE_REPAIRED"),
    ).toHaveLength(1);
  });
  it("recovers legacy awaiting faults without resetting their persisted start time", () => {
    const { s, v } = fixture();
    v.fault = {
      kind: "radio",
      since: s.time - 500,
      repairAt: 0,
      state: "awaiting",
      mission: "",
      assignment: "",
      position: vehiclePosition(v, s.time),
    };
    setFms(s, v, 6);
    faultsTick(s, v);
    expect(v.fault.state).toBe("repaired");
    expect(v.status).toBe("return");
    expect(s.desk.fleet[v.id].code).toBe(1);
  });
});
