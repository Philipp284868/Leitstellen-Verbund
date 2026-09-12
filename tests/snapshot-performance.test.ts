import { expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { publicSave } from "../src/simulation/incidents";
import { personDuty } from "../src/simulation/staffing";
import { validate } from "../src/shared/model";
import { activeMissionsFixture } from "./history-fixture";

it("measures a real public snapshot with 500 vehicles, 4500 people and 200 running incidents", () => {
  const s = activeMissionsFixture("snapshot-benchmark", 200);
  const station = s.buildings[0],
    vehicle = s.vehicles[0],
    person = s.people[0];
  s.buildings = [];
  s.vehicles = [];
  s.people = [];
  s.desk.fleet = {};
  for (let home = 0; home < 20; home++) {
    const id = `bench-station-${home}`,
      ff = home % 2 === 0;
    s.buildings.push({
      ...structuredClone(station),
      id,
      level: 10,
      organization: { ...station.organization!, kind: ff ? "ff" : "bf" },
    });
    for (let unit = 0; unit < 25; unit++) {
      const vehicleId = `${id}-vehicle-${unit}`;
      s.vehicles.push({ ...structuredClone(vehicle), id: vehicleId, home: id });
      for (let crew = 0; crew < 9; crew++) {
        const p = {
          ...structuredClone(person),
          id: `${vehicleId}-person-${crew}`,
          home: id,
          vehicle: ff ? null : vehicleId,
        };
        p.duty = personDuty(s, p);
        s.people.push(p);
      }
    }
  }
  const source = validate(s),
    before = JSON.stringify(source);
  const timings: number[] = [];
  let result: ReturnType<typeof publicSave> | undefined;
  for (let iteration = 0; iteration < 13; iteration++) {
    const start = performance.now();
    result = publicSave(source);
    timings.push(performance.now() - start);
  }
  expect(result!.vehicles).toHaveLength(500);
  expect(result!.people).toHaveLength(4500);
  expect(result!.missions).toHaveLength(200);
  expect(result!.vehicles.every((v) => v.availability?.alarmable)).toBe(true);
  expect(result!.people.filter((p) => p.duty)).toHaveLength(2250);
  expect(
    result!.missions.every(
      (m) => !m.control?.secret && m.dynamics?.random === undefined,
    ),
  ).toBe(true);
  expect(JSON.stringify(source)).toBe(before);
  const serializationStart = performance.now(),
    json = JSON.stringify(result),
    serializationMs = performance.now() - serializationStart;
  const coldMs = timings[0],
    warm = timings.slice(1).sort((a, b) => a - b);
  const metrics = {
    at: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    world: source.world,
    scope:
      "publicSave only, deterministic legacy road-map fixture, half FF/half BF ready vehicles; excludes simulation tick, database, routing and network",
    stations: 20,
    vehicles: 500,
    people: 4500,
    runningIncidents: 200,
    samples: 13,
    coldMs,
    warmMedianMs: (warm[5] + warm[6]) / 2,
    warmP95Ms: warm[11],
    serializationMs,
    jsonBytes: Buffer.byteLength(json),
    gzipBytes: gzipSync(json).length,
  };
  mkdirSync(resolve(".tools/test-runs"), { recursive: true });
  writeFileSync(
    resolve(".tools/test-runs/public-save-performance.json"),
    JSON.stringify(metrics, null, 2),
  );
  // Timings are an observed benchmark, not a machine-dependent CI pass threshold.
  expect(Number.isFinite(metrics.warmMedianMs)).toBe(true);
});
