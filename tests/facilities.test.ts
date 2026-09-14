import { FIRE_GAME_PROFILES } from "../src/shared/facilities/fire-profile";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Database } from "../src/server/database";
import { Game } from "../src/server/game";
import { apply, tick } from "../src/shared/engine";
import { fresh, validate } from "../src/shared/model";
import { GermanyRoutingError } from "../src/shared/germany/errors";
import { assertFacilityAccess } from "../src/shared/facilities/purchase";
import { xpForLevel } from "../src/shared/progression";
import { bookMoney } from "../src/shared/economy/ledger";
import { hospitalOptions } from "../src/simulation/hospitals";
import {
  fixturePurchase,
  logicFacilityCatalog,
} from "./fixtures/germany/facilities";
import { sites } from "./fixtures/germany/locations";
import {
  installGermanyProvider,
  germanyProvider,
} from "../src/shared/germany/world";
import {
  applyFacilityMigration,
  assertFacilityMigration,
  planFacilityMigration,
} from "../src/server/facilities/migration";
import { facilityResponse } from "../src/server/facilities/http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const resources: (() => void)[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const close of resources.reverse()) close();
  resources.length = 0;
});
function setup() {
  const db = new Database("unused", { memory: true });
  resources.push(() => db.close());
  const game = new Game(db);
  for (const id of ["owner", "member", "other"]) {
    db.sql
      .prepare("INSERT INTO users VALUES(?,?,?,'player',0)")
      .run(id, id, "unused");
    const s = fresh(id, id, 1000);
    s.player.id = id;
    db.save(id, s);
  }
  db.sql
    .prepare("INSERT INTO desk_members(user_id,owner_id) VALUES(?,?)")
    .run("member", "owner");
  return {
    db,
    game,
    run: (user: string, action: unknown, id = crypto.randomUUID()) =>
      game.command(user, { id, action }),
  };
}
describe("reale Standortkäufe und unveränderliche Identität", () => {
  it("behält einen früheren funktionierenden Zugang hinter den bevorzugten Alternativen", () => {
    const provider = germanyProvider();
    const facility = structuredClone(
      logicFacilityCatalog.get(fixturePurchase("fire", sites[0]).facility)!,
    );
    facility.accessAlternatives = [sites[1], sites[2], sites[3]].map((pos) => ({
      ...facility.access!,
      pos,
    }));
    vi.spyOn(provider, "isLandSite").mockImplementation((point) => {
      if (point.x !== sites[3].x || point.y !== sites[3].y)
        throw new GermanyRoutingError("Missing access", "no-route");
      return true;
    });
    expect(assertFacilityAccess(facility).pos).toEqual(sites[3]);
  });
  it("erhält bei Ausfall der Zugangsprüfung Geld und Besitz und erlaubt danach einen einmaligen Kauf", () => {
    const { db, run } = setup(),
      action = fixturePurchase("fire", sites[0]);
    const before = JSON.stringify(db.all().get("owner"));
    const land = vi
      .spyOn(germanyProvider(), "isLandSite")
      .mockImplementation(() => {
        throw new GermanyRoutingError("Routing unavailable", "unavailable");
      });
    expect(() => run("owner", action)).toThrow("Routing unavailable");
    expect(land).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(db.all().get("owner"))).toBe(before);
    land.mockRestore();
    run("owner", action);
    const bought = db.all().get("owner")!;
    run("owner", action);
    expect(db.all().get("owner")).toEqual({
      ...bought,
      revision: bought.revision + 1,
    });
  });
  it("prüft eine alternative Zufahrt auch nach einer fehlgeschlagenen Landzugangsprüfung", () => {
    const provider = germanyProvider();
    const facility = structuredClone(
      logicFacilityCatalog.get(fixturePurchase("fire", sites[0]).facility)!,
    );
    facility.accessAlternatives = [{ ...facility.access!, pos: sites[1] }];
    const first = facility.access!.pos;
    vi.spyOn(provider, "isLandSite").mockImplementation((point) => {
      if (point.x === first.x && point.y === first.y)
        throw new GermanyRoutingError("Cannot find point 0", "no-route");
      return true;
    });
    expect(assertFacilityAccess(facility)).toEqual(
      facility.accessAlternatives[0],
    );
  });
  it("nutzt die nächste Standortzufahrt und erhält bei einem Routingausfall den unveränderten Besitz", () => {
    const provider = germanyProvider();
    const facility = structuredClone(
      logicFacilityCatalog.get(fixturePurchase("fire", sites[0]).facility)!,
    );
    const first = facility.access!.pos;
    facility.accessAlternatives = [{ ...facility.access!, pos: sites[1] }];
    let rejected = 0;
    installGermanyProvider({
      ...provider,
      route: (...args) => {
        if (args[0].x === first.x && args[0].y === first.y) {
          rejected++;
          throw new GermanyRoutingError("Erste Zufahrt gesperrt", "no-route");
        }
        return provider.route(...args);
      },
    });
    expect(assertFacilityAccess(facility)).toEqual(
      facility.accessAlternatives[0],
    );
    expect(rejected).toBeGreaterThan(0);
    installGermanyProvider({
      ...provider,
      route: () => {
        throw new GermanyRoutingError(
          "Routingserver nicht erreichbar",
          "unavailable",
        );
      },
    });
    expect(() => assertFacilityAccess(facility)).toThrow(
      "Routingserver nicht erreichbar",
    );
  });
  it("erhält laufende öffentliche Transporte und Betten bei abgewiesenem Krankenhauskauf", () => {
    const s = fresh("A", "B", 1000);
    s.xp = xpForLevel(30);
    bookMoney(s, 200000000, "Isoliertes Testbudget");
    apply(s, fixturePurchase("ems", sites[0]));
    tick(s, 1030, {}, false, false);
    apply(s, { type: "buy", kind: "rtw", home: s.buildings[0].id });
    const clinic = logicFacilityCatalog.get(
      fixturePurchase("hospital", sites[1]).facility,
    )!;
    const provider = germanyProvider();
    installGermanyProvider({
      ...provider,
      hospitals: () => [
        {
          ...clinic.access!.pos,
          id: clinic.id,
          facilityId: clinic.id,
          name: clinic.name,
          aliases: clinic.sources,
          emergency: "unknown",
        },
      ],
    });
    const publicId = `public:${clinic.id}`;
    s.beds.push({ id: "already-treated", home: publicId, until: 2000 });
    const v = s.vehicles[0];
    v.status = "transport";
    v.destination = publicId;
    v.patients = 1;
    v.path = [sites[0], sites[1]];
    v.depart = s.time;
    v.arrive = s.time + 100;
    const before = hospitalOptions(s, sites[0], 1);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({
      id: publicId,
      occupied: 1,
      reserved: 1,
      reason: "",
    });
    const path = structuredClone(v.path),
      arrival = v.arrive;
    const money = s.money;
    expect(() => apply(s, fixturePurchase("hospital", sites[1]))).toThrow(
      /Serverkrankenhaus/,
    );
    expect(s.money).toBe(money);
    expect(v.path).toEqual(path);
    expect(v.arrive).toBe(arrival);
    expect(s.beds[0].home).toBe(publicId);
    expect(v.destination).toBe(publicId);
    expect(hospitalOptions(s, sites[0], 1)).toMatchObject([
      { id: publicId, occupied: 1, reserved: 1 },
    ]);
    s.beds = [];
    tick(s, arrival + 1, {}, false, false);
    expect(s.beds.filter((b) => b.home === publicId)).toHaveLength(1);
    expect(v.patients).toBe(0);
    expect(v.status).toBe("return");
    expect(() => validate(s)).not.toThrow();
  });
  it("listet vor dem Kauf reale Referenzen ohne sie zu verschenken und bucht pro Leitstelle atomar nur einmal", () => {
    const { db, run } = setup(),
      action = fixturePurchase("fire", sites[0]),
      before = db.all().get("owner")!.money;
    const offer = facilityResponse(
      new URL(`http://test/api/facilities?id=${action.facility}`),
      db.all().get("owner")!,
    );
    expect(offer).toMatchObject({
      price: FIRE_GAME_PROFILES.ff.price,
      owned: undefined,
      reason: "",
    });
    expect(db.all().get("owner")!.buildings).toHaveLength(0);
    const id = crypto.randomUUID();
    run("owner", action, id);
    run("owner", action, id);
    run("member", action);
    run("owner", action);
    const s = db.all().get("owner")!;
    expect(s.money).toBe(before - FIRE_GAME_PROFILES.ff.price);
    expect(s.buildings).toHaveLength(1);
    expect(s.buildings[0].facility!.id).toBe(action.facility);
    expect(s.buildings[0].pos).toEqual(sites[0]);
    expect(db.all().get("member")!.buildings).toHaveLength(0);
    const otherMoney = db.all().get("other")!.money;
    expect(() => run("other", action)).toThrow(/bereits von owner erworben/);
    expect(db.all().get("other")!.buildings).toHaveLength(0);
    expect(db.all().get("other")!.money).toBe(otherMoney);
    expect(
      db.sql.prepare("SELECT COUNT(*) n FROM facility_rights").get()!.n,
    ).toBe(1);
  });
  it("verwirft Preise, Eigentümer und Koordinaten vom Client; prüft Geld, Stufe, Zugang und freie Bauaktionen", () => {
    const { db, run } = setup(),
      action = fixturePurchase("fire", sites[0]);
    const before = JSON.stringify(db.all().get("owner"));
    for (const forged of [
      { ...action, price: 1 },
      { ...action, owner: "other" },
      { ...action, pos: sites[1] },
      { ...action, capacity: 999 },
      { type: "build", kind: "fire", pos: sites[1] },
      { type: "move-building", id: "any", pos: sites[1] },
    ])
      expect(() => run("owner", forged)).toThrow();
    expect(() => run("owner", fixturePurchase("heli", sites[0]))).toThrow(
      /Stufe/,
    );
    expect(() =>
      run("owner", { type: "purchase-facility", facility: "unknown" }),
    ).toThrow(/Katalog/);
    expect(JSON.stringify(db.all().get("owner"))).toBe(before);
    const s = db.all().get("owner")!;
    bookMoney(s, -s.money, "Testbudget aufgebraucht");
    db.save("owner", s);
    expect(() => run("owner", action)).toThrow(/Budget/);
    const provider = germanyProvider(),
      facility = logicFacilityCatalog.get(action.facility)!;
    installGermanyProvider({
      ...provider,
      facilities: {
        ...logicFacilityCatalog,
        get: () => ({ ...facility, access: undefined }),
      },
    });
    expect(() => apply(fresh("A", "B", 1000), action)).toThrow(/Zufahrt/);
    installGermanyProvider({
      ...provider,
      route: () => {
        throw Error("Kein Fahrweg");
      },
    });
    const roadSave = fresh("A", "B", 1000),
      unchanged = JSON.stringify(roadSave);
    expect(() => apply(roadSave, action)).toThrow(/Fahrweg/);
    expect(JSON.stringify(roadSave)).toBe(unchanged);
  });
  it("sperrt nachträgliche Standortänderungen und rollt einen Identitätskonflikt vollständig zurück", () => {
    const { db, run } = setup();
    run("owner", fixturePurchase("fire", sites[0]));
    const saved = db.all().get("owner")!,
      before = JSON.stringify(saved);
    for (const edit of [
      (s: typeof saved) => {
        s.buildings[0].pos = sites[1];
      },
      (s: typeof saved) => {
        s.buildings[0].facility!.id = "other";
      },
      (s: typeof saved) => {
        delete s.buildings[0].facility;
      },
      (s: typeof saved) => {
        s.buildings.push({ ...s.buildings[0], id: "duplicate" });
      },
    ]) {
      const changed = structuredClone(saved);
      edit(changed);
      expect(() => db.save("owner", changed)).toThrow();
      expect(JSON.stringify(db.all().get("owner"))).toBe(before);
    }
    expect(() =>
      run("owner", {
        type: "move",
        id: saved.buildings[0].id,
        home: saved.buildings[0].id,
      }),
    ).toThrow(/BUILDING_PURCHASE_ONLY/);
  });
  it("erhält Kauf, Personal und Fahrzeug nach SQLite-Neustart; Datenupdates ändern keine laufenden Positionen", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "lv-facilities-"));
    resources.push(() => rmSync(dir, { recursive: true, force: true }));
    let db = new Database(dir);
    try {
      db.sql
        .prepare(
          "INSERT INTO users VALUES('restart','restart','unused','player',0)",
        )
        .run();
      const s = fresh("A", "B", 1000);
      s.player.id = "restart";
      apply(s, fixturePurchase("fire", sites[0]));
      tick(s, 1030, {}, false, false);
      apply(s, { type: "buy", kind: "tsf", home: s.buildings[0].id });
      db.save("restart", s);
      const before = JSON.stringify(db.all().get("restart"));
      db.close();
      db = new Database(dir);
      expect(JSON.stringify(db.all().get("restart"))).toBe(before);
      const provider = germanyProvider();
      installGermanyProvider({
        ...provider,
        facilities: {
          ...logicFacilityCatalog,
          get: (id) => {
            const f = logicFacilityCatalog.get(id);
            return (
              f && {
                ...f,
                name: "Neuer Quellenname",
                snapshot: "future",
                pos: sites[10],
              }
            );
          },
        },
      });
      expect(JSON.stringify(db.all().get("restart"))).toBe(before);
      expect(() => assertFacilityMigration(db.sql)).not.toThrow();
    } finally {
      db.close();
    }
  });
});
describe("sichere Standortmigration", () => {
  it("ignoriert stillgelegte Übungswelten bei der Standortmigration", () => {
    const { db, run } = setup();
    run("owner", fixturePurchase("fire", sites[0]));
    db.sql
      .prepare("INSERT INTO training_worlds VALUES(?,?,?)")
      .run(
        "owner",
        JSON.stringify({ save: { buildings: [{ id: "retired" }] } }),
        123,
      );
    expect(planFacilityMigration(db.sql, logicFacilityCatalog).changes).toEqual(
      [],
    );
    expect(() => assertFacilityMigration(db.sql)).not.toThrow();
  });
  it("ordnet ausschließlich eindeutigen Bestand zu und erhält Referenzen, bezahlte Werte, AAO und Personal", () => {
    const { db } = setup(),
      s = db.all().get("owner")!;
    apply(s, fixturePurchase("fire", sites[0]));
    tick(s, 1030, {}, false, false);
    apply(s, { type: "buy", kind: "tsf", home: s.buildings[0].id });
    delete s.buildings[0].facility;
    // A pre-feature checkpoint, intentionally bypassing the new writer to exercise migration.
    db.sql
      .prepare("UPDATE saves SET data=? WHERE user_id='owner'")
      .run(JSON.stringify(s));
    const before = structuredClone(s),
      plan = planFacilityMigration(db.sql, logicFacilityCatalog);
    expect(plan.ready).toBe(true);
    expect(plan.changes).toHaveLength(1);
    expect(() => assertFacilityMigration(db.sql)).toThrow(
      /FACILITY_MIGRATION_REQUIRED/,
    );
    db.transaction(() => applyFacilityMigration(db.sql, logicFacilityCatalog));
    const after = db.all().get("owner")!;
    expect(after.buildings[0].id).toBe(before.buildings[0].id);
    expect(after.buildings[0].purchasePriceCents).toBe(
      before.buildings[0].purchasePriceCents,
    );
    expect(after.people).toEqual(before.people);
    expect(after.vehicles).toEqual(before.vehicles);
    expect(after.money).toBe(before.money);
    expect(after.desk).toEqual(before.desk);
    expect(
      db.transaction(() => applyFacilityMigration(db.sql, logicFacilityCatalog))
        .changes,
    ).toHaveLength(0);
    expect(validate(after)).toEqual(after);
  });
  it("meldet Namen-/Besitzkonflikte und verschiebt keine laufende Rückfahrt", () => {
    const { db } = setup(),
      s = db.all().get("owner")!;
    s.xp = xpForLevel(3);
    apply(s, fixturePurchase("fire", sites[0]));
    delete s.buildings[0].facility;
    s.buildings[0].name = "Meine frei gewählte Wache";
    db.sql
      .prepare("UPDATE saves SET data=? WHERE user_id='owner'")
      .run(JSON.stringify(s));
    const plan = planFacilityMigration(db.sql, logicFacilityCatalog);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]).toMatchObject({
      name: "Meine frei gewählte Wache",
      type: "fire",
      position: { lon: expect.any(Number), lat: expect.any(Number) },
      candidateDetails: expect.arrayContaining([
        expect.objectContaining({
          id: fixturePurchase("fire", sites[0]).facility,
          name: expect.any(String),
          distanceMeters: 0,
          status: "active",
          hasAccess: true,
        }),
      ]),
    });
    expect(() => assertFacilityMigration(db.sql)).toThrow(
      /scripts\/facilities-maintenance.mjs/,
    );
    const before = JSON.stringify(db.all().get("owner"));
    expect(() =>
      db.transaction(() =>
        applyFacilityMigration(db.sql, logicFacilityCatalog),
      ),
    ).toThrow(/Konflikte/);
    expect(JSON.stringify(db.all().get("owner"))).toBe(before);
    const resolution = {
      owner: "owner",
      building: s.buildings[0].id,
      facility: fixturePurchase("fire", sites[0]).facility,
      evidence: "Dokumentierte Zuordnung durch den Serverbetreiber",
    };
    expect(
      planFacilityMigration(db.sql, logicFacilityCatalog, [resolution]).ready,
    ).toBe(true);
    tick(s, 1030, {}, false, false);
    apply(s, { type: "buy", kind: "tsf", home: s.buildings[0].id });
    s.vehicles[0].status = "return";
    db.sql
      .prepare("UPDATE saves SET data=? WHERE user_id='owner'")
      .run(JSON.stringify(s));
    expect(
      planFacilityMigration(db.sql, logicFacilityCatalog, [
        { ...resolution, facility: fixturePurchase("fire", sites[1]).facility },
      ]).conflicts[0].reason,
    ).toMatch(/Laufende Fahrt/);
  });
});
