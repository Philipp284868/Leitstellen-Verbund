import { radioFixture } from "./radio-fixture";
import { projectEvents } from "../src/shared/game-events";
import { publicSave } from "../src/simulation/incidents";
import { it, expect } from "vitest";
import { Database } from "../src/server/database";
import { fresh } from "../src/shared/model";
import { eventsPage, persistGameEvents } from "../src/server/game-events";
import { bookMoney } from "../src/shared/economy/ledger";
import { xpForLevel } from "../src/shared/progression";
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

it("begrenzt alte und neue Ereignisse auf bekannte Einsatzdaten und zeigt private Supportbelege nur dem Verfasser", () => {
  const db = new Database("", { memory: true });
  try {
    for (const id of ["owner", "actor", "foreign"])
      db.sql
        .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
        .run(id, id, "unused", "player", 0);
    const s = radioFixture("owner"),
      m = s.missions[0];
    m.control!.events.push({
      id: "hidden-event",
      at: s.time,
      type: "PATIENT_HIDDEN",
      text: "Geheime Patientenzahl",
      actor: "server",
      vehicle: "",
    });
    m.control!.radio[0].details = "Geheimer Erkundungsinhalt";
    db.save("owner", s);
    const put = db.sql.prepare(
      "INSERT OR REPLACE INTO game_events VALUES(?,?,?,?)",
    );
    const old = {
      id: "hidden-event",
      at: s.time,
      mission: m.id,
      text: "Geheime Patientenzahl",
    };
    put.run("owner", old.id, old.at, JSON.stringify(old));
    put.run(
      "actor",
      "old-desk",
      s.time,
      JSON.stringify({ id: "old-desk", text: "Alte eigene Leitstelle" }),
    );
    put.run(
      "actor",
      "report:mine",
      s.time,
      JSON.stringify({ id: "report:mine", text: "Mein Supportbeleg" }),
    );
    const first = eventsPage(db.sql, "owner", undefined, "actor").events;
    expect(JSON.stringify(first)).not.toMatch(/Geheim|Alte eigene/);
    expect(first.some((e) => e.id === "report:mine")).toBe(true);
    expect(
      eventsPage(db.sql, "owner", undefined, "foreign").events.some(
        (e) => e.id === "report:mine",
      ),
    ).toBe(false);
    const projected = projectEvents(s),
      publicProjected = projectEvents(publicSave(s));
    expect(projected).toEqual(publicProjected);
    const texts = projected
      .filter((e) => e.text.startsWith("FMS "))
      .map((e) => `${e.mission}:${e.at}:${e.sender}:${e.text}`);
    expect(new Set(texts).size).toBe(texts.length);
  } finally {
    db.close();
  }
});

it("schreibt bei mehr als 4000 unveränderten Ereignissen nicht die ganze Historie in jedem Tick neu", () => {
  const db = new Database("", { memory: true });
  try {
    db.sql
      .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
      .run("window", "window", "unused", "player", 0);
    const s = radioFixture("window"),
      base = s.missions[0];
    s.missions = Array.from({ length: 40 }, (_, m) => {
      const v = structuredClone(base);
      v.id = `window-${m}`;
      v.control!.briefed = true;
      v.control!.radio = [];
      v.control!.events = Array.from({ length: 150 }, (_, i) => ({
        id: `event-${m}-${i}`,
        at: s.time + i,
        type: "FMS_CHANGED",
        text: `FMS ${i}`,
        actor: "server",
        vehicle: "",
      }));
      return v;
    });
    const known = new Map<string, string>();
    persistGameEvents(db.sql, s, known);
    const changes = () =>
      Number(db.sql.prepare("SELECT total_changes() n").get()!.n);
    const before = changes();
    persistGameEvents(db.sql, s, known);
    expect(changes() - before).toBe(1); // Only the XP cursor upsert; no event rows rewritten.
    expect(known.size).toBeGreaterThan(6000);
  } finally {
    db.close();
  }
});
