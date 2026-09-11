import { expect, it } from "vitest";
import { Database } from "../server/database";
import { Game } from "../server/game";
import { writeWorldSituation } from "../server/world-situation";
import { createSituation } from "../src/simulation/world-situation";
import { phaseFixture } from "./dispatch-fixture";
import { addUnit } from "./incident-dynamics-fixture";

it("simuliert über zehn parallele Einsätze während einer Wetterlage ohne Bestandssperre und erhält sie nach Wiederverbindung", () => {
  const db = new Database("", { memory: true });
  try {
    const s = phaseFixture("wave", "bin");
    s.missions = [];
    s.missionWait = 0;
    s.buildings[0].level = 10;
    for (const kind of [
      "lf",
      "lf",
      "gkw",
      "thw-pump",
      "thw-power",
      "rtw",
      "nef",
    ])
      addUnit(s, kind);
    db.sql
      .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
      .run(s.player.id, "wave", "unused", "player", 0);
    db.save(s.player.id, s);
    writeWorldSituation(db.sql, createSituation(s.time, 123, "storm"));
    const game = new Game(db);
    for (let i = 0; i < 120; i++) game.step(30);
    const active = db.all().get(s.player.id)!;
    expect(active.missions.length).toBeGreaterThanOrEqual(10);
    expect(new Set(active.missions.map((m) => m.id)).size).toBe(
      active.missions.length,
    );
    expect(
      new Set(active.missions.map((m) => `${m.pos.x}:${m.pos.y}`)).size,
    ).toBeGreaterThan(3);
    expect(active.missions.every((m) => m.location?.state === "verified")).toBe(
      true,
    );
    expect(active.missions.some((m) => (m.dynamics?.level ?? 1) > 1)).toBe(
      true,
    );
    const ids = active.missions.map((m) => m.id);
    expect(
      new Game(db).view(s.player.id, new Set()).save.missions.map((m) => m.id),
    ).toEqual(ids);
    game.step(10, Date.now(), { generation: false });
    expect(
      db
        .all()
        .get(s.player.id)!
        .missions.map((m) => m.id),
    ).toEqual(ids);
  } finally {
    db.close();
  }
}, 30000);
