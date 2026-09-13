import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Database } from "../src/server/database";
import { Game } from "../src/server/game";
import { fresh, validate } from "../src/shared/model";
import { apply } from "../src/shared/engine";
import { bookMoney } from "../src/shared/economy/ledger";
import { xpForLevel } from "../src/shared/progression";
import { bt } from "../src/shared/catalog";
import { sites } from "./fixtures/germany/locations";
import {
  fixturePurchase,
  logicFacilityCatalog,
} from "./fixtures/germany/facilities";
import { SharedClinics } from "../src/server/infrastructure/clinics";
import { publicOwnership } from "../src/server/infrastructure/ownership";
import {
  applyInfrastructureMigration,
  planInfrastructureMigration,
} from "../src/server/infrastructure/migration";
import type { HospitalOption } from "../src/simulation/hospital-profiles";
import { prepared } from "./helpers/patient-transport";
import {
  germanyProvider,
  installGermanyProvider,
} from "../src/shared/germany/world";
import { publicHospitalProfile } from "../src/simulation/hospital-profiles";
import { vehiclePosition } from "../src/shared/vehicle-position";
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.reverse()) close();
  cleanups.length = 0;
});
function fixture(disk = false) {
  const dir = disk
    ? mkdtempSync(resolve(tmpdir(), "lv-shared-infrastructure-"))
    : "unused";
  let db = new Database(dir, { memory: !disk });
  cleanups.push(() => {
    db.close();
    if (disk) rmSync(dir, { recursive: true, force: true });
  });
  for (const id of ["alice", "bob"]) {
    db.sql
      .prepare("INSERT INTO users VALUES(?,?,?,'player',0)")
      .run(id, id + " public", "unused");
    const s = fresh(id, id, 1000);
    s.player.id = id;
    s.xp = xpForLevel(30);
    bookMoney(s, 100_000_000, "Testbestand");
    db.save(id, s);
  }
  return {
    get db() {
      return db;
    },
    restart() {
      db.close();
      db = new Database(dir);
      return db;
    },
  };
}
const clinic: HospitalOption = {
  id: "public:fixture:hospital:0",
  name: "Testklinik · simulierte Kapazität",
  pos: sites[0],
  open: true,
  capacity: 1,
  specialties: ["general", "trauma"],
  departmentCapacity: { general: 1, trauma: 1 },
};
describe("gemeinsame Einrichtungen in einer Serverwelt", () => {
  it("erkennt Katalogaliaswechsel als denselben exklusiven Standort und lässt verschiedene Organisationen auf demselben Gelände getrennt", () => {
    const { db } = fixture(),
      game = new Game(db),
      fire = logicFacilityCatalog.get(
        fixturePurchase("fire", sites[0]).facility,
      )!,
      police = logicFacilityCatalog.get(
        fixturePurchase("police", sites[0]).facility,
      )!;
    game.command("alice", {
      id: crypto.randomUUID(),
      action: { type: "purchase-facility", facility: fire.id },
    });
    const provider = germanyProvider(),
      renamed = {
        ...fire,
        id: "canonical:renamed:fire",
        sources: [...fire.sources, "way:987654"],
      },
      other = { ...police, sources: [...fire.sources] };
    installGermanyProvider({
      ...provider,
      facilities: {
        ...logicFacilityCatalog,
        get: (id) =>
          [fire.id, renamed.id].includes(id)
            ? renamed
            : id === police.id
              ? other
              : logicFacilityCatalog.get(id),
      },
    });
    cleanups.push(() => installGermanyProvider(provider));
    const aliceBefore = db.all().get("alice")!.money;
    game.command("alice", {
      id: crypto.randomUUID(),
      action: { type: "purchase-facility", facility: renamed.id },
    });
    expect(db.all().get("alice")!.money).toBe(aliceBefore);
    expect(db.all().get("alice")!.buildings).toHaveLength(1);
    const before = db.all().get("bob")!.money;
    expect(() =>
      game.command("bob", {
        id: crypto.randomUUID(),
        action: { type: "purchase-facility", facility: renamed.id },
      }),
    ).toThrow(/bereits von alice public/);
    expect(db.all().get("bob")!.money).toBe(before);
    expect(publicOwnership(db.sql, [renamed.id])[0]).toMatchObject({
      facility: renamed.id,
      owner: "alice",
    });
    game.command("bob", {
      id: crypto.randomUUID(),
      action: { type: "purchase-facility", facility: police.id },
    });
    expect(
      publicOwnership(db.sql, [renamed.id, police.id])
        .map((o) => o.owner)
        .sort(),
    ).toEqual(["alice", "bob"]);
  });
  it("tauscht beim tatsächlichen Klinikwechsel das Bett und startet die neue Route an der fahrenden Fahrzeugposition", () => {
    const f = fixture(true),
      provider = germanyProvider(),
      catalog = [60, 90].map(
        (i) => logicFacilityCatalog.get(`fixture:hospital:${i}`)!,
      );
    installGermanyProvider({
      ...provider,
      hospitals: () =>
        catalog.map((h) => ({
          id: h.id,
          name: h.name,
          ...h.pos,
          emergency: "yes" as const,
        })),
    });
    cleanups.push(() => installGermanyProvider(provider));
    const { s, m } = prepared(1, 1, "alice");
    m.pos = { ...sites[0] };
    if (m.location) m.location.access = { ...sites[0] };
    for (const v of s.vehicles.filter((v) => v.type === "rtw"))
      v.path = [{ ...sites[0] }];
    f.db.save("alice", s);
    let game = new Game(f.db);
    game.step(4, Date.now(), { generation: false, sharedSituation: false });
    const moving = f.db.all().get("alice")!,
      v = moving.vehicles.find((v) => v.patients)!;
    expect(v).toBeDefined();
    const before = vehiclePosition(v, moving.time),
      previous = v.destination!;
    const target = catalog.find((h) => `public:${h.id}` !== previous)!,
      next = `public:${target.id}`;
    const action = {
      id: crypto.randomUUID(),
      action: {
        type: "hospital-select" as const,
        mission: m.id,
        vehicle: v.id,
        home: next,
      },
    };
    game.command("alice", action);
    const changed = f.db.all().get("alice")!,
      after = changed.vehicles.find((x) => x.id === v.id)!;
    expect(after.path[0]).toEqual(before);
    expect(after.assignment).toBe(v.assignment);
    expect(after.patients).toBe(1);
    expect(after.destination).toBe(next);
    expect(
      f.db.sql.prepare("SELECT clinic,state FROM clinic_places").all(),
    ).toEqual([{ clinic: next, state: "reserved" }]);
    game.command("alice", action);
    expect(f.db.all().get("alice")).toEqual(changed);
    const old = catalog.find((h) => `public:${h.id}` === previous)!,
      profile = publicHospitalProfile({
        id: old.id,
        name: old.name,
        ...old.pos,
      });
    f.db.transaction(() =>
      new SharedClinics(f.db.sql).reserve(
        profile,
        Array.from({ length: profile.capacity }, (_, i) => ({
          patient: `occupied:${i}`,
          departments: ["general"],
        })),
        "bob",
        "other",
        "other",
        changed.time,
      ),
    );
    expect(() =>
      game.command("alice", {
        id: crypto.randomUUID(),
        action: { ...action.action, home: previous },
      }),
    ).toThrow(/bisherige Aufnahmezusage bleibt/);
    expect(f.db.all().get("alice")).toEqual(changed);
    f.restart();
    game = new Game(f.db);
    for (let i = 0; i < 500 && f.db.all().get("alice")!.missions.length; i++)
      game.step(5, Date.now(), { generation: false, sharedSituation: false });
    expect(
      f.db
        .all()
        .get("alice")!
        .archive.find((x) => x.id === m.id)?.dynamics?.patients[0].transport,
    ).toBe("delivered");
    expect(
      f.db.sql
        .prepare("SELECT state FROM clinic_places WHERE owner='alice'")
        .get()!.state,
    ).toBe("occupied");
  });
  it("führt mehrere Patienten mit echten Fahrzeugfahrten über einen Neustart bis zur einmaligen Übergabe", () => {
    const f = fixture(true),
      { s, m } = prepared(3, 2, "alice");
    f.db.save("alice", s);
    new Game(f.db).step(1, Date.now(), {
      generation: false,
      sharedSituation: false,
    });
    expect(
      f.db.sql
        .prepare("SELECT count(*) n FROM clinic_places WHERE state='reserved'")
        .get()!.n,
    ).toBe(2);
    const traveling = f.db
      .all()
      .get("alice")!
      .vehicles.filter((v) => v.patients);
    expect(
      traveling.every(
        (v) =>
          v.status === "transport" && v.path.length > 1 && v.arrive > v.depart,
      ),
    ).toBe(true);
    f.restart();
    const game = new Game(f.db);
    for (
      let i = 0;
      i < 600 &&
      f.db
        .all()
        .get("alice")!
        .missions.some((x) => x.id === m.id);
      i++
    )
      game.step(5, Date.now(), { generation: false, sharedSituation: false });
    const finished = f.db
      .all()
      .get("alice")!
      .archive.find((x) => x.id === m.id)!;
    expect(finished).toBeDefined();
    expect(
      finished.dynamics!.patients.every(
        (p) => p.transport === "delivered" && !p.vehicle,
      ),
    ).toBe(true);
    expect(finished.transports).toHaveLength(3);
    expect(
      f.db.sql
        .prepare(
          "SELECT count(*) n FROM clinic_places WHERE state IN('occupied','discharged')",
        )
        .get()!.n,
    ).toBe(3);
    const rewarded = f.db.sql
      .prepare("SELECT * FROM xp_rewards ORDER BY id")
      .all();
    game.step(30, Date.now(), { generation: false, sharedSituation: false });
    expect(
      f.db.sql.prepare("SELECT * FROM xp_rewards ORDER BY id").all(),
    ).toEqual(rewarded);
  });
  it("hat genau einen Käufer und eine Abbuchung bei konkurrierenden Befehlen, behält Offlinebesitz und lehnt fremde Verwaltung ab", async () => {
    const f = fixture(true),
      game = new Game(f.db),
      action = fixturePurchase("fire", sites[0]);
    const balances = new Map([...f.db.all()].map(([id, s]) => [id, s.money]));
    const results = await Promise.allSettled(
      ["alice", "bob"].map((user) =>
        Promise.resolve().then(() =>
          game.command(user, { id: crypto.randomUUID(), action }),
        ),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const claims = publicOwnership(f.db.sql, [action.facility]);
    expect(claims).toHaveLength(1);
    const winner = claims[0].owner,
      loser = winner === "alice" ? "bob" : "alice";
    expect(claims[0]).toEqual({
      facility: action.facility,
      owner: winner,
      name: winner + " public",
    });
    expect(f.db.all().get(winner)!.money).toBe(
      balances.get(winner)! - bt("fire").price,
    );
    expect(f.db.all().get(loser)!.money).toBe(balances.get(loser));
    const b = f.db.all().get(winner)!.buildings[0];
    expect(() =>
      game.command(loser, {
        id: crypto.randomUUID(),
        action: { type: "sell", id: b.id },
      }),
    ).toThrow();
    game.command(winner, { id: crypto.randomUUID(), action });
    expect(f.db.all().get(winner)!.money).toBe(
      balances.get(winner)! - bt("fire").price,
    );
    f.restart();
    expect(publicOwnership(f.db.sql, [action.facility])).toEqual(claims);
  });
  it("verweigert Krankenhauskäufe auch ohne Oberfläche und lässt Geld unverändert", () => {
    const { db } = fixture(),
      before = JSON.stringify(db.all().get("alice"));
    expect(() =>
      new Game(db).command("alice", {
        id: crypto.randomUUID(),
        action: fixturePurchase("hospital", sites[0]),
      }),
    ).toThrow(/Serverkrankenhaus/);
    expect(JSON.stringify(db.all().get("alice"))).toBe(before);
  });
  it("vergibt das letzte Bett einmal, hält eine lange Reservation über Restart und übergibt/entlässt einmal", async () => {
    const f = fixture(true),
      service = new SharedClinics(f.db.sql);
    const outcomes = await Promise.all(
      ["alice", "bob"].map((owner) =>
        Promise.resolve().then(() =>
          f.db.transaction(() =>
            service.reserve(
              clinic,
              [
                {
                  patient: owner + ":patient",
                  departments: ["general", "trauma"],
                },
              ],
              owner,
              "mission",
              owner + ":transport",
              1000,
            ),
          ),
        ),
      ),
    );
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const winner = outcomes[0] ? "alice" : "bob",
      loser = winner === "alice" ? "bob" : "alice";
    f.db.transaction(() => service.advance(1000 + 86400 * 10));
    expect(service.snapshot(clinic)).toMatchObject({
      free: 0,
      reserved: 1,
      occupied: 0,
    });
    f.restart();
    const resumed = new SharedClinics(f.db.sql);
    f.db.transaction(() => {
      expect(
        resumed.reserve(
          clinic,
          [
            {
              patient: winner + ":patient",
              departments: ["general", "trauma"],
            },
          ],
          winner,
          "mission",
          winner + ":transport",
          1000,
        ),
      ).toBe(true);
      expect(() =>
        resumed.admit(loser, loser + ":transport", clinic.id, 900000),
      ).toThrow(/reservierung/i);
      expect(
        resumed.admit(winner, winner + ":transport", clinic.id, 900000),
      ).toBe(1);
      expect(
        resumed.admit(winner, winner + ":transport", clinic.id, 900000),
      ).toBe(0);
    });
    expect(resumed.snapshot(clinic)).toMatchObject({
      free: 0,
      reserved: 0,
      occupied: 1,
    });
    f.db.transaction(() => resumed.advance(1000000));
    expect(resumed.snapshot(clinic)).toMatchObject({
      free: 1,
      reserved: 0,
      occupied: 0,
    });
  });
  it("rollt eine Reservierung zusammen mit der Spieltransaktion zurück; ein fehlgeschlagener Zielwechsel behält das alte Bett", () => {
    const { db } = fixture(),
      service = new SharedClinics(db.sql),
      request = [{ patient: "alice:patient", departments: ["general"] }];
    expect(() =>
      db.transaction(() => {
        service.reserve(clinic, request, "alice", "m", "v", 1000);
        throw Error("Abbruch");
      }),
    ).toThrow("Abbruch");
    expect(service.snapshot(clinic).free).toBe(1);
    db.transaction(() => {
      service.reserve(clinic, request, "alice", "m", "v", 1000);
      expect(
        service.reserve(
          { ...clinic, id: "public:fixture:hospital:1", open: false },
          request,
          "alice",
          "m",
          "v",
          1001,
        ),
      ).toBe(false);
      expect(service.snapshot(clinic).reserved).toBe(1);
      expect(
        service.reserve(
          { ...clinic, id: "public:fixture:hospital:1" },
          request,
          "alice",
          "m",
          "v",
          1001,
        ),
      ).toBe(true);
      expect(service.snapshot(clinic).free).toBe(1);
    });
  });
});

describe("belegte, einmalige Bestandsmigration", () => {
  it("führt fremde Altklinikverweise mit laufendem Patiententransport zusammen, ohne Fahrt oder Patient zu verlieren", () => {
    const f = fixture(true),
      { s } = prepared(1, 1, "alice"),
      provider = germanyProvider(),
      hospital = logicFacilityCatalog.get("fixture:hospital:0")!;
    installGermanyProvider({
      ...provider,
      hospitals: () => [
        {
          id: hospital.id,
          name: hospital.name,
          ...hospital.pos,
          emergency: "yes",
        },
      ],
    });
    cleanups.push(() => installGermanyProvider(provider));
    f.db.save("alice", s);
    new Game(f.db).step(1, Date.now(), {
      generation: false,
      sharedSituation: false,
    });
    const moving = f.db.all().get("alice")!,
      vehicle = moving.vehicles.find((v) => v.patients)!;
    expect(vehicle).toBeDefined();
    const target = vehicle.destination!,
      clinicFacility = logicFacilityCatalog.get(target.slice(7))!;
    const owner = f.db.all().get("bob")!;
    bookMoney(
      owner,
      -bt("hospital").price,
      "Standortkauf: " + clinicFacility.name,
    );
    owner.buildings.push({
      id: "bob-old-clinic",
      owner: "bob",
      type: "hospital",
      name: clinicFacility.name,
      pos: clinicFacility.pos,
      level: 1,
      ready: owner.time,
      extensions: [],
      purchasePriceCents: bt("hospital").price,
      purchaseReceipt: {
        id: owner.journal[0].id,
        at: owner.time,
        amount: bt("hospital").price,
      },
      facility: {
        id: clinicFacility.id,
        snapshot: clinicFacility.snapshot,
        sources: clinicFacility.sources,
        position: clinicFacility.pos,
        emergency: clinicFacility.emergency,
        subtype: clinicFacility.subtype,
      },
    });
    owner.beds.push({
      id: "old-bed",
      home: "bob-old-clinic",
      until: owner.time + 50000,
    });
    vehicle.destination = "bob-old-clinic";
    for (const m of moving.missions) {
      for (const t of m.transports) t.hospital = "bob-old-clinic";
      for (const p of m.dynamics?.patients ?? [])
        if (p.vehicle) p.hospital = "bob-old-clinic";
    }
    for (const value of [moving, owner])
      f.db.sql
        .prepare("UPDATE saves SET data=? WHERE user_id=?")
        .run(JSON.stringify(value), value.player.id);
    f.db.sql.exec(
      "DELETE FROM meta WHERE key='shared-infrastructure-v1';DELETE FROM clinic_places;",
    );
    const before = JSON.stringify([...f.db.all()]),
      path = structuredClone(vehicle.path),
      assignment = vehicle.assignment;
    const preview = planInfrastructureMigration(f.db.sql);
    expect(preview.ready).toBe(true);
    expect(preview.clinicPlaces).toEqual({ reserved: 1, occupied: 1 });
    expect(JSON.stringify([...f.db.all()])).toBe(before);
    f.db.transaction(() => applyInfrastructureMigration(f.db.sql));
    const changed = f.db
      .all()
      .get("alice")!
      .vehicles.find((v) => v.id === vehicle.id)!;
    expect(changed).toMatchObject({
      path,
      assignment,
      destination: target,
      patients: 1,
      status: "transport",
    });
    expect(
      f.db.sql
        .prepare("SELECT clinic,state FROM clinic_places ORDER BY state")
        .all(),
    ).toEqual([
      { clinic: target, state: "occupied" },
      { clinic: target, state: "reserved" },
    ]);
    const after = JSON.stringify([...f.db.all()]);
    f.db.transaction(() => applyInfrastructureMigration(f.db.sql));
    expect(JSON.stringify([...f.db.all()])).toBe(after);
    f.restart();
    expect(
      f.db.sql.prepare("SELECT count(*) n FROM clinic_places").get()!.n,
    ).toBe(2);
    const game = new Game(f.db);
    for (let i = 0; i < 600 && f.db.all().get("alice")!.missions.length; i++)
      game.step(5, Date.now(), { generation: false, sharedSituation: false });
    expect(
      f.db.all().get("alice")!.archive[0].dynamics!.patients[0].transport,
    ).toBe("delivered");
    expect(
      f.db.sql.prepare("SELECT count(*) n FROM infrastructure_refunds").get()!
        .n,
    ).toBe(1);
  });
  function oldWorld() {
    const { db } = fixture();
    db.sql
      .prepare("DELETE FROM meta WHERE key='shared-infrastructure-v1'")
      .run();
    for (const [id, s] of db.all()) {
      s.time = id === "alice" ? 1000 : 1100;
      apply(s, fixturePurchase("fire", sites[0]));
      db.sql
        .prepare("UPDATE saves SET data=? WHERE user_id=?")
        .run(JSON.stringify(s), id);
    }
    return db;
  }
  it("verwendet Kaufbelege statt Zeilenfolge, erhält Vermögen in Reserve und erstattet bei zweitem Lauf nichts", () => {
    const db = oldWorld(),
      before = db.all(),
      plan = planInfrastructureMigration(db.sql);
    expect(plan.ready).toBe(true);
    expect(plan.removals.map((e) => e.owner)).toEqual(["bob"]);
    db.transaction(() => applyInfrastructureMigration(db.sql));
    const after = db.all();
    expect(after.get("alice")!.money).toBe(before.get("alice")!.money);
    expect(after.get("bob")!.money).toBe(
      before.get("bob")!.money + bt("fire").price,
    );
    expect(after.get("bob")!.buildings[0].migrationReserve).toBeDefined();
    expect(
      publicOwnership(db.sql, [fixturePurchase("fire", sites[0]).facility])[0]
        .owner,
    ).toBe("alice");
    const serialized = JSON.stringify([...after]);
    db.transaction(() => applyInfrastructureMigration(db.sql));
    expect(JSON.stringify([...db.all()])).toBe(serialized);
  });
  it("blockiert fehlende oder gleiche Kaufzeitpunkte schreibfrei", () => {
    const db = oldWorld();
    const s = db.all().get("bob")!;
    s.buildings[0].purchaseReceipt!.at = 1000;
    db.sql
      .prepare("UPDATE saves SET data=? WHERE user_id=?")
      .run(JSON.stringify(s), "bob");
    const before = JSON.stringify([...db.all()]);
    expect(planInfrastructureMigration(db.sql).ready).toBe(false);
    expect(() =>
      db.transaction(() => applyInfrastructureMigration(db.sql)),
    ).toThrow(/INFRASTRUCTURE_MIGRATION_REQUIRED/);
    expect(JSON.stringify([...db.all()])).toBe(before);
  });
  it("überführt belegte Krankenhausinvestition und Belegung ohne Kappung in die Serverklinik", () => {
    const { db } = fixture();
    db.sql
      .prepare("DELETE FROM meta WHERE key='shared-infrastructure-v1'")
      .run();
    const s = db.all().get("alice")!,
      f = logicFacilityCatalog.get(
        fixturePurchase("hospital", sites[0]).facility,
      )!;
    bookMoney(s, -bt("hospital").price, "Standortkauf: " + f.name);
    s.buildings.push({
      id: "old-clinic",
      owner: s.player.id,
      type: "hospital",
      name: f.name,
      pos: f.pos,
      level: 1,
      ready: s.time,
      extensions: [],
      purchasePriceCents: bt("hospital").price,
      purchaseReceipt: {
        id: s.journal[0].id,
        at: s.time,
        amount: bt("hospital").price,
      },
      facility: {
        id: f.id,
        snapshot: f.snapshot,
        sources: f.sources,
        position: f.pos,
        emergency: f.emergency,
        subtype: f.subtype,
      },
    });
    s.beds.push(
      ...Array.from({ length: 3 }, (_, i) => ({
        id: "bed" + i,
        home: "old-clinic",
        until: s.time + 10000,
      })),
    );
    db.sql
      .prepare("UPDATE saves SET data=? WHERE user_id=?")
      .run(JSON.stringify(validate(s)), s.player.id);
    db.transaction(() => applyInfrastructureMigration(db.sql));
    expect(new SharedClinics(db.sql).snapshot(clinic)).toMatchObject({
      occupied: 3,
      free: 0,
    });
    expect(db.all().get("alice")!.beds).toHaveLength(3);
    expect(
      db.sql.prepare("SELECT count(*) n FROM infrastructure_refunds").get()!.n,
    ).toBe(1);
  });
});
