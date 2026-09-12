import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { Database, DATABASE_VERSION } from "../src/server/database";
import { phaseFixture } from "./dispatch-fixture";

it("sichert DB19 vor der additiven Speichergrenze und erhält Eigentum, Geld, Reisen und historische JSON-Daten", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "lv-overhaul-migration-"));
  let db: Database | undefined;
  try {
    const s = phaseFixture("old-overhaul");
    for (const v of s.vehicles) {
      delete v.equipment;
      delete v.maintenance;
      delete v.supplies;
    }
    const json = JSON.stringify(s);
    db = new Database(dir);
    db.sql
      .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
      .run(s.player.id, "old-overhaul", "unused", "player", 1);
    db.sql.prepare("INSERT INTO saves VALUES(?,?)").run(s.player.id, json);
    db.sql.exec("PRAGMA user_version=19");
    db.close();
    db = new Database(dir);
    expect(db.sql.prepare("PRAGMA user_version").get()!.user_version).toBe(
      DATABASE_VERSION,
    );
    expect(db.sql.prepare("SELECT data FROM saves").get()!.data).toBe(json);
    expect(db.all().get(s.player.id)).toEqual(s);
    const backups = readdirSync(dir).filter((n) =>
      n.startsWith("pre-migration-"),
    );
    expect(backups).toHaveLength(1);
    const backup = new DatabaseSync(resolve(dir, backups[0]), {
      readOnly: true,
    });
    try {
      expect(backup.prepare("PRAGMA user_version").get()!.user_version).toBe(
        19,
      );
      expect(backup.prepare("SELECT data FROM saves").get()!.data).toBe(json);
    } finally {
      backup.close();
    }
    db.close();
    db = new Database(dir);
    expect(
      readdirSync(dir).filter((n) => n.startsWith("pre-migration-")),
    ).toEqual(backups);
    expect(
      db.sql
        .prepare(
          "SELECT COUNT(*) n FROM audit WHERE event LIKE 'simulation-overhaul-v20%'",
        )
        .get()!.n,
    ).toBe(2);
    // One audit from creating the fixture and one from the actual DB19 upgrade.
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
