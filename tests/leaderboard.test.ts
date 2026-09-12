import { it, expect } from "vitest";
import { Database } from "../src/server/database";
import { phaseFixture } from "./dispatch-fixture";
import {
  leaderboard,
  recordActivity,
  persistMetrics,
  recordPlayTime,
} from "../src/server/leaderboard";
import { buildReport, telemetry } from "../src/simulation/reports";
it("wertet Offline-Spieler, echte persönliche Beteiligung und gemeinsamen Besitz getrennt; keine Mehrfachpunkte", () => {
  const db = new Database("", { memory: true });
  try {
    const owner = phaseFixture("owner"),
      member = phaseFixture("member"),
      technical = phaseFixture("technical");
    for (const s of [owner, member, technical]) {
      s.xp = 0;
      s.player.name = s.player.id;
      db.sql
        .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
        .run(s.player.id, s.player.id, "private-password", "player", 1);
      db.save(s.player.id, s);
    }
    db.sql.prepare("INSERT INTO desk_members VALUES('member','owner')").run();
    db.sql
      .prepare("UPDATE player_metrics SET excluded=1 WHERE user_id='technical'")
      .run();
    const m = owner.missions[0];
    const accepted = {
      type: "call",
      mission: m.id,
      call: "call-1",
      op: "accept",
    };
    recordActivity(db.sql, owner, "owner", accepted, "a");
    recordActivity(db.sql, owner, "owner", accepted, "a");
    recordActivity(db.sql, owner, "member", accepted, "b");
    recordActivity(
      db.sql,
      owner,
      "member",
      { type: "dispatch", mission: m.id },
      "c",
    );
    telemetry(owner, m).xp = 101;
    m.phase = "done";
    m.completed = owner.time + 100;
    m.report = buildReport(m);
    owner.missions = [];
    owner.archive = [m];
    persistMetrics(db.sql, owner);
    persistMetrics(db.sql, owner);
    recordPlayTime(db.sql, ["owner", "owner", "member"], 5);
    recordPlayTime(db.sql, ["owner"], 900);
    const board = leaderboard(db.sql, "owner", "", 0, "xp");
    expect(board.total).toBe(2);
    expect(board.items.map((x) => x.xp)).toEqual([51, 50]);
    expect(board.items.reduce((n, x) => n + x.calls, 0)).toBe(1);
    expect(
      board.items.every((x) => x.participations === 1 && x.activeSeconds === 5),
    ).toBe(true);
    expect(board.items[0].shared).toEqual(board.items[1].shared);
    expect(JSON.stringify(board)).not.toMatch(
      /private-password|password|csrf|session|cookie|mission-.*|latitude/,
    );
    expect(
      leaderboard(db.sql, "owner", "member", 99, "name").items,
    ).toHaveLength(1);
    expect(() =>
      db.transaction(() => {
        recordActivity(
          db.sql,
          owner,
          "owner",
          { ...accepted, call: "rollback" },
          "rollback",
        );
        throw Error("rollback");
      }),
    ).toThrow();
    expect(
      leaderboard(db.sql, "owner", "", 0, "xp").items.reduce(
        (n, x) => n + x.calls,
        0,
      ),
    ).toBe(1);
  } finally {
    db.close();
  }
});
