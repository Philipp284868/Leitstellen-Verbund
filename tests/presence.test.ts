import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Database } from "../src/server/database";
import {
  WorldPresence,
  readPublicPresence,
  PRESENCE_GRACE_MS,
} from "../src/server/presence";
import {
  PresenceDecoder,
  groupPresence,
  PRESENCE_CHUNK,
  type PublicPlayer,
} from "../src/shared/presence";

const valid = () => true;
const player = (id: string): PublicPlayer => ({
  id,
  name: `Spieler ${id}`,
  deskId: id,
  deskName: `Leitstelle ${id}`,
  status: "online",
  location: null,
});
const dirs: string[] = [],
  dbs: Database[] = [];
afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function database() {
  const dir = mkdtempSync(resolve(tmpdir(), "lv-presence-unit-"));
  dirs.push(dir);
  const db = new Database(dir);
  dbs.push(db);
  return db;
}
function insert(db: Database, id: string, buildings: unknown[] = []) {
  db.sql
    .prepare(
      "INSERT INTO users(id,username,password,role,created) VALUES(?,?,?,'player',0)",
    )
    .run(id, id, "unused-password");
  db.sql.prepare("INSERT INTO saves(user_id,data) VALUES(?,?)").run(
    id,
    JSON.stringify({
      player: { id, name: `Name ${id}`, station: `Desk ${id}` },
      money: 999999,
      vehicles: [{ id: "secret-vehicle" }],
      missions: [{ id: "secret-incident" }],
      buildings,
    }),
  );
}
describe("Öffentliche Spielerpräsenz", () => {
  it("dedupliziert Tabs und beendet Präsenz erst nach dem letzten Socket", () => {
    const p = new WorldPresence("test");
    p.connect("tab1", "a", "s1");
    p.connect("tab2", "a", "s2");
    expect(p.actors(0, valid)).toEqual([{ id: "a", status: "online" }]);
    p.disconnect("tab1", 100);
    expect(p.actors(100, valid)).toEqual([{ id: "a", status: "online" }]);
    p.disconnect("tab2", 200);
    expect(p.actors(200, valid)).toEqual([{ id: "a", status: "reconnecting" }]);
    expect(p.actors(200 + PRESENCE_GRACE_MS - 1, valid)).toHaveLength(1);
    expect(p.actors(200 + PRESENCE_GRACE_MS, valid)).toEqual([]);
  });
  it("Reconnect ersetzt Grace ohne Duplikat, erzwungener Logout erhält keine Grace", () => {
    const p = new WorldPresence("test");
    p.connect("tab1", "a", "s1");
    p.disconnect("tab1", 100);
    p.connect("tab2", "a", "s1");
    expect(p.actors(20000, valid)).toEqual([{ id: "a", status: "online" }]);
    p.disconnect("tab2", 20000, true);
    expect(p.actors(20000, valid)).toEqual([]);
  });
  it("Sitzungswiderruf schützt andere gültige Sitzungen und entfernt getrennte widerrufene Konten sofort", () => {
    const p = new WorldPresence("test");
    p.connect("tab1", "a", "s1");
    p.connect("tab2", "a", "s2");
    p.revokeSession("s1");
    expect(p.actors(0, valid)).toHaveLength(1);
    p.disconnect("tab2", 0);
    p.revokeSession("s2");
    expect(p.actors(0, valid)).toEqual([]);
    p.connect("tab3", "a", "s3");
    p.connect("tab4", "a", "s4");
    p.revokeUser("a");
    expect(p.actors(0, valid)).toEqual([]);
  });
  it("prüft abgelaufene aktive und getrennte Sitzungen ohne Simulation", () => {
    const p = new WorldPresence("test");
    p.connect("a", "a", "s1");
    p.connect("b", "b", "s2");
    p.disconnect("b", 0);
    expect(p.actors(1, () => false)).toEqual([]);
  });
  it("projiziert nur erlaubte öffentliche Felder, Mitglieder verwenden den echten gemeinsamen Wachenpunkt", () => {
    const db = database();
    insert(db, "a", [
      {
        id: "private-building",
        owner: "a",
        type: "fire",
        pos: { x: 1200, y: 2400 },
        name: "Nordwache",
        level: 7,
      },
    ]);
    insert(db, "b", [
      {
        owner: "b",
        type: "fire",
        pos: { x: 400, y: 400 },
        name: "Private eigene Wache",
      },
    ]);
    db.sql
      .prepare("INSERT INTO desk_members(user_id,owner_id) VALUES(?,?)")
      .run("b", "a");
    const all = vi.spyOn(db, "all").mockImplementation(() => {
      throw Error("Private Saves dürfen nicht gelesen werden");
    });
    const rows = readPublicPresence(db, [
      { id: "a", status: "online" },
      { id: "b", status: "reconnecting" },
    ]);
    expect(rows).toEqual([
      {
        id: "a",
        name: "Name a",
        deskId: "a",
        deskName: "Desk a",
        status: "online",
        location: { x: 1200, y: 2400, label: "Nordwache", source: "station" },
      },
      {
        id: "b",
        name: "Name b",
        deskId: "a",
        deskName: "Desk a",
        status: "reconnecting",
        location: { x: 1200, y: 2400, label: "Nordwache", source: "station" },
      },
    ]);
    expect(all).not.toHaveBeenCalled();
    expect(groupPresence(rows)).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(
      /private-building|money|vehicles|missions|password|session|999999|Private eigene Wache/,
    );
  });
  it("erfindet bei fehlendem oder ungültigem Standort keinen Punkt und ignoriert fremde oder Klinikgebäude", () => {
    const db = database();
    insert(db, "a");
    insert(db, "b", [
      { owner: "b", type: "hospital", pos: { x: 100, y: 100 }, name: "Klinik" },
      { owner: "fremd", type: "fire", pos: { x: 200, y: 200 }, name: "Fremd" },
    ]);
    insert(db, "c", [
      { owner: "c", type: "fire", pos: { x: -1, y: 0 }, name: "Ungültig" },
    ]);
    expect(
      readPublicPresence(
        db,
        ["a", "b", "c"].map((id) => ({ id, status: "online" })),
      ),
    ).toEqual(
      [player("a"), player("b"), player("c")].map((p) => ({
        ...p,
        name: `Name ${p.id}`,
        deskName: `Desk ${p.id}`,
      })),
    );
  });
  it("liefert auch mehr als 128 Spieler vollständig und atomar, kleine Änderungen werden nur als Delta gesendet", () => {
    const p = new WorldPresence("test"),
      decoder = new PresenceDecoder("test"),
      rows = Array.from({ length: 1000 }, (_, i) => player(String(i)));
    p.reconcile(rows);
    const frames = p.snapshot();
    expect(frames).toHaveLength(8);
    expect(
      frames.every(
        (f) => f.upsert.length <= PRESENCE_CHUNK && f.removed.length === 0,
      ),
    ).toBe(true);
    for (const f of frames.slice(0, -1))
      expect(decoder.decode(f)).toBeUndefined();
    expect(decoder.decode(frames.at(-1)!)!.players).toHaveLength(1000);
    expect(p.reconcile(rows)).toBeUndefined();
    const changed = p.reconcile(
      rows.map((r, i) => (i === 999 ? { ...r, status: "reconnecting" } : r)),
    )!;
    expect(changed).toHaveLength(1);
    expect(changed[0].upsert).toHaveLength(1);
    expect(
      decoder.decode(changed[0])!.players.find((p) => p.id === "999")!.status,
    ).toBe("reconnecting");
    const removed = p.reconcile([])!;
    expect(removed).toHaveLength(8);
    for (const f of removed.slice(0, -1))
      expect(decoder.decode(f)).toBeUndefined();
    expect(decoder.decode(removed.at(-1)!)!.players).toEqual([]);
  });
  it("SQL-Abfrage behält alle Konten über Chunkgrenzen hinweg", () => {
    const db = database();
    db.transaction(() => {
      for (let i = 0; i < 257; i++) insert(db, `u${i}`);
    });
    const rows = readPublicPresence(
      db,
      Array.from({ length: 257 }, (_, i) => ({
        id: `u${i}`,
        status: "online",
      })),
    );
    expect(rows).toHaveLength(257);
    expect(new Set(rows.map((p) => p.id)).size).toBe(257);
  });
  it("lehnt fremde Welten, private Zusatzfelder und unterbrochene Übertragungen ab", () => {
    const p = new WorldPresence("test");
    p.reconcile([player("a")]);
    const frame = p.snapshot()[0];
    expect(() => new PresenceDecoder("other").decode(frame)).toThrow(
      "Spielwelt",
    );
    expect(() =>
      new PresenceDecoder("test").decode({
        ...frame,
        upsert: [{ ...player("a"), money: 3 }],
      }),
    ).toThrow();
    expect(() =>
      new PresenceDecoder("test").decode({ ...frame, total: 2 }),
    ).toThrow("Spielerliste");
    expect(() =>
      new PresenceDecoder("test").decode({ ...frame, part: 2, parts: 2 }),
    ).toThrow("Unvollständige");
    expect(() =>
      new PresenceDecoder("test").decode({
        ...frame,
        upsert: [player("a"), player("a")],
      }),
    ).toThrow("Doppelter");
    expect(() =>
      new PresenceDecoder("test").decode({ ...frame, full: false }),
    ).toThrow("neu geladen");
  });
  it("Neustart und Resync ersetzen den vollständigen Zustand; alte Deltas überschreiben ihn nicht", () => {
    const p = new WorldPresence("test"),
      decoder = new PresenceDecoder("test");
    p.reconcile([player("a")]);
    const initial = p.snapshot()[0];
    decoder.decode(initial);
    const delta = p.reconcile([player("b")])![0];
    expect(decoder.decode(delta)!.players[0].id).toBe("b");
    expect(decoder.decode(initial)).toBeUndefined();
    expect(decoder.decode(delta)).toBeUndefined();
    const restarted = new WorldPresence("test");
    restarted.reconcile([player("c")]);
    expect(
      decoder.decode(restarted.snapshot()[0])!.players.map((p) => p.id),
    ).toEqual(["c"]);
  });
});
