import { it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { fresh, uid, validate } from "../src/model";
import { tick } from "../src/engine";
import { nodes } from "../src/world";
it("prüft und simuliert 100 Gebäude, 300 Fahrzeuge und 50 Einsätze", () => {
  const s = fresh("Lasttest", "Regionstest", 1000);
  for (let i = 0; i < 100; i++) {
    const home = uid();
    s.buildings.push({
      id: home,
      owner: s.player.id,
      type: "fire",
      name: `Wache ${i}`,
      pos: nodes[i],
      level: 1,
      ready: 0,
      extensions: [],
    });
    for (let j = 0; j < 3; j++) {
      const id = uid();
      s.vehicles.push({
        id,
        owner: s.player.id,
        type: "tsf",
        name: `TSF ${i}-${j}`,
        home,
        favorite: false,
        status: "ready",
        mission: null,
        assignment: null,
        path: [nodes[i]],
        depart: 0,
        arrive: 0,
        patients: 0,
      });
      for (let p = 0; p < 6; p++)
        s.people.push({
          id: uid(),
          home,
          vehicle: id,
          skills: [],
          training: "",
          ready: 0,
        });
    }
  }
  for (let i = 0; i < 50; i++)
    s.missions.push({
      id: uid(),
      template: "bin",
      pos: nodes[i],
      progress: 0,
      phase: "offered",
      created: 1000,
      completed: 0,
      shared: false,
      round: uid(),
      contributors: [],
      transports: [],
    });
  const before = performance.now();
  validate(s);
  const validated = performance.now();
  // Keep the measured workload fixed; generation no longer stops at a mission cap.
  tick(s, s.time + 32, {}, false, false);
  const after = performance.now();
  mkdirSync(".tools/test-runs", { recursive: true });
  writeFileSync(
    ".tools/test-runs/performance.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        platform: process.platform,
        node: process.version,
        buildings: 100,
        vehicles: 300,
        people: 1800,
        missions: 50,
        jsonBytes: Buffer.byteLength(JSON.stringify(s)),
        validationMs: Math.round(validated - before),
        simulationMs: Math.round(after - validated),
      },
      null,
      2,
    ) + "\n",
  );
  console.info(
    JSON.stringify({
      buildings: 100,
      vehicles: 300,
      missions: 50,
      people: 1800,
      jsonBytes: JSON.stringify(s).length,
      validationMs: Math.round(validated - before),
      tickMs: Math.round(after - validated),
    }),
  );
  expect(s.vehicles).toHaveLength(300);
  expect(s.money).toBe(250000);
  expect(s.missions).toHaveLength(50);
});
