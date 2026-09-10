import { expect, it } from "vitest";
import { vehicleAvailability } from "../src/simulation/availability";
import { postIncidentSchema } from "../src/simulation/availability-schema";
import { alarm } from "../src/simulation/dispatch";
import {
  postIncidentTick,
  startPostIncident,
} from "../src/simulation/post-incident";
import {
  crewSummary,
  newStationProfile,
  personAvailable,
  personDuty,
  turnoutReady,
} from "../src/simulation/staffing";
import {
  forceVolunteerAvailability,
  volunteerAvailability,
} from "../src/simulation/volunteers";
import { phaseFixture } from "./dispatch-fixture";

it("rejects incomplete, impossible and misindexed persisted post-incident work", () => {
  const pending = {
    mission: "",
    queuedAt: 100,
    tasks: [{ kind: "cleaning" as const, seconds: 30 }],
    current: 0,
  };
  const active = { ...pending, startedAt: 110, until: 140 };
  expect(postIncidentSchema.safeParse(pending).success).toBe(true);
  expect(postIncidentSchema.safeParse(active).success).toBe(true);
  for (const malformed of [
    { ...pending, current: 1 },
    { ...pending, startedAt: 110 },
    { ...pending, until: 140 },
    { ...active, startedAt: 90, until: 120 },
    { ...active, until: 100 },
    { ...active, until: 141 },
  ])
    expect(postIncidentSchema.safeParse(malformed).success).toBe(false);
});

it("recovers queued work at station exactly once and keeps dispatch locked until every task ends", () => {
  const s = phaseFixture("aftercare-recovery"),
    v = s.vehicles[0];
  v.postIncident = {
    mission: "",
    queuedAt: s.time,
    tasks: [
      { kind: "cleaning", seconds: 30 },
      { kind: "refill", seconds: 20 },
    ],
    current: 0,
  };
  expect(vehicleAvailability(s, v).alarmable).toBe(false);
  postIncidentTick(s, v);
  const startedAt = v.postIncident.startedAt;
  s.time += 30;
  postIncidentTick(s, v);
  expect(v.postIncident.current).toBe(1);
  expect(vehicleAvailability(s, v).reason).toContain("aufgefüllt");
  startPostIncident(s, v);
  expect(v.postIncident.startedAt).toBe(startedAt);
  s.time += 20;
  postIncidentTick(s, v);
  postIncidentTick(s, v);
  expect(v.postIncident).toBeUndefined();
  expect(vehicleAvailability(s, v).alarmable).toBe(true);
  expect(s.desk.fleet[v.id].code).toBe(2);
});

it("injury blocks both regular crews and volunteer overrides, including injuries during turnout", () => {
  const s = phaseFixture("injured-volunteer"),
    v = s.vehicles[0],
    p = s.people[0];
  s.buildings[0].organization = newStationProfile("fire");
  for (const person of s.people) person.vehicle = null;
  forceVolunteerAvailability(s, true, 7200);
  p.injury = {
    mission: s.missions[0].id,
    patient: "injured-person",
    since: s.time,
    state: "treatment",
    until: 0,
  };
  expect(personAvailable(s, p)).toContain("verletzt");
  expect(volunteerAvailability(s, p, personDuty(s, p))).toBe(false);
  p.injury.state = "recovery";
  p.injury.until = s.time + 100;
  expect(personAvailable(s, p)).toContain("Genesung");
  p.injury.until = s.time;
  expect(personAvailable(s, p)).toBe("");
  s.missions[0].control!.locationKnown = true;
  s.missions[0].control!.reportedTemplate = "field";
  alarm(s, s.missions[0], [v.id], s.player.id);
  const responder = s.people.find(
    (person) => person.id === v.turnout!.arrivals[0].person,
  )!;
  responder.injury = { ...p.injury, state: "treatment" };
  s.time = v.depart;
  expect(crewSummary(s, v).present).toBe(v.turnout!.minimum - 1);
  expect(turnoutReady(s, v)).toBe(false);
  responder.injury.state = "dead";
  expect(volunteerAvailability(s, responder, personDuty(s, responder))).toBe(
    false,
  );
});
