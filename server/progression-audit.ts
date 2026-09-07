import { gzipSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { platform, cpus } from "node:os";
import { performance } from "node:perf_hooks";
import { fresh, type Vehicle } from "../src/model";
import { vt, missions, buildings, vehicles, extensions } from "../src/catalog";
import { xpForLevel, missionXp } from "../src/progression";
import { routePlan } from "../src/simulation/traffic";
import {
  nodes,
  nearest,
  distance,
  roads,
  roadSections,
  overpasses,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  METERS_PER_UNIT,
  length,
} from "../src/world";
import { regionTowns } from "../src/region-extension";
import { vehicleMotion } from "../src/vehicle-position";
const phases = [
  { level: 1, types: ["tsf"], parallel: 1 },
  { level: 5, types: ["lf", "tsf", "rtw"], parallel: 1.4 },
  { level: 10, types: ["hlf", "lf", "rtw", "fustw"], parallel: 1.5 },
  {
    level: 20,
    types: ["hlf", "lf", "tlf", "rtw", "fustw", "gkw"],
    parallel: 1.6,
  },
  {
    level: 35,
    types: ["hlf", "lf", "tlf", "rtw", "nef", "fustw", "gkw"],
    parallel: 1.7,
  },
  {
    level: 60,
    types: ["hlf", "lf", "tlf", "rtw", "nef", "fustw", "gkw"],
    parallel: 1.7,
  },
];
const state = fresh("Audit", "Audit", 1000);
state.environment = undefined;
const vehicle = (type: string, at = nodes[0]): Vehicle => ({
  id: `audit-${type}`,
  owner: state.player.id,
  home: "audit",
  type,
  name: type,
  favorite: false,
  status: "ready",
  mission: null,
  assignment: null,
  path: [at],
  depart: 1000,
  arrive: 1000,
  patients: 0,
});
const rows = [];
for (const p of phases) {
  const skills: Record<string, number> = {};
  for (const kind of p.types)
    for (const [key, value] of Object.entries(vt(kind).skills))
      skills[key] = (skills[key] ?? 0) + value;
  const mix = missions.filter(
    (m) =>
      !m.water &&
      m.level <= p.level &&
      Object.entries(m.requirements).every(([k, n]) => (skills[k] ?? 0) >= n),
  );
  const radius = p.types.length <= 4 ? 180 : 400;
  const local = nodes.filter(
    (n) => distance(n, nodes[0]) > 30 && distance(n, nodes[0]) <= radius,
  );
  const trips = Array.from({ length: 48 }, (_, i) => {
    const target = local[(i * 173 + 37) % local.length],
      v = vehicle(p.types[i % p.types.length]);
    const out = routePlan(state, v, nodes[0], target),
      back = routePlan(state, v, target, nodes[0], "normal");
    return {
      out: out.seconds,
      back: back.seconds,
      km: (length(out.path) * METERS_PER_UNIT) / 1000,
    };
  });
  const mean = (numbers: number[]) =>
    numbers.reduce((a, b) => a + b, 0) / numbers.length;
  const out = mean(trips.map((t) => t.out)),
    back = mean(trips.map((t) => t.back));
  const work = mean(mix.map((m) => m.seconds + 30 + (m.patients ? 150 : 0)));
  const cycle = 40 + out + work + back; // call/dispatch/turnout 40 s; recon 30 s; care/handover 150 s where needed.
  const throughputSeconds = Math.max(150, cycle / p.parallel);
  const xp = mean(mix.map((m) => missionXp(m))),
    oldXp = mean(mix.map((m) => 50 + 10 * m.level));
  const required = xpForLevel(p.level + 1) - xpForLevel(p.level);
  rows.push({
    ...p,
    eligibleScenarios: mix.map((m) => m.id),
    averageXp: xp,
    oldAverageXp: oldXp,
    xpRequired: required,
    missionsPerLevel: required / xp,
    meanOutboundSeconds: out,
    meanReturnSeconds: back,
    meanRoadKm: mean(trips.map((t) => t.km)),
    meanWorkAndTransportSeconds: work,
    vehicleCycleSeconds: cycle,
    expectedMinutesPerLevel: ((required / xp) * throughputSeconds) / 60,
    oldMinutesPerLevel:
      p.level < 10 ? ((150 / oldXp) * throughputSeconds) / 60 : null,
  });
}
let cumulative = 0;
const milestones = [];
for (let l = 1; l <= 100; l++) {
  const p = rows.filter((r) => r.level <= l).at(-1)!;
  cumulative +=
    (((xpForLevel(l + 1) - xpForLevel(l)) / p.averageXp) *
      Math.max(150, p.vehicleCycleSeconds / p.parallel)) /
    60;
  if ([4, 7, 10, 11, 12, 15, 20, 24, 30, 50, 100, 101].includes(l + 1))
    milestones.push({ level: l + 1, estimatedHours: cumulative / 60 });
}
const routeTimes: number[] = [],
  fleet: Vehicle[] = [];
for (let i = 0; i < 120; i++) {
  const from = nodes[nearest(regionTowns[i % regionTowns.length])],
    target = nodes[nearest(regionTowns[(i * 7 + 3) % regionTowns.length])],
    v = vehicle(i % 2 ? "rtw" : "lf", from);
  const started = performance.now(),
    p = routePlan(state, v, from, target);
  routeTimes.push(performance.now() - started);
  v.status = "return";
  v.path = p.path;
  v.depart = 1000;
  v.arrive = 1000 + p.seconds;
  v.journey = {
    mode: "normal",
    planned: p.planned,
    plannedSeconds: p.plannedSeconds,
    delay: p.delay,
    distanceDone: 0,
    events: [],
    nextCheck: 100000,
    serial: 0,
    target,
    blockedUntil: 0,
    reason: "",
    motion: p.motion,
    motionVersion: 1,
    wait: p.wait,
  };
  fleet.push(v);
}
for (let i = 120; i < 500; i++)
  fleet.push(vehicle("tsf", nodes[(i * 71) % nodes.length]));
const samples = [];
for (let t = 0; t < 100; t++) {
  const start = performance.now();
  for (const v of fleet) vehicleMotion(v, 1100 + t);
  samples.push(performance.now() - start);
}
routeTimes.sort((a, b) => a - b);
samples.sort((a, b) => a - b);
const report = {
  kind: "Deterministische Modellschätzung, keine gemessenen Spielerzeiten",
  assumptions: {
    seed: 37,
    weather:
      "Freie Referenzbedingungen; echte Wetter-/Verkehrsänderungen können Zeiten verlängern",
    mapSamplesPerPhase: 48,
    cadenceSeconds: 150,
    activeMissionLimit: 2,
    parallelism: "1 bis 1,7 nutzbare Einsätze; kein maximaler Fuhrpark",
    work: "Originale Szenarioarbeit + 30 s Erkundung, bei Patienten 150 s Versorgung/Übergabe. Individuelle Verschlechterung nicht prognostiziert.",
    credits:
      "Unveränderte Szenariobelohnungen; Fahrzeuge, Wachen, Personal und Ausbildung bleiben kostenpflichtig.",
  },
  rows,
  milestones,
  unlocks: { buildings, vehicles, extensions },
  world: {
    widthMeters: WORLD_WIDTH * METERS_PER_UNIT,
    heightMeters: WORLD_HEIGHT * METERS_PER_UNIT,
    nodes: nodes.length,
    roads: roads.length,
    sections: roadSections.length,
    gradeSeparatedCrossings: overpasses.length,
  },
  performance: {
    platform: platform(),
    cpu: cpus()[0]?.model,
    node: process.version,
    vehicles: 500,
    activeLongTrips: 120,
    routeSamples: 120,
    routeMs: {
      median: routeTimes[60],
      p95: routeTimes[114],
      max: routeTimes.at(-1),
    },
    positionMsFor500: { median: samples[50], p95: samples[95] },
    fleetJsonBytes: Buffer.byteLength(JSON.stringify(fleet)),
    fleetGzipBytes: gzipSync(JSON.stringify(fleet)).length,
  },
};
await writeFile(
  "docs/PROGRESSION-AUDIT.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      rows: rows.map(
        ({ level, averageXp, expectedMinutesPerLevel, meanRoadKm }) => ({
          level,
          averageXp,
          expectedMinutesPerLevel,
          meanRoadKm,
        }),
      ),
      world: report.world,
      performance: report.performance,
      milestones,
    },
    null,
    2,
  ),
);
