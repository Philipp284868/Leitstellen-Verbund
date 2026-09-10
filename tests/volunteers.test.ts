import { describe, expect, it } from "vitest";
import { apply, readiness, recall, tick } from "../src/engine";
import { validate } from "../src/model";
import { xpForLevel } from "../src/progression";
import { alarm } from "../src/simulation/dispatch";
import { publicSave } from "../src/simulation/incidents";
import { organizationCommand } from "../src/simulation/organizations";
import {
  crewRequired,
  crewSummaries,
  crewSummary,
  newStationProfile,
  personDuty,
  planTurnout,
  PROFESSIONAL_FIRE,
  reserveWarning,
  stationCapacity,
  stationProfile,
  suitableCrew,
  turnoutEstimate,
  validateStaffing,
} from "../src/simulation/staffing";
import {
  forceVolunteerAvailability,
  volunteerAvailability,
  volunteerCalendar,
  volunteerMarkers,
  volunteerPosition,
} from "../src/simulation/volunteers";
import { sites as nodes } from "./fixtures/germany/locations";
import { organizationFixture } from "./mutual-aid-fixture";

function ffFixture() {
  const s = organizationFixture("volunteer-test"),
    b = s.buildings[0];
  b.organization = newStationProfile("fire");

  s.seed = 83624;
  for (const [index, p] of s.people.entries()) {
    p.vehicle = null;
    p.duty = {
      ...personDuty(s, p),
      homeNode: Math.min(nodes.length - 1, index + 1),
      workNode: Math.min(nodes.length - 1, index + 1),
    };
  }
  return s;
}
function force(s: ReturnType<typeof ffFixture>, value: boolean) {
  forceVolunteerAvailability(s, value, 7200);
}

