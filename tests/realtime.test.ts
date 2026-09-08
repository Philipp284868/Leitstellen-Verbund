import { vehicleMotion } from "../src/vehicle-position";
import { attachDynamics } from "../src/simulation/dynamics";
import { updateWeather } from "../src/simulation/weather";
import { legacyIncident } from "../src/simulation/incidents";
import { syncFms } from "../src/simulation/fms";
import { it, expect } from "vitest";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Database } from "../server/database";
import { Auth } from "../server/auth";
import { Game } from "../server/game";
import { fresh, validate } from "../src/model";
import { established } from "./e2e/fixtures";
import { generate, beginTrip } from "../src/engine";
import {
  nodes,
  originalNodes,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  distance,
  length,
} from "../src/world";
import { towns } from "../src/region";
import { trip, duration } from "../src/travel";

it("erweitert die Fläche auf exakt 100 × 100 km und erhält die ursprünglichen Straßenpunkte", () => {
  expect(WORLD_WIDTH * 12).toBe(100000);
  expect(WORLD_HEIGHT * 12).toBe(100000);
  expect(towns).toHaveLength(10);
  expect(nodes[0]).toEqual({ x: 340, y: 440 });
  expect(originalNodes.length).toBeGreaterThan(600);
  expect(nodes.length).toBeGreaterThan(originalNodes.length * 2);
  for (const p of nodes) {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(WORLD_WIDTH);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(WORLD_HEIGHT);
  }
});
it("erzeugt auch bei einer abgelegenen Wache ausschließlich lokale Einsätze", () => {
  const s = established("Regional");
  const site = nodes.reduce((a, b) =>
    distance(a, towns[9]) < distance(b, towns[9]) ? a : b,
  );
  s.buildings[0].pos = site;
  s.vehicles[0].path = [site];
  for (let i = 0; i < 100; i++) {
    s.missions = [];
    generate(s);
    expect(s.missions).toHaveLength(1);
    expect(distance(s.missions[0].pos, site)).toBeLessThanOrEqual(600);
  }
});
it("berechnet Fahrzeit und Reststrecke aus demselben tatsächlichen Straßenweg", () => {
  const s = established("Fahrt"),
    v = s.vehicles[0];
  // The geometry check isolates weather and road closures; their effects have separate Phase-2 tests.
  s.environment = undefined;
  beginTrip(s, v, nodes[80], "travel");
  const total = length(v.path) * 12,
    seconds = v.arrive - v.depart;
  expect(seconds).toBeCloseTo(
    v.journey!.motion!.at(-1)!.start + v.journey!.motion!.at(-1)!.duration,
  );
  expect(trip(v, s.time + seconds / 2).remaining).toBeCloseTo(
    total - vehicleMotion(v, s.time + seconds / 2).meters,
  );
  expect(trip(v, v.arrive + 10).remaining).toBe(0);
  expect(duration(301)).toBe("5 min 1 s");
  v.status = "scene";
  expect(trip(v, s.time).seconds).toBe(0);
});
it("übernimmt alte Tempi ohne Zeit- oder Besitzverlust und erzwingt Echtzeit und lässt das Einzelspielerarchiv ruhen", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-realtime-"));
  let db = new Database(dir);
  try {
    const id = await new Auth(db).create(
      "clock",
      "Realtime-password-123!",
      "Clock",
      "Clock",
    );
    db.save(id, structuredClone(db.all().get(id)!), "single");
    const old = established("Clock");
    old.player.id = id;
    for (const item of [...old.buildings, ...old.vehicles]) item.owner = id;
    old.speed = 32;
    beginTrip(old, old.vehicles[0], nodes[80], "travel");
    // A returning trip is a valid active save with no mission assignment.
    old.vehicles[0].status = "return";
    old.vehicles[0].path.reverse();
    old.buildings[0].pos = old.vehicles[0].path.at(-1)!;
    for (const table of ["saves", "solo_saves"])
      db.sql
        .prepare(`UPDATE ${table} SET data=? WHERE user_id=?`)
        .run(JSON.stringify(old), id);
    db.sql.exec("PRAGMA user_version=4");
    db.close();
    db = new Database(dir);
    expect(
      (await readdir(dir)).some((f) => f.startsWith("pre-migration")),
    ).toBe(true);
    for (const table of ["saves", "solo_saves"])
      expect(
        JSON.parse(
          String(
            db.sql.prepare(`SELECT data FROM ${table} WHERE user_id=?`).get(id)!
              .data,
          ),
        ).speed,
      ).toBe(1);
    const expected = structuredClone(old);
    expected.speed = 1;
    for (const m of [...expected.missions, ...expected.archive])
      legacyIncident(expected, m);
    syncFms(expected);
    updateWeather(expected);
    for (const m of [...expected.missions, ...expected.archive])
      attachDynamics(expected, m, false);
    const game = new Game(db);
    for (const mode of ["single", "multi"] as const) {
      const s = db.all(mode).get(id)!;
      expect(s).toEqual(expected);
      expect(() =>
        game.command(
          id,
          { id: crypto.randomUUID(), action: { type: "speed", value: 32 } },
          mode as never,
        ),
      ).toThrow();
    }
    game.step(1);
    for (const mode of ["single", "multi"] as const) {
      const s = db.all(mode).get(id)!;
      expect(s.time - old.time).toBeCloseTo(mode === "multi" ? 1 : 0);
      expect(s.vehicles[0].arrive).toBe(old.vehicles[0].arrive);
      expect(s.money).toBe(old.money);
      expect(s.speed).toBe(1);
    }
    expect(
      validate({ ...fresh("Import", "Import", 100), speed: 16 }).speed,
    ).toBe(1);
  } finally {
    db.close();
  }
});
