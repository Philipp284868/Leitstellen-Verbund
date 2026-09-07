import { attachDynamics } from "../src/simulation/dynamics";
import { updateWeather } from "../src/simulation/weather";
import { legacyIncident } from "../src/simulation/incidents";
import { syncFms } from "../src/simulation/fms";
import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { validate, fresh, type Save } from "../src/model";

import type { GameMode } from "../src/mode";
export const DATABASE_VERSION = 9;
export class Database {
  sql: DatabaseSync;
  path: string;
  constructor(public dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.path = resolve(dir, "game.sqlite");
    const existed = existsSync(this.path);
    this.sql = new DatabaseSync(this.path);
    try {
      this.sql.exec(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
      );
      const version = Number(
        this.sql.prepare("PRAGMA user_version").get()!.user_version,
      );
      if (version > DATABASE_VERSION)
        throw Error(
          "Datenbank ist neuer als dieser Server. Kein Downgrade möglich.",
        );
      if (this.sql.prepare("PRAGMA quick_check").get()!.quick_check !== "ok")
        throw Error("SQLite-Integritätsprüfung fehlgeschlagen.");
      // Preserve a full pre-migration copy, including the original map coordinates.
      if (existed && version < DATABASE_VERSION) {
        this.sql
          .prepare("VACUUM INTO ?")
          .run(
            resolve(
              dir,
              `pre-migration-v2-${Date.now()}-${crypto.randomUUID()}.sqlite`,
            ),
          );
      }
      if (version < 1) {
        this.transaction(() => {
          this.sql.exec(`
            CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role='player'), created INTEGER NOT NULL);
            CREATE TABLE saves(user_id TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL);
            CREATE TABLE sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
            CREATE TABLE invites(hash TEXT PRIMARY KEY, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE actions(user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(user_id,id));
            CREATE TABLE rewards(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), amount INTEGER NOT NULL);
            CREATE TABLE limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until_at INTEGER NOT NULL);
            CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE audit(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor TEXT NOT NULL, event TEXT NOT NULL);
            PRAGMA user_version=1;
          `);
        });
      }
      if (version < 2) {
        this.transaction(() => {
          // Revoke former privileged sessions, not the accounts or their game data.
          this.sql.exec(`
            DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role='admin');
            UPDATE users SET role='player' WHERE role='admin';
            DROP TABLE IF EXISTS invites;
            DELETE FROM meta WHERE key='amp-admin-file-v1';
            CREATE TRIGGER player_role_insert BEFORE INSERT ON users
              WHEN NEW.role <> 'player' BEGIN SELECT RAISE(ABORT, 'Nur Spielerkonten erlaubt'); END;
            CREATE TRIGGER player_role_update BEFORE UPDATE OF role ON users
              WHEN NEW.role <> 'player' BEGIN SELECT RAISE(ABORT, 'Nur Spielerkonten erlaubt'); END;
            PRAGMA user_version=2;
          `);
          this.audit("server-migration", "player-only-registration-v2");
          if (this.sql.prepare("PRAGMA foreign_key_check").all().length)
            throw Error("Ungültige SQLite-Kontoreferenzen.");
        });
      }
      if (version < 3)
        this.transaction(() => {
          this.sql.exec(
            "CREATE TABLE solo_saves(user_id TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL); PRAGMA user_version=3;",
          );
          this.audit("server-migration", "separate-solo-worlds-v3");
        });
      if (version < 4)
        this.transaction(() => {
          for (const table of ["saves", "solo_saves"]) {
            for (const row of this.sql
              .prepare(`SELECT user_id,data FROM ${table}`)
              .all()) {
              const raw = JSON.parse(String(row.data));
              const save = validate(raw);
              if (save.player.id !== row.user_id)
                throw Error("Ungültiger Kontobesitz.");
              if (raw.world !== save.world)
                this.sql
                  .prepare(`UPDATE ${table} SET data=? WHERE user_id=?`)
                  .run(JSON.stringify(save), row.user_id);
            }
          }
          this.sql.exec("PRAGMA user_version=4;");
          this.audit("server-migration", "organic-region-v4");
        });
      if (version < 5)
        this.transaction(() => {
          for (const table of ["saves", "solo_saves"])
            for (const row of this.sql
              .prepare(`SELECT user_id,data FROM ${table}`)
              .all()) {
              const save = validate(JSON.parse(String(row.data)));
              if (save.player.id !== row.user_id)
                throw Error("Ungültiger Kontobesitz.");
              this.sql
                .prepare(`UPDATE ${table} SET data=? WHERE user_id=?`)
                .run(JSON.stringify(save), row.user_id);
            }
          this.sql.exec("PRAGMA user_version=5;");
          this.audit("server-migration", "realtime-v5");
        });
      if (version < 6)
        this.transaction(() => {
          this.sql.exec(
            "CREATE TABLE IF NOT EXISTS desk_members(user_id TEXT PRIMARY KEY REFERENCES users(id), owner_id TEXT NOT NULL REFERENCES users(id), CHECK(user_id<>owner_id)); CREATE TABLE IF NOT EXISTS desk_invites(user_id TEXT REFERENCES users(id),owner_id TEXT REFERENCES users(id),PRIMARY KEY(user_id,owner_id),CHECK(user_id<>owner_id));",
          );
          for (const mode of ["multi", "single"] as const) {
            const saves = this.all(mode);
            for (const [id, s] of saves) {
              for (const m of [...s.missions, ...s.archive]) {
                legacyIncident(s, m);
                if (
                  m.phase !== "done" &&
                  m.shared &&
                  ![...saves.values()].some((other) =>
                    other.vehicles.some(
                      (v) => v.mission === `remote:${id}:${m.id}`,
                    ),
                  )
                )
                  m.shared = false;
              }
              syncFms(s);
              for (const [i, old] of s.templates.entries())
                if (
                  old.types.length &&
                  !s.desk.aaos.some((a) => a.id === `legacy-${i}`)
                )
                  s.desk.aaos.push({
                    id: `legacy-${i}`,
                    name: old.name,
                    keyword: old.name,
                    level: 1,
                    org: "Alle",
                    types: old.types,
                    skills: {},
                    priority: "NORMAL",
                    alarm: "dme",
                  });
              this.save(id, s, mode);
            }
          }
          this.sql.exec("PRAGMA user_version=6");
          this.audit("server-migration", "phase-one-v6");
        });
      if (version < 7)
        this.transaction(() => {
          for (const mode of ["multi", "single"] as const)
            for (const [id, s] of this.all(mode)) {
              updateWeather(s);
              for (const m of [...s.missions, ...s.archive])
                attachDynamics(s, m, false);
              this.save(id, s, mode);
            }
          this.sql.exec("PRAGMA user_version=7");
          this.audit("server-migration", "phase-two-v7");
        });
      if (this.sql.prepare("PRAGMA foreign_key_check").all().length)
        throw Error("Ungültige SQLite-Kontoreferenzen.");
      if (
        this.sql
          .prepare("SELECT id FROM users WHERE role <> 'player' LIMIT 1")
          .get()
      )
        throw Error("Unzulässige Kontorolle. Datenbank nicht löschen.");
      if (version < 8)
        this.transaction(() => {
          for (const mode of ["multi", "single"] as const)
            for (const [id, s] of this.all(mode)) this.save(id, s, mode);
          this.sql.exec("PRAGMA user_version=8");
          this.audit("server-migration", "organizations-and-explicit-aid-v8");
        });
      if (version < 9)
        this.transaction(() => {
          for (const mode of ["multi", "single"] as const)
            for (const [id, s] of this.all(mode)) this.save(id, s, mode);
          this.sql.exec("PRAGMA user_version=9");
          this.audit("server-migration", "major-incidents-and-campaigns-v9");
        });
    } catch (e) {
      this.sql.close();
      throw e;
    }
  }
  transaction<T>(fn: () => T): T {
    this.sql.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.sql.exec("COMMIT");
      return result;
    } catch (e) {
      this.sql.exec("ROLLBACK");
      throw e;
    }
  }
  all(mode: GameMode = "multi"): Map<string, Save> {
    return new Map(
      this.sql
        .prepare(
          `SELECT user_id,data FROM ${mode === "single" ? "solo_saves" : "saves"}`,
        )
        .all()
        .map((r) => [String(r.user_id), validate(JSON.parse(String(r.data)))]),
    );
  }
  save(id: string, s: Save, mode: GameMode = "multi") {
    if (id !== s.player.id) throw Error("Kontobesitz stimmt nicht überein.");
    this.sql
      .prepare(
        `INSERT INTO ${mode === "single" ? "solo_saves" : "saves"} VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data`,
      )
      .run(id, JSON.stringify(validate(s)));
  }
  ensureSolo(id: string) {
    if (
      this.sql.prepare("SELECT user_id FROM solo_saves WHERE user_id=?").get(id)
    )
      return;
    const original = this.all().get(id);
    if (!original) throw Error("Konto fehlt.");
    const save = fresh(
      original.player.name,
      original.player.station,
      Date.now() / 1000,
    );
    save.player.id = id;
    this.save(id, save, "single");
  }
  audit(actor: string, event: string) {
    this.sql
      .prepare("INSERT INTO audit(at,actor,event) VALUES (?,?,?)")
      .run(Date.now(), actor, event);
  }
  async backup() {
    const dir = resolve(this.dir, "backups");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const path = resolve(
      dir,
      `game-${Date.now()}-${crypto.randomUUID()}.sqlite`,
    );
    await backup(this.sql, path);
    const check = new DatabaseSync(path, { readOnly: true });
    try {
      if (
        check.prepare("PRAGMA integrity_check").get()!.integrity_check !== "ok"
      )
        throw Error("Sicherung ist nicht konsistent.");
    } finally {
      check.close();
    }
    return path;
  }
  close() {
    this.sql.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    this.sql.close();
  }
}
