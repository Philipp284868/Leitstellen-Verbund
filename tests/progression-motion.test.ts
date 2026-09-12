import { fixturePurchase } from "./fixtures/germany/facilities";
import { vehicleHomeAllowed } from "../src/shared/catalog";
import { euro } from "../src/shared/money";
import { SpatialIndex } from "../src/client/spatial";
import "./fixtures/germany/session";
import { fundTestBudget } from "./money-fixture";

import { expect, it } from "vitest";
import { apply, beginTrip, tick } from "../src/shared/engine";
import { fresh, level, validate } from "../src/shared/model";
import {
  constantSeconds,
  motionAt,
  motionProfile,
  type MotionLeg,
} from "../src/shared/motion";
import {
  addXp,
  MAX_XP,
  missionXp,
  progress,
  unlockLevel,
  xpForLevel,
} from "../src/shared/progression";
import { fastestPath, type Link } from "../src/client/routing";
import {
  along,
  distance,
  roadSectionBetween,
  route,
  WORLD_WIDTH,
} from "../src/shared/world";
import { sites as nodes } from "./fixtures/germany/locations";

import { spawnSync } from "node:child_process";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Auth } from "../src/server/auth";
import { Database } from "../src/server/database";
import { Game } from "../src/server/game";
import { createLab, runLab, type LabAction } from "../src/server/lab";
import { buildings, extensions, mt, vehicles } from "../src/shared/catalog";
import { routePlan } from "../src/simulation/traffic";
import { vehicleMotion, vehiclePosition } from "../src/shared/vehicle-position";
import { established } from "./e2e/fixtures";

