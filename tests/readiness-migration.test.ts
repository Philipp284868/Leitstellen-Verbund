import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { Database, DATABASE_VERSION } from "../server/database";
import { planReadinessMigration } from "../server/readiness-migration";
import { recall } from "../src/engine";
import { phaseFixture } from "./dispatch-fixture";
import { sites as nodes } from "./fixtures/germany/locations";

import { withoutLocationMigration } from "./helpers/location-migration-check";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
it("DB14-Migration besitzt eine bytegleiche Vorschau und Sicherung, erhält aktive Reisen und läuft nur einmal", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "lv-readiness-migration-"));
  dirs.push(dir);
  const s = phaseFixture("old-readiness");
  s.buildings[0].organization!.kind = "ff";
  delete s.buildings[0].readinessCore;
  const v = s.vehicles[0];
  v.status = "scene";
  v.path = [nodes[12]];
  recall(s, v);
  const originalVehicle = structuredClone(v),
    people = s.people.map((p) => ({ id: p.id, vehicle: p.vehicle }));
  const initial = new Database(dir);
  initial.sql
    .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
    .run(s.player.id, "old-readiness", "unused", "player", 1);
  initial.sql
    .prepare("INSERT INTO saves VALUES(?,?)")
    .run(s.player.id, JSON.stringify(s));
  initial.sql.exec("PRAGMA user_version=14");
  initial.close();
  const file = resolve(dir, "game.sqlite"),
    bytes = readFileSync(file),
    raw = new DatabaseSync(file, { readOnly: true });
  const oldData = raw.prepare("SELECT data FROM saves").get()!.data;
  const preview = planReadinessMigration(raw);
  expect(preview.summary.cores).toBe(1);
  expect(raw.prepare("SELECT data FROM saves").get()!.data).toBe(oldData);
  raw.close();
  expect(readFileSync(file)).toEqual(bytes);
  const db = new Database(dir),
    migrated = db.all().get(s.player.id)!;
  expect(db.sql.prepare("PRAGMA user_version").get()!.user_version).toBe(
    DATABASE_VERSION,
  );
  expect(withoutLocationMigration(migrated, preview.saves[0].save)).toEqual(
    preview.saves[0].save,
  );
  expect(migrated.vehicles[0]).toEqual(originalVehicle);
  expect(
    migrated.people.map((p) => ({ id: p.id, vehicle: p.vehicle })),
  ).toEqual(people);
  expect(migrated.money).toBe(s.money);
  expect(migrated.xp).toBe(s.xp);
  db.close();
  const backupFile = readdirSync(dir).find((n) =>
    n.startsWith("pre-migration-"),
  )!;
  const backup = new DatabaseSync(resolve(dir, backupFile), { readOnly: true });
  expect(backup.prepare("SELECT data FROM saves").get()!.data).toBe(oldData);
  backup.close();
  const restarted = new Database(dir);
  expect(restarted.all().get(s.player.id)).toEqual(migrated);
  expect(planReadinessMigration(restarted.sql).summary.cores).toBe(0);
  restarted.close();
});
