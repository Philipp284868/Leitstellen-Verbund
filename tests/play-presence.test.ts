import { describe, it, expect } from "vitest";
import { WorldPresence, PLAY_LEASE_MS } from "../src/server/presence";
import { Database } from "../src/server/database";
import { Game } from "../src/server/game";
import { fresh } from "../src/shared/model";
import { apply, tick } from "../src/shared/engine";
import { fixturePurchase } from "./fixtures/germany/facilities";
import { sites } from "./fixtures/germany/locations";
import { Diagnostics } from "../src/server/diagnostics";

describe("Authentifizierte Spielanwesenheit", () => {
  it("trennt Menü, mehrere Tabs, Frist, Widerruf und geänderte Mitgliedschaft", () => {
    const p = new WorldPresence(),
      valid = () => true,
      owner = () => "desk";
    p.connect("one", "u", "s1");
    p.connect("two", "v", "s2");
    expect(p.playing("desk", 0, valid, owner)).toBe(false);
    p.play("one", "desk", true, 0);
    p.play("two", "desk", true, 10);
    p.play("one", "desk", false, 11);
    expect(p.playing("desk", 11, valid, owner)).toBe(true);
    expect(p.playing("foreign", 11, valid, owner)).toBe(false);
    expect(p.playing("desk", 11, valid, () => "changed")).toBe(false);
    expect(p.playing("desk", 11, () => false, owner)).toBe(false);
    expect(p.playing("desk", PLAY_LEASE_MS + 10, valid, owner)).toBe(false);
    p.play("two", "desk", true, 100);
    p.disconnect("two", 101);
    expect(p.playing("desk", 101, valid, owner)).toBe(false);
    p.play("one", "desk", true, 100);
    p.revokeSession("s1");
    expect(p.playing("desk", 101, valid, owner)).toBe(false);
    expect(new WorldPresence().playing("desk", 101, valid, owner)).toBe(false);
  });
  it("erzeugt nur im Spiel Notrufe und holt Abwesenheit nicht nach", () => {
    const db = new Database("", { memory: true });
    try {
      const s = fresh("Anwesenheit", "Mitte", 10000);
      s.player.id = "u";
      db.sql
        .prepare(
          "INSERT INTO users(id,username,password,role,created) VALUES('u','present','unused','player',0)",
        )
        .run();
      apply(s, fixturePurchase("fire", sites[0]));
      tick(s, s.time + 30, {}, false, false);
      apply(s, { type: "buy", kind: "tsf", home: s.buildings[0].id });
      db.save("u", s);
      let active = false;
      const game = new Game(db, () => active);
      for (let i = 0; i < 150; i++) game.step(5);
      expect(db.all().get("u")!.missions).toHaveLength(0);
      active = true;
      for (let i = 0; i < 72; i++) game.step(5);
      expect(db.all().get("u")!.missions.length).toBeGreaterThan(0);
      active = false;
      const before = db.all().get("u")!,
        ids = before.missions.map((m) => m.id);
      const calls = before.missions.flatMap((m) =>
        m.control!.calls.map((c) => c.id),
      );
      for (let i = 0; i < 150; i++) game.step(5);
      const after = db.all().get("u")!;
      expect(after.missions.map((m) => m.id)).toEqual(ids);
      expect(
        after.missions.flatMap((m) => m.control!.calls.map((c) => c.id)),
      ).toEqual(calls);
      new Game(db).step(5);
      active = true;
      game.step(1);
      expect(
        db
          .all()
          .get("u")!
          .missions.map((m) => m.id),
      ).toEqual(ids);
    } finally {
      db.close();
    }
  });
  it("fasst Diagnosewiederholungen ohne private Fehlerobjekte zusammen", () => {
    let now = 0;
    const lines: string[] = [];
    const d = new Diagnostics(
      (line) => lines.push(line),
      () => now,
    );
    for (let i = 0; i < 100; i++)
      d.log("routing", "UNREACHABLE", "warn", { status: 400 });
    expect(lines).toHaveLength(1);
    now = 30000;
    d.log("routing", "UNREACHABLE", "warn", { status: 400 });
    expect(JSON.parse(lines[1])).toMatchObject({
      repeated: 99,
      status: 400,
      level: "warn",
    });
    expect(JSON.parse(lines[1]).correlation).toBeTruthy();
  });
});
