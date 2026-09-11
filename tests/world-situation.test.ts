import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { Auth } from "../server/auth";
import { Database } from "../server/database";
import { Game } from "../server/game";
import {
  readWorldSituation,
  writeWorldSituation,
} from "../server/world-situation";
import { mt } from "../src/catalog";
import { apply } from "../src/engine";
import { pacedDelay } from "../src/simulation/pacing";
import { travelFactor } from "../src/simulation/traffic";
import { updateWeather } from "../src/simulation/weather";
import {
  advanceSituation,
  createSituation,
  situationAffects,
  situationCategoryWeight,
  situationDemand,
  situationTemplateWeight,
} from "../src/simulation/world-situation";
import { phaseFixture } from "./dispatch-fixture";

it("führt gemeinsame Phasen deterministisch weiter; Aufholzeit ist begrenzt und Schäden bleiben erhalten", () => {
  const initial = createSituation(43200, 123, "storm");
  let stepped = initial;
  for (let i = 0; i < 720; i++) stepped = advanceSituation(stepped, 5);
  expect(stepped).toEqual(advanceSituation(initial, 3600));
  expect(stepped.dynamic!.steps).toBeGreaterThan(8);
  expect(stepped.dynamic!.pressure).toBeGreaterThanOrEqual(0);
  expect(stepped.dynamic!.pressure).toBeLessThanOrEqual(1);
  expect(stepped.dynamic!.nextAt).toBeGreaterThan(stepped.clock);
  const later = advanceSituation(initial, 100000);
  expect(later.clock - initial.clock).toBe(14400);
  expect(later.history.every((h) => h.ended <= later.clock)).toBe(true);
  expect(later.history.length).toBeLessThanOrEqual(24);
});

it("steuert echten Mix, Intervalle und Fahrwetter regional ohne Anfängerüberlastung", () => {
  const s = phaseFixture("owner");
  s.missions = [];
  s.time = 43200;
  const b = s.buildings[0];
  const world = createSituation(s.time, 123, "storm", {
    kind: "circle",
    name: "Testregion",
    ...b.pos,
    radius: 10,
  });
  s.worldSituation = world;
  updateWeather(s);
  expect(s.environment!.kind).toBe("gale");
  expect(situationDemand(s)).toBeGreaterThan(1);
  expect(situationTemplateWeight(s, mt("tree"))).toBeGreaterThan(2);
  expect(situationCategoryWeight(s, "technical")).toBeGreaterThan(
    situationCategoryWeight(s, "fire"),
  );
  const normal = structuredClone(s);
  normal.worldSituation = createSituation(s.time, 123, "normal");
  updateWeather(normal);
  expect(travelFactor(s, s.vehicles[0], "priority")).toBeGreaterThan(
    travelFactor(normal, normal.vehicles[0], "priority"),
  );
  expect(pacedDelay(123, s)).toBeLessThan(pacedDelay(123, normal));
  const outside = structuredClone(s);
  outside.buildings.forEach((b) => {
    b.pos.x += 100;
  });
  updateWeather(outside);
  expect(situationDemand(outside)).toBe(1);
  expect(situationAffects(world, outside.buildings[0].pos)).toBe(false);
  expect(outside.environment!.kind).not.toBe("gale");
  const point = outside.buildings[0].pos;
  expect(travelFactor(s, s.vehicles[0], "priority", point)).toBe(
    travelFactor(normal, normal.vehicles[0], "priority", point),
  );
  expect(
    travelFactor(outside, outside.vehicles[0], "priority", b.pos),
  ).toBeGreaterThan(
    travelFactor(normal, normal.vehicles[0], "priority", b.pos),
  );
  s.worldSituation = createSituation(s.time, 123, "quiet");
  updateWeather(s);
  expect(situationDemand(s)).toBeLessThan(1);
  expect(pacedDelay(123, s)).toBeGreaterThan(pacedDelay(123, normal));
  for (const save of [s, normal]) {
    save.completed = 3;
    apply(save, { type: "buy", kind: "tsf", home: save.buildings[0].id });
  }
  expect(pacedDelay(123, s)).toBeGreaterThan(pacedDelay(123, normal));
});