it("verarbeitet alle Schwellen, Rest-XP und mehrere Aufstiege bis weit über 100 ohne Tabelle", () => {
  for (const l of [1, 2, 9, 10, 11, 25, 50, 100, 101, 1000, 10000]) {
    expect(progress(xpForLevel(l)).level).toBe(l);
    expect(progress(xpForLevel(l + 1) - 1).level).toBe(l);
    expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
  }
  const s = { xp: xpForLevel(9) + 21 };
  addXp(s, xpForLevel(14) - xpForLevel(9));
  expect(progress(s.xp)).toMatchObject({ level: 14, current: 21 });
  const cap = { xp: MAX_XP };
  expect(() => addXp(cap, 1)).toThrow();
  expect(cap.xp).toBe(MAX_XP);
  for (const invalid of [-1, NaN, Infinity, 1.1])
    expect(() => progress(invalid)).toThrow();
});
it("migriert gespeicherte XP ohne Verlust, Herabstufung oder doppelte Kompensation", () => {
  for (const xp of [0, 150, 1349, 1350, 1499, 5000, MAX_XP]) {
    const old = fresh("Alt", "Alt", 100);
    delete old.progression;
    old.xp = xp;
    const next = validate(old);
    expect(next.xp).toBeGreaterThanOrEqual(xp);
    expect(level(next)).toBeGreaterThanOrEqual(
      Math.min(10, 1 + Math.floor(xp / 150)),
    );
    expect(next.progression!.compensation).toBe(next.xp - xp);
    expect(validate(next)).toEqual(next);
  }
});
it("definiert den vollständigen Katalog, nutzbare Organisationseinstiege und serverseitige Grenzen", () => {
  for (const b of buildings) {
    expect(b.level).toBe(unlockLevel("building", b.id));
    if (b.slots)
      expect(
        vehicles.some((v) => vehicleHomeAllowed(v, b.id) && v.level <= b.level),
      ).toBe(true);
    const s = fresh("Test", "Test", 100);
    s.xp = xpForLevel(b.level) - 1;
    if (s.xp >= 0)
      expect(() => apply(s, fixturePurchase(b.id, nodes[0]))).toThrow();
  }
  for (const v of vehicles) {
    expect(v.level).toBeGreaterThanOrEqual(
      buildings.find((b) => b.id === v.home)!.level,
    );
    const e = extensions.find((e) => e.types.includes(v.id));
    if (e) expect(e.level).toBeLessThanOrEqual(v.level);
  }
  expect(vehicles.some((v) => v.level > 10)).toBe(true);
  const s = established("Bestand"),
    count = s.vehicles.length;
  s.xp = 0;
  expect(validate(s).vehicles).toHaveLength(count);
  expect(() =>
    apply(s, { type: "buy", kind: "hlf", home: s.buildings[0].id }),
  ).toThrow(/Stufe/);
  expect(() =>
    apply(s, {
      type: "build",
      kind: "fire",
      pos: { x: WORLD_WIDTH + 1, y: 2 },
    }),
  ).toThrow(/BUILDING_PURCHASE_ONLY/);
  expect(missionXp(mt("bin"))).toBeGreaterThan(60);
  expect(missionXp(mt("bin"))).toBeLessThan(missionXp(mt("crash")));
});
const leg = (meters: number, limit: number, x = 0): MotionLeg => ({
  from: { x, y: 0 },
  to: { x: x + meters, y: 0 },
  meters,
  limit,
  edge: `${x}:${limit}`,
});
it("bestätigt sämtliche konstanten Referenzfahrzeiten ohne Zusatzdynamik", () => {
  for (const [speed, seconds] of [
    [30, 120],
    [50, 72],
    [60, 60],
    [80, 45],
    [100, 36],
    [120, 30],
  ])
    expect(constantSeconds(1000, speed)).toBeCloseTo(seconds, 10);
  expect(constantSeconds(10000, 80)).toBe(450);
  expect(
    constantSeconds(2000, 50) +
      constantSeconds(8000, 80) +
      constantSeconds(10000, 100),
  ).toBe(864);
  expect(constantSeconds(5000, 30)).toBe(600);
  expect(constantSeconds(8000, 80)).toBe(360);
  expect(() => constantSeconds(1, 0)).toThrow();
});
it("erreicht 80, bremst vor 30 und bewahrt Fahrzeit bei technischer Segmentierung", () => {
  const whole = motionProfile([leg(10000, 80)]),
    split = motionProfile(
      Array.from({ length: 100 }, (_, i) => leg(100, 80, i * 100)),
    );
  expect(split.seconds).toBeCloseTo(whole.seconds, 8);
  expect(motionAt(whole.phases, 200)!.kmh).toBeCloseTo(80, 10);
  expect(whole.seconds).toBeGreaterThan(450);
  const mixed = motionProfile([
    leg(1000, 100),
    leg(500, 30, 1000),
    leg(1500, 80, 1500),
    leg(1000, 50, 3000),
  ]);
  for (let t = 0; t < mixed.seconds; t += 0.13) {
    const state = motionAt(mixed.phases, t)!;
    expect(state.kmh).toBeLessThanOrEqual(state.limit + 1e-7);
    if (state.position.x >= 1000 && state.position.x < 1500)
      expect(state.kmh).toBeLessThanOrEqual(30 + 1e-7);
  }
  for (const dt of [0.1, 1, 7, 60, 1000]) {
    let t = 0;
    while (t < whole.seconds) t = Math.min(whole.seconds, t + dt);
    expect(motionAt(whole.phases, t)!.position.x).toBeCloseTo(10000, 8);
  }
});
it("wählt die längere schnellere zulässige Route; Richtung, Sperrung und Zeitkosten wirken", () => {
  const graph: Link[][] = [
    [
      { to: 1, meters: 5000, limit: 30, id: "slow", allowed: true },
      { to: 2, meters: 4000, limit: 80, id: "fast-a", allowed: true },
    ],
    [],
    [{ to: 1, meters: 4000, limit: 80, id: "fast-b", allowed: true }],
  ];
  expect(
    fastestPath(graph, [[0, 0]], new Map([[1, 0]]), 120, new Set()),
  ).toEqual({ path: [0, 2, 1], seconds: 360 });
  expect(
    fastestPath(graph, [[0, 0]], new Map([[1, 0]]), 120, new Set(["fast-b"]))
      .seconds,
  ).toBe(600);
  expect(() =>
    fastestPath(graph, [[1, 0]], new Map([[0, 0]]), 120, new Set()),
  ).toThrow();
  expect(
    fastestPath(
      graph,
      [[0, 0]],
      new Map([[1, 0]]),
      120,
      new Set(),
      new Map([["fast-a", 300]]),
    ).path,
  ).toEqual([0, 1]);
  expect(
    fastestPath(
      graph,
      [[0, 0]],
      new Map([[1, 0]]),
      120,
      new Set(),
      new Map([["fast-a", 300]]),
      2,
    ),
  ).toEqual({ path: [0, 2, 1], seconds: 1020 });
  expect(() =>
    fastestPath(graph, [[0, 0]], new Map([[1, 0]]), 0, new Set()),
  ).toThrow();
});
it("wartet bei einer bekannten Verzögerung am belegten Deutschland-Straßenabschnitt statt eine Umleitung zu erfinden", () => {
  const s = established("Verzögerung"),
    v = s.vehicles[0],
    a = nodes[0],
    b = nodes[2];
  s.environment = undefined;
  const baseline = routePlan(s, v, a, b),
    section = roadSectionBetween(baseline.path[0], baseline.path[1]);
  s.environment = {
    version: 1,
    period: 0,
    kind: "sun",
    temperature: 20,
    wind: 0,
    rain: 0,
    visibility: 30000,
    density: 0,
    roads: [
      {
        id: "known-wait",
        kind: "jam",
        edge: [section.a, section.b],
        roadId: section.id,
        start: s.time,
        until: s.time + 1200,
        delay: 900,
        blocked: false,
      },
    ],
  };
  const delayed = routePlan(s, v, a, b);
  expect(delayed.path).toEqual(baseline.path);
  expect(delayed.events).toEqual(["known-wait"]);
  expect(delayed.seconds - baseline.seconds).toBeCloseTo(900, 7);
  expect(
    delayed.motion
      .filter((p) => p.velocity === 0 && p.acceleration === 0)
      .reduce((n, p) => n + p.duration, 0),
  ).toBe(900);
});
it("wendet eine bekannte Wartezeit auch auf Teilstrecken innerhalb einer Straßenkante an", () => {
  const s = established("Teilstrecke"),
    from = along([nodes[0], nodes[2]], 0.1),
    to = along([nodes[0], nodes[2]], 0.2),
    path = route(from, to),
    edge = roadSectionBetween(path[0], path[1]);
  s.environment = {
    version: 1,
    period: 0,
    kind: "sun",
    temperature: 20,
    wind: 0,
    rain: 0,
    visibility: 30000,
    density: 0,
    roads: [
      {
        id: "partial-wait",
        roadId: edge.id,
        kind: "jam",
        edge: [edge.a, edge.b],
        start: s.time,
        until: s.time + 600,
        delay: 2,
        blocked: false,
      },
    ],
  };
  const plan = routePlan(s, s.vehicles[0], from, to);
  expect(plan.events).toContain("partial-wait");
  expect(
    plan.motion
      .filter((p) => p.velocity === 0 && p.acceleration === 0)
      .reduce((n, p) => n + p.duration, 0),
  ).toBe(2);
  const v = s.vehicles[0];
  v.path = [from];
  beginTrip(s, v, to, "return");
  s.time += 1;
  const resumed = routePlan(s, v, vehiclePosition(v, s.time), to);
  expect(
    resumed.motion
      .filter((p) => p.velocity === 0 && p.acceleration === 0)
      .reduce((n, p) => n + p.duration, 0),
  ).toBe(1);
});