describe("Freiwillige Wachen, NPC-Anreise und BF-Fortschritt", () => {
  it("neue Feuerwehr ist FF, bestehendes fehlendes Profil bleibt BF und Kapazitäten unterscheiden sich", () => {
    const s = ffFixture(),
      b = s.buildings[0];
    expect(newStationProfile("fire")?.kind).toBe("ff");
    expect(newStationProfile("school")).toBeUndefined();
    expect(stationCapacity(b)).toEqual({ slots: 4, people: 45 });
    delete b.organization;
    expect(stationProfile(b).kind).toBe("bf");
    expect(stationCapacity(b)).toEqual({ slots: 8, people: 81 });
  });
  it("Kalender berücksichtigt Wochenenden und nationale feste sowie bewegliche Feiertage", () => {
    expect(volunteerCalendar(Date.UTC(2026, 8, 7, 9) / 1000).work).toBe(true);
    expect(volunteerCalendar(Date.UTC(2026, 8, 6, 9) / 1000).weekend).toBe(
      true,
    );
    expect(volunteerCalendar(Date.UTC(2026, 4, 1, 9) / 1000)).toMatchObject({
      holiday: true,
      work: false,
    });
    expect(volunteerCalendar(Date.UTC(2026, 3, 6, 9) / 1000)).toMatchObject({
      holiday: true,
      work: false,
    });
  });
  it("private Verfügbarkeit bleibt reproduzierbar und kann nicht über normale Dienst-Aktionen gesteuert werden", () => {
    const s = ffFixture(),
      p = s.people[0],
      before = structuredClone(s);
    const responses = s.people.map((p) => volunteerAvailability(s, p, p.duty!));
    expect(
      before.people.map((p) => volunteerAvailability(before, p, p.duty!)),
    ).toEqual(responses);
    expect(responses.some(Boolean)).toBe(true);
    const changedGenerator = { ...s, seed: s.seed + 327 };
    expect(
      changedGenerator.people.map((p) =>
        volunteerAvailability(changedGenerator, p, p.duty!),
      ),
    ).toEqual(responses);
    const privateChange = {
      ...p.duty!,
      standby: true,
      reachability: 0,
      absence: "vacation" as const,
    };
    expect(volunteerAvailability(s, p, privateChange)).toBe(
      volunteerAvailability(s, p, p.duty!),
    );
    expect(() =>
      organizationCommand(
        s,
        { type: "person-duty", person: p.id, duty: privateChange },
        "volunteer-test",
      ),
    ).toThrow("ausschließlich simuliert");
    expect(s).toEqual(before);
  });
  it("FF ist aus dem Wachenpool alarmierbar ohne vorab einzelne Kräfte fest zuzuweisen", () => {
    const s = ffFixture(),
      v = s.vehicles[0];
    expect(s.people.every((p) => p.vehicle === null)).toBe(true);
    expect(readiness(s, v)).toBe("");
    expect(crewSummary(s, v)).toMatchObject({
      present: 0,
      eligible: 12,
      required: 6,
      capacity: 9,
    });
    expect(crewSummaries(s).get(v.id)).toEqual(crewSummary(s, v));
    expect(crewRequired(s, { ...v, type: "tsf" })).toBe(4);
    expect(crewRequired(s, { ...v, type: "tlf" })).toBe(3);
  });
  it("ETA-Vorschau verändert weder Personal noch Alarmzusagen", () => {
    const s = ffFixture(),
      before = structuredClone(s);
    for (const v of s.vehicles)
      expect(turnoutEstimate(s, v)).toBeGreaterThan(0);
    expect(s).toEqual(before);
  });
  it("gestaffelte echte NPC-Anreise bildet Besatzung, fährt erst danach aus und überlebt Speichern", () => {
    const s = ffFixture(),
      v = s.vehicles[0];
    force(s, true);
    alarm(s, s.missions[0], [v.id], s.player.id);
    expect(v.status).toBe("alarmed");
    const arrivals = v.turnout!.arrivals;
    expect(arrivals).toHaveLength(6);
    expect(new Set(arrivals.map((a) => a.at)).size).toBeGreaterThan(1);
    for (const a of arrivals) {
      expect(a.path!.length).toBeGreaterThan(1);
      expect(a.motion!.length).toBeGreaterThan(0);
      expect(a.path!.at(-1)).toEqual(s.buildings[0].pos);
      expect(a.at).toBeGreaterThan(a.depart!);
    }
    const moving = arrivals.find((a) => a.at > a.depart! + 1)!;
    expect(volunteerPosition(moving, moving.depart! - 1)).toBeNull();
    expect(
      volunteerMarkers(s, (moving.depart! + moving.at) / 2).length,
    ).toBeGreaterThan(0);
    const position = volunteerPosition(
      moving,
      (moving.depart! + moving.at) / 2,
    )!;
    expect(position).not.toEqual(moving.path![0]);
    expect(position).not.toEqual(s.buildings[0].pos);
    const loaded = validate(JSON.parse(JSON.stringify(s)));
    const lastArrival = Math.max(...arrivals.map((a) => a.at));
    tick(s, lastArrival - 0.1, {}, false, false);
    tick(loaded, lastArrival - 0.1, {}, false, false);
    expect(v.status).toBe("alarmed");
    expect(crewSummary(s, v).present).toBeLessThan(6);
    tick(s, lastArrival + 1, {}, false, false);
    tick(loaded, lastArrival + 1, {}, false, false);
    expect(v.status).toBe("travel");
    expect(s.desk.fleet[v.id].code).toBe(3);
    expect(loaded).toEqual(s);
    expect(s.people.filter((p) => p.duty?.load)).toHaveLength(6);
  });
  it("gleichzeitige FF-Alarme teilen keine Einsatzkraft und nutzen verbleibende Kräfte für kleine Fahrzeuge", () => {
    const s = ffFixture();
    force(s, true);
    alarm(
      s,
      s.missions[0],
      s.vehicles.map((v) => v.id),
      s.player.id,
    );
    const persons = s.vehicles.flatMap((v) =>
      v.turnout!.arrivals.map((a) => a.person),
    );
    expect(persons).toHaveLength(9);
    expect(new Set(persons).size).toBe(9);
    expect(() => validateStaffing(s)).not.toThrow();
    s.vehicles[1].turnout!.arrivals[0].person =
      s.vehicles[0].turnout!.arrivals[0].person;
    expect(() => validateStaffing(s)).toThrow("Personalbindung");
  });
  it("fehlende Quittierungen halten das Fahrzeug an der Wache und erzeugen eine Ersatzanforderung", () => {
    const s = ffFixture(),
      v = s.vehicles[0];
    force(s, false);
    alarm(s, s.missions[0], [v.id], s.player.id);
    expect(v.turnout!.arrivals).toHaveLength(0);
    expect(v.path[0]).toEqual(s.buildings[0].pos);
    tick(s, s.time + 599, {}, false, false);
    expect(v.status).toBe("alarmed");
    tick(s, s.time + 2, {}, false, false);
    expect(v.mission).toBeNull();
    expect(
      s.missions[0].control!.events.some((e) => e.type === "TURNOUT_FAILED"),
    ).toBe(true);
    expect(
      s.missions[0].control!.radio.some((r) =>
        r.details.includes("Besatzung fehlt"),
      ),
    ).toBe(true);
  });
  it("Ausbildung bleibt Voraussetzung und unpassende Kräfte besetzen kein Sonderfahrzeug", () => {
    const s = ffFixture(),
      v = s.vehicles[0];
    v.type = "dlk";
    // Deliberately malformed/legacy roster: automatic provisioning normally supplies this skill.
    for (const p of s.people)
      p.skills = p.skills.filter((skill) => skill !== "Drehleiter");
    force(s, true);
    expect(suitableCrew(s, v)).toHaveLength(0);
    expect(readiness(s, v)).toContain("Besatzung");
    for (const p of s.people.slice(0, 3)) p.skills.push("Drehleiter");
    alarm(s, s.missions[0], [v.id], s.player.id);
    expect(
      v.turnout!.arrivals.every((a) =>
        s.people.find((p) => p.id === a.person)!.skills.includes("Drehleiter"),
      ),
    ).toBe(true);
    expect(v.turnout!.arrivals).toHaveLength(3);
  });
  it("FF-Privatdaten verschwinden aus Snapshots, sichtbare Anfahrten bleiben erhalten", () => {
    const s = ffFixture(),
      v = s.vehicles[0];
    force(s, true);
    alarm(s, s.missions[0], [v.id], s.player.id);
    const view = publicSave(s);
    expect(view.people.every((p) => p.duty === undefined)).toBe(true);
    expect(view.vehicles[0].turnout!.arrivals[0].path).toEqual(
      v.turnout!.arrivals[0].path,
    );
    expect(s.people[0].duty).toBeDefined();
  });
  it("Rückfahrt bleibt mit FMS1 alarmierbar und gibt erst an der Wache den FF-Pool frei", () => {
    const s = ffFixture(),
      v = s.vehicles[0];
    force(s, true);
    alarm(s, s.missions[0], [v.id], s.player.id);
    tick(s, v.depart + 20, {}, false, false);
    recall(s, v);
    expect(v.status).toBe("return");
    expect(s.desk.fleet[v.id].code).toBe(1);
    expect(readiness(s, v)).toBe("");
    expect(s.people.some((p) => p.vehicle === v.id)).toBe(true);
    tick(s, v.arrive + 1, {}, false, false);
    expect(v.status).toBe("ready");
    expect(s.people.some((p) => p.vehicle === v.id)).toBe(false);
    expect(readiness(s, v)).toBe("");
  });
  it("BF ist ein kostenpflichtiger späterer Ausbau ohne Umgehung über Profiländerungen", () => {
    const s = ffFixture(),
      b = s.buildings[0];
    const startingMoney = PROFESSIONAL_FIRE.price + 100000;
    s.money = startingMoney;
    s.xp = 0;
    expect(() =>
      organizationCommand(
        s,
        { type: "station-upgrade-bf", home: b.id },
        s.player.id,
      ),
    ).toThrow("Stufe");
    expect(() =>
      organizationCommand(
        s,
        {
          type: "station-profile",
          home: b.id,
          profile: { ...b.organization!, kind: "bf" },
        },
        s.player.id,
      ),
    ).toThrow("BF-Ausbau");
    s.xp = xpForLevel(PROFESSIONAL_FIRE.level);
    organizationCommand(
      s,
      { type: "station-upgrade-bf", home: b.id },
      s.player.id,
    );
    expect(s.money).toBe(startingMoney - PROFESSIONAL_FIRE.price);
    expect(stationCapacity(b)).toEqual({ slots: 8, people: 81 });
    expect(b.ready).toBe(s.time + PROFESSIONAL_FIRE.seconds);
    expect(() =>
      organizationCommand(
        s,
        { type: "station-upgrade-bf", home: b.id },
        s.player.id,
      ),
    ).toThrow("Voraussetzung");
    s.time = b.ready;
    const v = s.vehicles[0];
    apply(s, { type: "assign", vehicle: v.id });
    expect(crewSummary(s, v).present).toBe(9);
    expect(planTurnout(s, v, 60)).toBe(20);
  });
  it("Reservewarnungen verbieten keine Alarmierung", () => {
    const s = ffFixture(),
      v = s.vehicles[0];
    v.reserve = true;
    s.buildings[0].organization!.reserve = 10;
    expect(reserveWarning(s, v)).toContain("Reserve");
    expect(readiness(s, v)).toBe("");
    force(s, true);
    expect(() => alarm(s, s.missions[0], [v.id], s.player.id)).not.toThrow();
  });
  it("Snapshot-Besatzungsindex verarbeitet 500 Fahrzeuge und 4500 Kräfte ohne erneute Bindungsscans pro Fahrzeug", () => {
    const s = ffFixture(),
      station = s.buildings[0],
      vehicle = s.vehicles[0],
      person = s.people[0];
    s.buildings = [];
    s.vehicles = [];
    s.people = [];
    let reads = 0;
    for (let home = 0; home < 20; home++) {
      const id = `performance-home-${home}`,
        ff = home % 2 === 0;
      s.buildings.push({
        ...station,
        id,
        level: 10,
        organization: { ...station.organization!, kind: ff ? "ff" : "bf" },
      });
      for (let unit = 0; unit < 25; unit++) {
        const vehicleId = `${id}-unit-${unit}`;
        s.vehicles.push({ ...vehicle, id: vehicleId, home: id });
        for (let crew = 0; crew < 9; crew++)
          s.people.push(
            new Proxy(
              {
                ...person,
                id: `${vehicleId}-crew-${crew}`,
                home: id,
                vehicle: ff ? null : vehicleId,
              },
              {
                get(target, key, receiver) {
                  if (key === "vehicle") reads++;
                  return Reflect.get(target, key, receiver);
                },
              },
            ),
          );
      }
    }
    const summaries = crewSummaries(s);
    expect(summaries.size).toBe(500);
    expect(summaries.get(s.vehicles[0].id)).toMatchObject({
      present: 0,
      eligible: 225,
    });
    expect(summaries.get(s.vehicles[25].id)).toMatchObject({
      present: 9,
      eligible: 9,
    });
    expect(reads).toBeLessThan(25000);
  });
});
