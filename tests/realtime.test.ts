import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { Auth } from "../src/server/auth";
import { Database } from "../src/server/database";
import { Game } from "../src/server/game";
import { beginTrip, generate } from "../src/shared/engine";
import { project, unproject } from "../src/shared/germany/projection";
import { fresh, validate } from "../src/shared/model";
import { attachDynamics } from "../src/simulation/dynamics";
import { syncFms } from "../src/simulation/fms";
import { legacyIncident } from "../src/simulation/incidents";
import { updateWeather } from "../src/simulation/weather";
import { duration, trip } from "../src/shared/travel";
import { vehicleMotion } from "../src/shared/vehicle-position";
import {
  distance,
  length,
  METERS_PER_UNIT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../src/shared/world";
import { established } from "./e2e/fixtures";
import { sites as nodes } from "./fixtures/germany/locations";
import { withoutLocationMigration } from "./helpers/location-migration-check";

it("Deutschlandprojektion erhält geografische Punkte im landesweiten metrischen Gebiet", () => {
  expect(WORLD_WIDTH * METERS_PER_UNIT).toBeGreaterThan(500000);
  expect(WORLD_HEIGHT * METERS_PER_UNIT).toBeGreaterThan(800000);
  for (const input of [
    { lon: 13.405, lat: 52.52 },
    { lon: 9.99, lat: 53.55 },
    { lon: 11.58, lat: 48.14 },
  ]) {
    const point = project(input),
      result = unproject(point);
    expect(point.x).toBeGreaterThan(0);
    expect(point.x).toBeLessThan(WORLD_WIDTH);
    expect(point.y).toBeGreaterThan(0);
    expect(point.y).toBeLessThan(WORLD_HEIGHT);
    expect(result.lon).toBeCloseTo(input.lon, 8);
    expect(result.lat).toBeCloseTo(input.lat, 8);
  }
});
it("erzeugt auch bei einer abgelegenen Wache ausschließlich lokale Einsätze", () => {
  const s = established("Regional");
  const site = nodes.at(-1)!;
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
      expect(withoutLocationMigration(s, expected)).toEqual(expected);
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