it("positioniert am tatsächlichen Profil und trifft innerhalb eines großen Ticks exakt ein", () => {
  const original = established("Uhr");
  original.environment = undefined;
  original.missions = [];
  const v = original.vehicles[0];
  beginTrip(original, v, nodes[100], "return");
  // This return destination is deliberately also the new home for the arrival assertion.
  original.buildings[0].pos = nodes[100];
  const arrival = v.arrive,
    mid = (v.depart + v.arrive) / 2;
  v.journey!.nextCheck = arrival + 2; // Isolated free-road ETA; changing weather is covered separately.
  expect(distance(vehiclePosition(v, mid), along(v.path, 0.5))).toBeGreaterThan(
    0.001,
  );
  const a = structuredClone(original),
    b = structuredClone(original);
  tick(a, arrival + 0.25, {}, false, false);
  for (let t = b.time + 0.25; t < arrival; t += 0.25)
    tick(b, t, {}, false, false);
  tick(b, arrival + 0.25, {}, false, false);
  expect(a.vehicles[0].status).toBe("ready");
  expect(b.vehicles[0].status).toBe("ready");
  expect(a.statistics.meters).toBeCloseTo(b.statistics.meters, 5);
  expect(vehicleMotion(a.vehicles[0], a.time).kmh).toBe(0);
});
it("Vorschau und SQLite-Migration erhalten aktive Positionen, Konten und XP über erneutes Öffnen", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-progression-v11-"));
  let db = new Database(dir);
  try {
    const owner = await new Auth(db).create(
      "legacy",
      "Legacy-motion-123!",
      "Alt",
      "Alt",
    );
    const s = established("Alt");
    s.player.id = owner;
    for (const o of [...s.buildings, ...s.vehicles]) o.owner = owner;
    s.environment = undefined;
    s.missions = [];
    s.xp = 1350;
    delete s.progression;
    delete s.regionVersion;
    const v = s.vehicles[0];
    beginTrip(s, v, nodes[90], "return");
    s.buildings[0].pos = nodes[90];
    delete v.journey!.motion;
    delete v.journey!.motionVersion;
    s.time = (v.depart + v.arrive) / 2;
    const position = along(v.path, 0.5);
    db.sql
      .prepare("UPDATE saves SET data=? WHERE user_id=?")
      .run(JSON.stringify(s), owner);
    db.sql.exec("PRAGMA user_version=10");
    db.close();
    const preview = spawnSync(
      process.execPath,
      ["dist/server/cli.js", "migration-preview"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATA_DIR: dir,
          PORT: "31999",
          PUBLIC_URL: "http://localhost:31999",
          COOKIE_SECURE: "false",
        },
      },
    );
    expect(preview.status, preview.stderr).toBe(0);
    expect(JSON.parse(preview.stdout).saves[0].compensation).toBeGreaterThan(0);
    db = new Database(dir);
    const migrated = db.all().get(owner)!;
    expect(
      distance(vehiclePosition(migrated.vehicles[0], migrated.time), position),
    ).toBeLessThan(1e-6);
    expect(level(migrated)).toBe(10);
    expect(migrated.money).toBe(s.money);
    expect(
      (await readdir(dir)).some((n) => n.startsWith("pre-migration")),
    ).toBe(true);
    db.close();
    db = new Database(dir);
    expect(db.all().get(owner)).toEqual(migrated);
  } finally {
    db.close();
  }
}, 20000);

