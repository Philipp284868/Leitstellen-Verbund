import "fake-indexeddb/auto";
import Dexie from "dexie";
import { it, expect, afterEach } from "vitest";
import { fresh } from "../src/shared/model";
import { db, persist, read, backups, Database } from "../src/client/storage";
afterEach(async () => {
  await db.saves.clear();
});
it("speichert den gesamten Stand transaktional und liest ihn validiert", async () => {
  const s = fresh("Anna", "Nord", 100);
  await persist(s, true);
  expect((await read())?.data).toEqual(s);
  expect(await backups()).toHaveLength(1);
});
it("lässt einen gültigen Stand bei abgelehnener Speicherung unverändert", async () => {
  const s = fresh("Anna", "Nord", 100);
  await persist(s);
  const broken = structuredClone(s);
  broken.money = -1;
  await expect(persist(broken)).rejects.toThrow();
  expect((await read())?.data.money).toBe(140000000);
});
it("verwendet Schema 2 beim Anlegen einer neuen Datenbank", async () => {
  await db.open();
  expect(db.verno).toBe(2);
});
it("migriert Schema 1 transaktional und ergänzt fehlende Kooperationsfelder", async () => {
  const name = "leitstellen-verbund-migration-test";
  const old = new Dexie(name);
  old.version(1).stores({ saves: "id,at" });
  await old.table("saves").put({
    id: "current",
    at: 100,
    data: {
      ...fresh("Anna", "Nord", 100),
      contributions: undefined,
      transfers: undefined,
    },
  });
  old.close();
  const upgraded = new Database(name);
  await upgraded.open();
  expect(upgraded.verno).toBe(2);
  expect((await upgraded.saves.get("current"))?.data.contributions).toEqual([]);
  await upgraded.delete();
});
it("bricht eine ungültige Migration ohne Überschreiben des alten Stands ab", async () => {
  const name = "leitstellen-verbund-migration-invalid";
  const old = new Dexie(name);
  old.version(1).stores({ saves: "id,at" });
  await old.table("saves").put({
    id: "current",
    at: 100,
    data: { ...fresh("Anna", "Nord", 100), money: -1 },
  });
  old.close();
  const upgraded = new Database(name);
  await expect(upgraded.open()).rejects.toThrow();
  upgraded.close();
  await old.open();
  expect((await old.table("saves").get("current")).data.money).toBe(-1);
  expect(old.verno).toBe(1);
  await old.delete();
});
it("behält genau fünf rotierende Sicherungen und verhindert Zeitstempel-Kollisionen", async () => {
  const s = fresh("Anna", "Nord", 100);
  for (let i = 0; i < 7; i++) {
    s.xp = i;
    await persist(s, true);
  }
  const rows = await backups();
  expect(rows).toHaveLength(5);
  expect(new Set(rows.map((r) => r.id)).size).toBe(5);
});
