import { it, expect } from "vitest";
import { Database } from "../server/database";
import { fresh } from "../src/model";
import { eventsPage } from "../server/game-events";
import { bookMoney } from "../src/economy/ledger";
import { xpForLevel } from "../src/progression";
it("speichert Ereignisse idempotent, paginiert privat und übersteht Rollback", () => {
  const db = new Database("", { memory: true });
  try {
    const s = fresh("Protokoll", "Mitte", 1000);
    s.player.id = "events";
    db.sql
      .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
      .run(s.player.id, "events", "unused", "player", 0);
    db.save(s.player.id, s);
    for (let i = 0; i < 130; i++) {
      s.time++;
      bookMoney(s, 100, `Vergütung ${i}`);
      db.save(s.player.id, s);
    }
    s.xp = xpForLevel(2);
    db.save(s.player.id, s);
    db.save(s.player.id, s);
    const first = eventsPage(db.sql, s.player.id);
    expect(first.events).toHaveLength(100);
    expect(first.next).not.toBeNull();
    const older = eventsPage(db.sql, s.player.id, first.next!);
    expect(older.events).toHaveLength(31);
    expect(
      new Set([...first.events, ...older.events].map((e) => e.id)).size,
    ).toBe(131);
    expect(first.events.filter((e) => e.type === "Fortschritt")).toHaveLength(
      1,
    );
    expect(eventsPage(db.sql, "foreign").events).toHaveLength(0);
    bookMoney(s, 100, "Rollback-Beleg");
    expect(() =>
      db.transaction(() => {
        db.save(s.player.id, s);
        throw Error("rollback");
      }),
    ).toThrow("rollback");
    db.save(s.player.id, s);
    expect(
      eventsPage(db.sql, s.player.id).events.some(
        (e) => e.text === "Rollback-Beleg",
      ),
    ).toBe(true);
  } finally {
    db.close();
  }
});