it("leere und ausgeblendete Kartenausschnitte verursachen keine unbeschränkten Indexabfragen", () => {
  const index = new SpatialIndex<{ x: number; y: number }>();
  index.add({ x: 1, y: 1 });
  expect(index.query(0, 0, Infinity, Infinity)).toEqual([]);
  expect(index.query(NaN, 0, 1, 1)).toEqual([]);
  expect(index.query(0, 0, 0, 0)).toEqual([]);
  expect(index.query(0, 0, 2, 2)).toEqual([{ x: 1, y: 1 }]);
});

it("Verkehrswarten findet am betroffenen Abschnitt statt und verbraucht keine Strecke", () => {
  const plan = motionProfile([
    leg(1000, 80),
    { ...leg(1000, 80, 1000), waitSeconds: 30 },
  ]);
  const pause = plan.phases.find(
    (p) => p.velocity === 0 && p.acceleration === 0,
  )!;
  expect(pause.duration).toBe(30);
  expect(motionAt(plan.phases, pause.start + 15)).toMatchObject({
    kmh: 0,
    meters: 1000,
    position: { x: 1000, y: 0 },
  });
  expect(plan.seconds).toBeGreaterThan(
    motionProfile([leg(2000, 80)]).seconds + 30,
  );
});
it("Notruf, Alarmierung, Lagemeldung, Abschluss, Stufe 2 und einmaliger freigeschalteter Kauf überstehen Neustart", async () => {
  let lab = createLab(124);
  lab.save.xp = 145;
  const step = (a: LabAction) => {
    lab = runLab(lab, a);
  };
  step({ type: "crew-ready" });
  step({ type: "generate", template: "bin" });
  const mission = lab.save.missions[0].id;
  step({ type: "interview", mission });
  step({
    type: "dispatch",
    mission,
    vehicles: lab.save.vehicles.map((v) => v.id),
  });
  for (let i = 0; i < 100 && lab.save.missions.length; i++) {
    if (
      lab.save.missions[0].control?.radio.some(
        (r) => r.reason === "arrival" && r.state === "open",
      )
    )
      step({ type: "brief", mission });
    step({ type: "advance", seconds: 10 });
  }
  expect(lab.save.archive).toHaveLength(1);
  expect(level(lab.save)).toBe(2);
  expect(lab.save.xp).toBe(145 + missionXp(mt("bin")));
  const dir = await mkdtemp(resolve(tmpdir(), "lv-earned-unlock-"));
  let db = new Database(dir);
  try {
    const owner = await new Auth(db).create(
      "unlock",
      "Earned-unlock-123!",
      "Nord",
      "Nord",
    );
    const s = lab.save;
    fundTestBudget(s, 500000); // Isolate the earned level gate from the lab's pre-bought TLF.
    s.player.id = owner;
    for (const o of [...s.buildings, ...s.vehicles]) o.owner = owner;
    db.save(owner, s);
    let game = new Game(db);
    const command = {
      id: crypto.randomUUID(),
      action: { type: "buy", kind: "lf", home: s.buildings[0].id },
    };
    game.command(owner, command);
    game.command(owner, command);
    expect(db.all().get(owner)!.vehicles).toHaveLength(3);
    expect(db.all().get(owner)!.money).toBe(s.money - euro(320000));
    expect(() =>
      game.command(owner, {
        id: crypto.randomUUID(),
        action: { ...command.action, xp: 999999 },
      }),
    ).toThrow();
    db.close();
    db = new Database(dir);
    game = new Game(db);
    game.command(owner, command);
    game.step(120);
    expect(db.all().get(owner)!.xp).toBe(s.xp);
    expect(db.all().get(owner)!.vehicles).toHaveLength(3);
    expect(
      db
        .all()
        .get(owner)!
        .archive.filter((m) => m.id === mission),
    ).toHaveLength(1);
  } finally {
    db.close();
  }
}, 20000);
