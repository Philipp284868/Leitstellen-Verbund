import { describe, expect, it } from "vitest";
import { fresh, type Save } from "../src/model";
import { readiness } from "../src/engine";
import { fleetReadiness } from "../src/fleet-view";

function roster(stations = 3, units = 4, crew = 6) {
  const s = fresh("Test", "Leitstelle", 9 * 3600);
  for (let home = 0; home < stations; home++) {
    const id = `home-${home}`;
    s.buildings.push({
      id,
      owner: s.player.id,
      type: "fire",
      name: id,
      pos: { x: 1000 + home * 300, y: 1000 },
      level: 10,
      ready: 0,
      extensions: [],
      organization: { kind: "bf", crew: "normal", turnout: 30, reserve: 0 },
    });
    for (let index = 0; index < units; index++) {
      const vehicle = `vehicle-${home}-${index}`;
      s.vehicles.push({
        id: vehicle,
        owner: s.player.id,
        home: id,
        type: "tsf",
        name: vehicle,
        favorite: false,
        status: "ready",
        mission: null,
        assignment: null,
        path: [s.buildings.at(-1)!.pos],
        depart: 0,
        arrive: 0,
        patients: 0,
      });
      for (let n = 0; n < crew; n++)
        s.people.push({
          id: `person-${home}-${index}-${n}`,
          home: id,
          vehicle,
          skills: [],
          training: "",
          ready: 0,
          duty: {
            name: `Person ${n}`,
            role: "crew",
            shift: "24h",
            absence: "none",
            until: 0,
            reachability: 100,
            homeNode: 0,
            workNode: 0,
            commute: "car",
            workdays: true,
            standby: false,
            load: 0,
          },
        });
    }
  }
  return s;
}
function equivalent(s: Save) {
  const before = JSON.stringify(s),
    expected = s.vehicles.map((v) => readiness(s, v)),
    indexed = fleetReadiness(s);
  expect(s.vehicles.map(indexed)).toEqual(expected);
  expect(JSON.stringify(s)).toBe(before);
  return expected;
}

describe("Bereitschaftsindex unveränderlicher Client-Snapshots", () => {
  it("entspricht den Serverregeln bei Besatzung, Ausbildung, FMS, Bindung, Defekt und Bau", () => {
    const s = roster();
    s.people.find((p) => p.vehicle === s.vehicles[0].id)!.training = "Lehrgang";
    s.vehicles[1].type = "dlk";
    s.desk.fleet[s.vehicles[2].id] = {
      code: 6,
      changed: 0,
      operative: "ready",
      channel: "",
      history: [],
    };
    s.vehicles[3].status = "travel";
    s.vehicles[4].reserve = true;
    s.vehicles[5].fault = {
      kind: "engine",
      state: "awaiting",
      since: 0,
      repairAt: 0,
      mission: "",
      assignment: "",
      position: s.vehicles[5].path[0],
    };
    s.buildings[2].ready = s.time + 100;
    const reasons = equivalent(s);
    expect(reasons[0]).toContain("Besatzung fehlt");
    expect(reasons[2]).toContain("FMS 6");
    expect(reasons[3]).toContain("Auf Anfahrt");
    expect(reasons[4]).toBe("");
    expect(reasons[5]).toContain("Fahrzeugdefekt");
    expect(reasons[8]).toContain("Wache befindet sich im Bau");
  });

  it("sperrt trotz Reservehinweisen keine verfügbaren Fahrzeuge", () => {
    const s = roster();
    s.buildings[0].organization!.reserve = 2;
    s.vehicles[0].status = "scene";
    s.people.find((p) => p.vehicle === s.vehicles[1].id)!.duty!.absence = "ill";
    // Other-station units must not cover this station's reserve.
    const reasons = equivalent(s);
    expect(reasons[2]).toBe("");
    expect(reasons[3]).toBe("");
    expect(reasons[4]).toBe("");
  });

  it("erhält Schichtzeiten, Abwesenheiten und Mindestbesatzung", () => {
    const s = roster();
    s.buildings[0].organization!.crew = "minimum";
    s.people
      .filter((p) => p.vehicle === s.vehicles[0].id)
      .slice(0, 2)
      .forEach((p) => {
        p.duty!.absence = "vacation";
      });
    s.buildings[1].organization!.kind = "ems";
    s.people
      .filter((p) => p.home === s.buildings[1].id)
      .forEach((p) => {
        p.duty!.shift = "night";
      });
    const reasons = equivalent(s);
    expect(reasons[0]).toBe("");
    expect(reasons[4]).toContain("Besatzung fehlt");
  });

  it("verwendet nach Wiederverbindung oder geändertem Snapshot einen neuen Index", () => {
    const before = roster(),
      first = fleetReadiness(before),
      after = structuredClone(before);
    expect(first(before.vehicles[0])).toBe("");
    after.desk.fleet[after.vehicles[0].id] = {
      code: 6,
      changed: after.time,
      operative: "ready",
      channel: "Feuerwehr",
      history: [],
    };
    after.revision++;
    expect(fleetReadiness(before)).toBe(first);
    expect(fleetReadiness(after)).not.toBe(first);
    expect(fleetReadiness(after)(after.vehicles[0])).toContain("FMS 6");
    expect(first(before.vehicles[0])).toBe("");
    const changedVehicle = { ...before.vehicles[0], status: "travel" as const };
    expect(first(changedVehicle)).toBe(readiness(before, changedVehicle));
  });

  it("begrenzt die Personalzugriffe bei 500 Fahrzeugen mit 4500 Personen", () => {
    const s = roster(20, 25, 9);
    let reads = 0;
    s.people = s.people.map(
      (person) =>
        new Proxy(person, {
          get(target, key, receiver) {
            if (key === "vehicle") reads++;
            return Reflect.get(target, key, receiver);
          },
        }),
    );
    const indexed = fleetReadiness(s);
    expect(s.vehicles.map(indexed).every((reason) => reason === "")).toBe(true);
    expect(reads).toBeLessThan(20000);
    const afterFirstView = reads;
    s.vehicles.forEach(indexed);
    expect(reads).toBe(afterFirstView);
  });
});
