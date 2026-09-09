import { afterEach, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Database } from "../server/database";
import { planEconomyMigration } from "../server/economy-migration";
import { phaseFixture } from "./phase-fixture";
import { recall } from "../src/engine";
import { nodes } from "../src/world";
import { vehiclePosition } from "../src/vehicle-position";
import { stationProfile } from "../src/simulation/staffing";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

it("migriert den echten DB13-Bestand mit Rückfahrt, Verletzung und bezahltem Auftrag ohne Bindungsverlust", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "lv-staff-migration-"));
  dirs.push(dir);
  const original = phaseFixture("old-crew"),
    v = original.vehicles[0];
  delete original.staffing;
  delete original.economy;
  delete original.buildings[0].organization;
  original.money = 200000;
  v.status = "scene";
  v.path = [nodes[12]];
  recall(original, v);
  original.time = v.depart + Math.min(2, (v.arrive - v.depart) / 3);
  const person = original.people.find((p) => p.vehicle === v.id)!;
  person.injury = {
    mission: original.missions[0].id,
    patient: "injured-old",
    since: original.time - 1,
    until: original.time + 900,
    state: "recovery",
  };
  const training = original.people.find((p) => p.vehicle !== v.id)!;
  training.training = "Gefahrgut";
  training.ready = original.time + 180;
  const originalPosition = vehiclePosition(v, original.time),
    originalVehicle = structuredClone(v),
    originalIds = original.people.map((p) => p.id);
  const initial = new Database(dir);
  initial.sql
    .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
    .run(original.player.id, "old-crew", "unused", "player", 1);
  initial.sql
    .prepare("INSERT INTO saves VALUES(?,?)")
    .run(original.player.id, JSON.stringify(original));
  initial.sql.exec("PRAGMA user_version=13");
  initial.close();

  const file = resolve(dir, "game.sqlite"),
    bytes = readFileSync(file),
    raw = new DatabaseSync(file, { readOnly: true });
  const oldData = String(raw.prepare("SELECT data FROM saves").get()!.data);
  const preview = planEconomyMigration(raw);
  expect(preview.summary.saves[0].staffing.completedTraining).toBe(1);
  expect(raw.prepare("PRAGMA user_version").get()!.user_version).toBe(13);
  expect(String(raw.prepare("SELECT data FROM saves").get()!.data)).toBe(
    oldData,
  );
  raw.close();
  expect(readFileSync(file)).toEqual(bytes);

  const migratedDb = new Database(dir),
    migrated = migratedDb.all().get(original.player.id)!;
  expect(
    migratedDb.sql.prepare("PRAGMA user_version").get()!.user_version,
  ).toBe(14);
  expect(migrated.staffing?.version).toBe(1);
  expect(migrated.buildings[0].organization).toBeUndefined();
  expect(stationProfile(migrated.buildings[0]).kind).toBe("bf");
  expect(migrated.vehicles[0]).toEqual(originalVehicle);
  expect(vehiclePosition(migrated.vehicles[0], migrated.time)).toEqual(
    originalPosition,
  );
  expect(
    migrated.people.filter((p) => p.vehicle === v.id).map((p) => p.id),
  ).toEqual(original.people.filter((p) => p.vehicle === v.id).map((p) => p.id));
  expect(migrated.people.find((p) => p.id === person.id)?.injury).toEqual(
    person.injury,
  );
  expect(migrated.people.map((p) => p.id)).toEqual(
    expect.arrayContaining(originalIds),
  );
  expect(migrated.people.find((p) => p.id === training.id)).toMatchObject({
    training: "",
    ready: original.time,
    skills: expect.arrayContaining(["Gefahrgut"]),
  });
  expect(migrated.xp).toBe(original.xp);
  expect(
    migrated.journal.filter((j) => j.text.includes("Personal eingestellt")),
  ).toEqual(
    original.journal.filter((j) => j.text.includes("Personal eingestellt")),
  );
  migratedDb.close();

  const backupName = readdirSync(dir).find((name) =>
    name.startsWith("pre-migration-"),
  )!;
  expect(backupName).toBeTruthy();
  const backup = new DatabaseSync(resolve(dir, backupName), { readOnly: true });
  expect(String(backup.prepare("SELECT data FROM saves").get()!.data)).toBe(
    oldData,
  );
  expect(backup.prepare("PRAGMA user_version").get()!.user_version).toBe(13);
  backup.close();
  const restarted = new Database(dir);
  expect(restarted.all().get(original.player.id)).toEqual(migrated);
  expect(
    planEconomyMigration(restarted.sql).summary.saves[0].staffing,
  ).toMatchObject({
    migrated: false,
    added: 0,
    assigned: 0,
    completedTraining: 0,
  });
  restarted.close();
  expect(
    readdirSync(dir).filter((name) => name.startsWith("pre-migration-")),
  ).toHaveLength(1);
});
