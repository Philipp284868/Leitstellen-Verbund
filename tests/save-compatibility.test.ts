import { it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Database } from "../server/database";
import { validate } from "../src/model";
import {
  exportRetiredDatabase,
  RETIRED_FORMAT,
} from "../server/compatibility/retired-database";

it.each(RETIRED_FORMAT.worlds)(
  "bewahrt %s mit Konten, Vermögen, Archiv und aktiven Aufgaben ohne geografische Umdeutung",
  async (world) => {
    const dir = await mkdtemp(resolve(tmpdir(), "lv-retired-data-"));
    try {
      const path = resolve(dir, "game.sqlite"),
        sql = new DatabaseSync(path);
      const original = {
        world,
        player: { id: "owner", name: "Anonymisiert" },
        money: 5432100,
        xp: 1700,
        buildings: [{ id: "station", pos: { x: 60, y: 65 }, owner: "owner" }],
        vehicles: [
          {
            id: "vehicle",
            mission: "incident",
            path: [
              { x: 60, y: 65 },
              { x: 1115, y: 490 },
            ],
            depart: 900,
            arrive: 1200,
            status: "return",
          },
        ],
        archive: [{ id: "completed", payment: 123 }],
        missions: [{ id: "incident", progress: 40 }],
        receipts: ["paid-once"],
      };
      const raw = JSON.stringify(original);
      sql.exec(
        "CREATE TABLE users(id TEXT,username TEXT,password TEXT); CREATE TABLE saves(user_id TEXT,data TEXT); CREATE TABLE solo_saves(user_id TEXT,data TEXT); CREATE TABLE meta(key TEXT,value TEXT); PRAGMA user_version=3;",
      );
      sql
        .prepare("INSERT INTO users VALUES('owner','fixture','synthetic-hash')")
        .run();
      sql.prepare("INSERT INTO saves VALUES('owner',?)").run(raw);
      sql.prepare("INSERT INTO solo_saves VALUES('owner',?)").run(raw);
      sql.close();
      const bytes = await readFile(path);
      expect(() => validate(original)).toThrow("Weltkonflikt");
      expect(JSON.stringify(original)).toBe(raw);
      expect(() => new Database(dir)).toThrow("Weltkonflikt");
      expect(await readFile(path)).toEqual(bytes);
      const output = resolve(dir, "preserved.sqlite");
      expect((await exportRetiredDatabase(dir, output)).worlds).toEqual([
        world,
      ]);
      const preserved = new DatabaseSync(output, { readOnly: true });
      try {
        expect(preserved.prepare("SELECT * FROM users").get()).toMatchObject({
          id: "owner",
          username: "fixture",
          password: "synthetic-hash",
        });
        for (const table of ["saves", "solo_saves"])
          expect(
            preserved.prepare(`SELECT data FROM ${table}`).get()!.data,
          ).toBe(raw);
        expect(
          preserved.prepare("PRAGMA user_version").get()!.user_version,
        ).toBe(3);
      } finally {
        preserved.close();
      }
      const preservedBytes = await readFile(output);
      await expect(exportRetiredDatabase(dir, output)).rejects.toThrow();
      expect(await readFile(output)).toEqual(preservedBytes);
      expect(await readFile(path)).toEqual(bytes);
      expect(
        (await readdir(dir)).filter((f) => f.startsWith(".retired-export-")),
      ).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