it("liefert zwei unabhängigen Leitstellen und späterem Login dieselbe Lage und öffentliche Bereitschaft ohne private Einsatzdaten", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "lv-shared-world-"));
  let db = new Database(dir);
  const auth = new Auth(db);
  const owner = await auth.create(
    "north",
    "world-password-123",
    "Nord",
    "ILS Nord",
  );
  const other = await auth.create(
    "south",
    "world-password-123",
    "Süd",
    "ILS Süd",
  );
  const save = phaseFixture(owner);
  save.player.station = "ILS Nord";
  db.save(owner, save);
  const game = new Game(db);
  writeWorldSituation(
    db.sql,
    createSituation(save.time, 45, "storm", {
      kind: "circle",
      name: "Nordkreis",
      ...save.buildings[0].pos,
      radius: 300,
    }),
  );
  game.command(owner, {
    id: crypto.randomUUID(),
    action: {
      type: "civil-readiness",
      op: "mobilize",
      homes: [save.buildings[0].id],
      reason: "Belastung durch Sturm",
    },
  });
  game.step(700, Date.now(), { generation: false });
  const first = game.view(owner, new Set()),
    second = game.view(other, new Set());
  expect(first.save.worldSituation).toEqual(second.save.worldSituation);
  expect(second.save.worldSituation!.dynamic!.steps).toBeGreaterThan(0);
  expect(second.network.alarms).toMatchObject([
    { id: owner, name: "ILS Nord", stations: 1 },
  ]);
  expect(second.network.friends).toEqual([]);
  expect(JSON.stringify(second.network)).not.toContain(save.missions[0].id);
  const exact = readWorldSituation(db.sql);
  db.close();
  db = new Database(dir);
  try {
    const late = await new Auth(db).create(
      "late",
      "world-password-123",
      "Später",
      "ILS West",
    );
    const view = new Game(db).view(late, new Set());
    expect(view.save.worldSituation).toEqual(exact);
    expect(view.network.alarms[0].id).toBe(owner);
    expect(() =>
      new Game(db).command(late, {
        id: crypto.randomUUID(),
        action: {
          type: "civil-readiness",
          op: "stand-down",
          homes: [save.buildings[0].id],
        },
      }),
    ).toThrow();
    expect(() =>
      new Game(db).command(late, {
        id: crypto.randomUUID(),
        action: { type: "world-situation", profile: "quiet" },
      }),
    ).toThrow();
  } finally {
    db.close();
  }
});

it("migriert Weltmetadaten einmalig mit Sicherung und erhält den übrigen Spielstand", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "lv-world-migrate-"));
  let db = new Database(dir);
  const owner = await new Auth(db).create(
    "before",
    "world-password-123",
    "Alt",
    "ILS Bestand",
  );
  db.save(owner, phaseFixture(owner));
  db.sql.exec(
    "DELETE FROM meta WHERE key='world-situation-v1'; PRAGMA user_version=16",
  );
  const data = db.sql
    .prepare("SELECT data FROM saves WHERE user_id=?")
    .get(owner)!.data;
  db.close();
  db = new Database(dir);
  const state = readWorldSituation(db.sql);
  expect(state?.profile).toBe("quiet");
  const migrated = JSON.parse(
    String(
      db.sql.prepare("SELECT data FROM saves WHERE user_id=?").get(owner)!.data,
    ),
  );
  expect(migrated.locationReview).toEqual({
    version: 1,
    pending: migrated.missions.map((m: { id: string }) => m.id),
    checked: 0,
    nextAt: migrated.time,
  });
  delete migrated.locationReview;
  for (const m of migrated.missions) {
    expect(m.location.original).toEqual(m.pos);
    expect(m.location.state).toBe("repair-pending");
    delete m.location;
  }
  expect(migrated).toEqual(JSON.parse(String(data)));
  expect(readdirSync(dir).some((n) => n.startsWith("pre-migration"))).toBe(
    true,
  );
  db.close();
  db = new Database(dir);
  expect(readWorldSituation(db.sql)).toEqual(state);
  db.close();
});
