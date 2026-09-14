import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Database, DATABASE_VERSION } from "../src/server/database";
import { planFireProfileMigration } from "../src/server/fire-profile-migration";
import { fresh, validate } from "../src/shared/model";
import { apply, tick } from "../src/shared/engine";
import { germanyProvider } from "../src/shared/germany/world";
import {
  fixturePurchase,
  fixtureFireProfile,
} from "./fixtures/germany/facilities";
import { sites } from "./fixtures/germany/locations";
import { reconcileBuildingStaffing } from "../src/simulation/building-staffing";

const cleanups: (() => void)[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const clean of cleanups.reverse()) clean();
  cleanups.length = 0;
});
function oldWorld(active = false, unknown = false) {
  const dir = mkdtempSync(resolve(tmpdir(), "lv-profile-migration-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const catalog = germanyProvider().facilities!,
    get = catalog.get.bind(catalog);
  const target = {
    ...fixtureFireProfile,
    revision: "verified-next-profile",
    ...(unknown
      ? { kind: "unknown" as const, employment: "unknown" as const }
      : {}),
  };
  const s = fresh("A", "B", 1000);
  s.player.id = "owner";
  apply(s, fixturePurchase("fire", sites[0]));
  tick(s, 1030, {}, false, false);
  apply(s, { type: "buy", home: s.buildings[0].id, kind: "tsf" });
  const b = s.buildings[0];
  delete b.fireProfile;
  delete b.fireRosterRevision;
  delete b.fireProfilePending;
  b.organization = { kind: "bf", turnout: 25, crew: "normal", reserve: 0 };
  s.people.forEach((p) => (p.professional = true));
  if (active) {
    const v = s.vehicles[0];
    v.status = "travel";
    v.path = [sites[0], sites[1]];
    v.depart = s.time;
    v.arrive = s.time + 100;
    v.assignment = "old-assignment";
    v.mission = "old-scene";
  }
  const db = new Database(dir);
  db.sql
    .prepare("INSERT INTO users VALUES(?,?,?,'player',0)")
    .run(s.player.id, "profile-owner", "unused");
  db.sql
    .prepare("INSERT INTO saves VALUES(?,?)")
    .run(s.player.id, JSON.stringify(s));
  db.sql.exec("PRAGMA user_version=28");
  db.close();
  vi.spyOn(catalog, "get").mockImplementation((id) => {
    const f = get(id);
    return f?.kind === "fire" ? { ...f, fireProfile: target } : f;
  });
  return { dir, s, target };
}
it("führt die gesicherte Fachmigration auch nach der SQL-Migration des AMP-Updaters einmalig aus", () => {
  const { dir, s, target } = oldWorld();
  const raw = new DatabaseSync(resolve(dir, "game.sqlite"));
  raw.exec("DELETE FROM meta WHERE key='fire-profiles-revision'");
  raw.exec(readFileSync(resolve("config/migrations/029.sql"), "utf8"));
  raw.exec("PRAGMA user_version=29");
  raw.close();
  let db = new Database(dir);
  expect(db.all().get("owner")!.buildings[0].fireProfile).toEqual(target);
  expect(db.all().get("owner")!.money).toBe(s.money);
  expect(
    db.sql
      .prepare("SELECT value FROM meta WHERE key='fire-profiles-source-schema'")
      .get()!.value,
  ).toBe("28");
  const once = db.all().get("owner");
  db.close();
  const backups = readdirSync(dir).filter((n) =>
    n.startsWith("pre-migration-"),
  );
  expect(backups).toHaveLength(1);
  const backup = new DatabaseSync(resolve(dir, backups[0]), { readOnly: true });
  expect(
    JSON.parse(String(backup.prepare("SELECT data FROM saves").get()!.data)),
  ).toEqual(s);
  backup.close();
  db = new Database(dir);
  expect(db.all().get("owner")).toEqual(once);
  db.close();
  expect(
    readdirSync(dir).filter((n) => n.startsWith("pre-migration-")),
  ).toEqual(backups);
});
it("plant schreibfrei, sichert DB28 und migriert nur belegte Profilfelder ohne Geld, Besitz oder Personalverlust", () => {
  const { dir, s, target } = oldWorld();
  const file = resolve(dir, "game.sqlite"),
    bytes = readFileSync(file);
  const raw = new DatabaseSync(file, { readOnly: true });
  const plan = planFireProfileMigration(raw);
  expect(plan.summary.changes).toHaveLength(1);
  expect(plan.summary.changes[0]).toMatchObject({
    target: "ff",
    activeVehicles: 0,
  });
  expect(
    JSON.parse(String(raw.prepare("SELECT data FROM saves").get()!.data)),
  ).toEqual(s);
  raw.close();
  expect(readFileSync(file)).toEqual(bytes);
  let db = new Database(dir);
  const migrated = db.all().get("owner")!;
  expect(migrated.buildings[0].fireProfile).toEqual(target);
  expect(migrated.buildings[0].organization!.kind).toBe("ff");
  expect(migrated.people.filter((p) => p.professional)).toHaveLength(0);
  expect(migrated.people.map((p) => p.id)).toEqual(s.people.map((p) => p.id));
  expect(migrated.vehicles).toEqual(s.vehicles);
  expect(migrated.money).toBe(s.money);
  expect(migrated.journal).toEqual(s.journal);
  expect(migrated.xp).toBe(s.xp);
  expect(migrated.buildings[0].purchaseReceipt).toEqual(
    s.buildings[0].purchaseReceipt,
  );
  expect(migrated.buildings[0].facility).toEqual(s.buildings[0].facility);
  expect(planFireProfileMigration(db.sql).rows).toHaveLength(0);
  db.close();
  const backup = new DatabaseSync(
    resolve(dir, readdirSync(dir).find((n) => n.startsWith("pre-migration-"))!),
    { readOnly: true },
  );
  expect(
    JSON.parse(String(backup.prepare("SELECT data FROM saves").get()!.data)),
  ).toEqual(s);
  backup.close();
  db = new Database(dir);
  expect(db.sql.prepare("PRAGMA user_version").get()!.user_version).toBe(
    DATABASE_VERSION,
  );
  expect(db.all().get("owner")).toEqual(migrated);
  db.close();
});
it("verschiebt die Umstellung bis alle gebundenen Fahrzeuge zurück sind und erhält laufende Besatzungen über Neustart", () => {
  const { dir, s } = oldWorld(true);
  let db = new Database(dir);
  const current = db.all().get("owner")!;
  expect(current.buildings[0].fireProfilePending).toBe(true);
  expect(current.people).toEqual(s.people);
  expect(current.vehicles).toEqual(s.vehicles);
  expect(current.buildings[0].organization).toEqual(
    s.buildings[0].organization,
  );
  reconcileBuildingStaffing(current);
  expect(current.people).toEqual(s.people);
  db.save("owner", current);
  db.close();
  db = new Database(dir);
  const restored = db.all().get("owner")!;
  expect(restored.vehicles).toEqual(s.vehicles);
  const v = restored.vehicles[0];
  v.status = "ready";
  v.mission = null;
  v.assignment = null;
  v.path = [restored.buildings[0].pos];
  reconcileBuildingStaffing(restored);
  expect(restored.buildings[0].fireProfilePending).toBe(false);
  expect(restored.people.filter((p) => p.professional)).toHaveLength(0);
  expect(restored.people.map((p) => p.id)).toEqual(s.people.map((p) => p.id));
  const once = validate(structuredClone(restored));
  reconcileBuildingStaffing(restored);
  expect(restored).toEqual(once);
  db.close();
});
it("ungeklärte Altwachen behalten ihre operative Besetzung und werden nicht durch einen neuen unbekannten Typ stillgelegt", () => {
  const { dir, s } = oldWorld(false, true),
    db = new Database(dir);
  const migrated = db.all().get("owner")!;
  expect(migrated.buildings[0].fireProfile!.kind).toBe("unknown");
  expect(migrated.buildings[0].organization).toEqual(
    s.buildings[0].organization,
  );
  expect(migrated.people).toEqual(s.people);
  expect(migrated.money).toBe(s.money);
  db.close();
});
