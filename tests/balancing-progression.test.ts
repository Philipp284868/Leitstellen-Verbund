import { expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../src/server/database";
import { applyBalancingMigration } from "../src/server/balancing-migration";
import { fresh, validate } from "../src/shared/model";
import {
  progress,
  xpForLevel,
  MAX_XP,
  missionXp,
  unlockLevels,
  maxConcurrentIncidents,
} from "../src/shared/progression";
import {
  progress as oldProgress,
  xpForLevel as oldXp,
  unlockLevels as oldUnlocks,
} from "../src/shared/progression-v1";
import { unlocked } from "../src/shared/progression-state";
import {
  buildings,
  vehicles,
  extensions,
  missions,
  vehicleHomeAllowed,
} from "../src/shared/catalog";
import { unlockMatrix } from "../src/shared/unlocks";
import {
  sealMissionXp,
  awardMissionXp,
  withXpJournal,
} from "../src/simulation/xp-rewards";
import { fixtureMission } from "./fixtures/germany/mission";
import { radioFixture } from "./radio-fixture";
import { incidentLoad } from "../src/simulation/workload";
import "./fixtures/germany/session";

it("überträgt jede Schwelle, Restfortschritt und große XP-Stände einmalig, ohne Geld oder alte Rechte zu verlieren", () => {
  const points = [0, MAX_XP];
  for (const l of [1, 2, 5, 6, 7, 10, 15, 20, 25, 30, 50, 100, 10000])
    for (const fraction of [0, 0.01, 0.5, 0.999])
      points.push(oldXp(l) + Math.floor((oldXp(l + 1) - oldXp(l)) * fraction));
  for (const xp of points) {
    const raw = fresh("Alt", "Alt", 1000);
    raw.xp = xp;
    raw.progression!.version = 1;
    const old = oldProgress(xp),
      next = validate(raw),
      p = progress(next.xp);
    expect(p.level).toBe(old.level);
    expect(Math.abs(p.fraction - old.fraction)).toBeLessThanOrEqual(
      1 / p.required,
    );
    expect(next.money).toBe(raw.money);
    expect(next.progression!.rawEarned).toBe(xp);
    expect(next.progression!.conversion).toMatchObject({
      fromXp: xp,
      toXp: next.xp,
      level: old.level,
    });
    for (const [kind, items] of Object.entries(oldUnlocks))
      for (const [id, l] of Object.entries(items))
        if (l <= old.level && !(kind === "building" && id === "hospital"))
          expect(unlocked(next, kind, id), `${kind}/${id}`).toBe(true);
    expect(validate(next)).toEqual(next);
  }
});

it("prüft den gesamten realen Katalog samt Organisationseinstiegen, Erweiterungen, Ausbildung und Ausbaustufen", () => {
  const s = fresh("Neu", "Neu", 1000),
    matrix = unlockMatrix(s);
  for (const [kind, items] of [
    ["building", buildings],
    ["vehicle", vehicles],
    ["extension", extensions],
  ] as const) {
    expect(Object.keys(unlockLevels[kind]).sort()).toEqual(
      items.map((i) => i.id).sort(),
    );
    for (const item of items) {
      if (kind === "building" && item.id === "hospital") {
        expect(matrix.some((r) => r.id === "building:hospital")).toBe(false);
        continue;
      }
      const row = matrix.find((r) => r.id === `${kind}:${item.id}`)!;
      expect(row.level).toBe(item.level);
      if (item.level > 1) {
        s.xp = xpForLevel(item.level) - 1;
        expect(unlocked(s, kind, item.id)).toBe(false);
      }
      s.xp = xpForLevel(item.level);
      expect(unlocked(s, kind, item.id)).toBe(true);
    }
  }
  for (const b of buildings)
    if (b.slots)
      expect(
        vehicles.some((v) => vehicleHomeAllowed(v, b.id) && v.level <= b.level),
        b.id,
      ).toBe(true);
  for (const v of vehicles) {
    expect(
      buildings.find((b) => b.id === v.home)!.level,
      v.id,
    ).toBeLessThanOrEqual(v.level);
    for (const e of extensions.filter((e) => e.types.includes(v.id)))
      expect(e.level, v.id).toBeLessThanOrEqual(v.level);
    if (v.training)
      expect(matrix.find((r) => r.id === `vehicle:${v.id}`)!.detail).toContain(
        v.training,
      );
  }
  expect(matrix.filter((r) => r.id.startsWith("upgrade:"))).toHaveLength(
    buildings.filter((b) => b.id !== "hospital").length * 9,
  );
  for (const m of missions) {
    expect(Number.isSafeInteger(missionXp(m)), m.id).toBe(true);
    expect(missionXp(m)).toBeGreaterThan(0);
    expect(missionXp(m)).toBeLessThanOrEqual(150);
  }
});

it("zahlt ganzzahlige XP erst beim endgültigen Abschluss; Ereignisjournal und eingefrorene Regeln verhindern Wiederholungen", () => {
  const s = fresh("Owner", "Owner", 1000),
    m = fixtureMission(s, "bin");
  const before = s.money;
  sealMissionXp(m);
  expect(awardMissionXp(s, m, "owner", 1)).toBe(0);
  m.template = "rail"; // A later escalation cannot increase the sealed reward.
  m.phase = "done";
  const clone = structuredClone(m),
    receipts = new Set<string>();
  const claim = (a: { id: string }) => {
    if (receipts.has(a.id)) return false;
    receipts.add(a.id);
    return true;
  };
  withXpJournal(claim, () => {
    expect(awardMissionXp(s, m, "owner", 1)).toBe(20);
    expect(awardMissionXp(s, m, "owner", 1)).toBe(0);
    clone.round = "a-later-cooperation-round";
    expect(awardMissionXp(s, clone, "owner", 1)).toBe(0);
  });
  expect(s.xp).toBe(20);
  expect(s.money).toBe(before);
  expect(receipts.size).toBe(1);
  const partial = fixtureMission(s, "bin");
  partial.telemetry = {
    since: 1000,
    partial: true,
    meters: 0,
    units: [],
    credits: null,
    xp: 7,
    aaos: [],
  };
  sealMissionXp(partial, true);
  partial.phase = "done";
  expect(awardMissionXp(s, partial, "owner", 1)).toBe(13);
  expect(awardMissionXp(s, partial, "owner", 1)).toBe(0);
  const helpers = [
    fresh("A", "A", 1000),
    fresh("B", "B", 1000),
    fresh("C", "C", 1000),
  ];
  m.contributors = helpers.map((h) => h.player.id);
  expect(
    helpers.reduce((n, h) => n + awardMissionXp(h, m, "helper", 1), 0),
  ).toBe(5);
  for (const h of helpers) expect(awardMissionXp(h, m, "helper", 1)).toBe(0);
  expect(() => awardMissionXp(fresh("Out", "Out", 0), m, "helper", 1)).toThrow(
    /berechtigt/,
  );
});

it("migriert SQLite und AMP-Staging mit Sicherung, Solo/Multi-Trennung, Altüberhang und stillem Funk genau einmal", () => {
  for (const staged of [false, true]) {
    const dir = mkdtempSync(join(tmpdir(), "lv-balance-"));
    let db = new Database(dir);
    try {
      db.sql
        .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
        .run("old", "old", "unused", "player", 0);
      const s = radioFixture("old");
      s.xp = oldXp(2) + 77;
      s.progression = {
        version: 1,
        compensation: 0,
        previousXp: 0,
        previousLevel: 1,
      };
      delete s.missions[0].control!.radioSummary;
      delete s.missions[0].xpPolicy;
      for (let i = 0; i < 6; i++) s.missions.push(fixtureMission(s, "bin"));
      db.sql
        .prepare("INSERT INTO saves VALUES(?,?)")
        .run("old", JSON.stringify(s));
      const solo = structuredClone(s);
      solo.generation = "solo-old-generation";
      solo.xp = oldXp(6) + 15;
      solo.missions = [];
      solo.vehicles = [];
      solo.people = [];
      solo.buildings = [];
      db.sql
        .prepare("INSERT INTO solo_saves VALUES(?,?)")
        .run("old", JSON.stringify(solo));
      db.sql
        .prepare(
          "DELETE FROM meta WHERE key IN ('game-rules-v2','balance-source-schema')",
        )
        .run();
      db.sql.exec("PRAGMA user_version=26");
      if (staged) {
        db.sql.exec(readFileSync("config/migrations/027.sql", "utf8"));
        db.sql.exec("PRAGMA user_version=27");
      }
      db.close();
      db = new Database(dir);
      const next = db.all().get("old")!;
      expect(progress(next.xp).level).toBe(2);
      expect(next.money).toBe(s.money);
      expect(next.vehicles).toEqual(s.vehicles);
      expect(incidentLoad(next)).toMatchObject({
        used: 7,
        limit: 4,
        inherited: 7,
        overloaded: true,
      });
      expect(next.missions.every((m) => m.xpPolicy?.transition)).toBe(true);
      expect(
        next
          .radioNetwork!.entries.filter((e) => e.consolidated)
          .every((e) => e.silent),
      ).toBe(true);
      const soloNext = JSON.parse(
        String(
          db.sql
            .prepare("SELECT data FROM solo_saves WHERE user_id='old'")
            .get()!.data,
        ),
      );
      expect(progress(soloNext.xp).level).toBe(6);
      expect(soloNext.money).toBe(solo.money);
      if (!staged)
        expect(
          readdirSync(dir).some((n) => n.startsWith("pre-migration")),
        ).toBe(true);
      const data = String(
        db.sql.prepare("SELECT data FROM saves WHERE user_id='old'").get()!
          .data,
      );
      db.close();
      db = new Database(dir);
      expect(
        String(
          db.sql.prepare("SELECT data FROM saves WHERE user_id='old'").get()!
            .data,
        ),
      ).toBe(data);
    } finally {
      db.close();
    }
  }
});

it("rollt die komplette Domänenmigration bei ungültigem Spielstand zurück", () => {
  const db = new Database("", { memory: true });
  try {
    for (const id of ["a", "b"]) {
      db.sql
        .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
        .run(id, id, "unused", "player", 0);
      const s = fresh(id, id, 1000);
      s.player.id = id;
      s.progression!.version = 1;
      s.xp = oldXp(5);
      if (id === "b") s.money = -1;
      db.sql
        .prepare("INSERT INTO saves VALUES(?,?)")
        .run(id, JSON.stringify(s));
    }
    db.sql.exec("DELETE FROM meta WHERE key='game-rules-v2'");
    const before = db.sql.prepare("SELECT * FROM saves ORDER BY user_id").all();
    expect(() =>
      db.transaction(() => applyBalancingMigration(db.sql, 26)),
    ).toThrow();
    expect(
      db.sql.prepare("SELECT * FROM saves ORDER BY user_id").all(),
    ).toEqual(before);
    expect(
      db.sql.prepare("SELECT * FROM meta WHERE key='game-rules-v2'").get(),
    ).toBeUndefined();
  } finally {
    db.close();
  }
});

it("bucht XP im dauerhaften Journal atomar und übersteht Neustart sowie einen erneut zugestellten Abschluss", () => {
  const dir = mkdtempSync(join(tmpdir(), "lv-xp-journal-"));
  let db = new Database(dir);
  try {
    db.sql
      .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
      .run("xp-owner", "xp-owner", "unused", "player", 0);
    const s = fresh("XP", "XP", 1000);
    s.player.id = "xp-owner";
    const m = fixtureMission(s, "bin");
    m.phase = "done";
    sealMissionXp(m);
    s.missions = [m];
    db.save(s.player.id, s);
    const award = () => {
      const current = db.all().get(s.player.id)!;
      return withXpJournal(
        (a) =>
          !!db.sql
            .prepare(
              "INSERT OR IGNORE INTO xp_rewards(id,user_id,generation,mission,kind,amount,version) VALUES(?,?,?,?,?,?,2)",
            )
            .run(a.id, a.recipient, a.generation, a.mission, a.kind, a.amount)
            .changes,
        () => {
          const xp = awardMissionXp(current, current.missions[0], "owner", 1);
          db.save(current.player.id, current);
          return xp;
        },
      );
    };
    expect(() =>
      db.transaction(() => {
        award();
        throw Error("Simulierter Schreibabbruch");
      }),
    ).toThrow(/Schreibabbruch/);
    expect(db.all().get(s.player.id)!.xp).toBe(0);
    expect(
      db.sql.prepare("SELECT count(*) AS n FROM xp_rewards").get()!.n,
    ).toBe(0);
    let earned = 0;
    db.transaction(() => {
      earned = award();
    });
    expect(earned).toBe(20);
    db.close();
    db = new Database(dir);
    // Simulate a duplicated job whose old snapshot did not yet contain its in-save receipt.
    const replay = db.all().get(s.player.id)!;
    replay.missions[0].xpPolicy!.awarded = {};
    db.save(replay.player.id, replay);
    db.transaction(() => {
      earned = award();
    });
    expect(earned).toBe(0);
    expect(db.all().get(s.player.id)!.xp).toBe(20);
    expect(
      db.sql.prepare("SELECT sum(amount) AS n FROM xp_rewards").get()!.n,
    ).toBe(20);
  } finally {
    db.close();
  }
});

it("verwendet die Obergrenze exakt auch an hohen Leveln", () => {
  for (const l of [1, 2, 5, 7, 8, 10, 20, 50, 10000])
    expect(maxConcurrentIncidents(l)).toBe(Math.min(10, l + 2));
});
