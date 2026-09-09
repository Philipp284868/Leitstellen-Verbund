import { attachDynamics } from "../src/simulation/dynamics";
import { updateWeather } from "../src/simulation/weather";
import { legacyIncident } from "../src/simulation/incidents";
import { syncFms } from "../src/simulation/fms";
import { it, expect, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../server/database";
import { Auth, passwordHash, verifyPassword } from "../server/auth";
import { startServer } from "../server/index";
import { established } from "./e2e/fixtures";
const password = "Normal-player-test-password!";
const running: ReturnType<typeof startServer>[] = [];
afterEach(async () => {
  for (const app of running.splice(0)) await app.close();
});
async function service() {
  const dataDir = await mkdtemp(resolve(tmpdir(), "lv-public-")),
    port = 23000 + Math.floor(Math.random() * 10000);
  const origin = `http://127.0.0.1:${port}`;
  const app = startServer({
    dataDir,
    port,
    publicUrl: origin,
    host: "127.0.0.1",
    secure: false,
    trustedProxies: [],
  });
  running.push(app);
  await app.listen();
  const post = (
    path: string,
    data: unknown,
    extra: Record<string, string> = {},
  ) =>
    fetch(origin + "/api/" + path, {
      method: "POST",
      headers: { origin, "content-type": "application/json", ...extra },
      body: JSON.stringify(data),
    });
  return { app, origin, post };
}
const registration = (username = "spielerin") => ({
  username,
  password,
  name: "Spielerin",
  station: "Zentrale",
});
async function legacy() {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-legacy-role-")),
    path = resolve(dir, "game.sqlite");
  const original = new DatabaseSync(path);
  original.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','player')), created INTEGER NOT NULL);
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
  const encoded = await passwordHash(password),
    save = established("Philipp"),
    id = save.player.id,
    text = JSON.stringify(save);
  original
    .prepare("INSERT INTO users VALUES (?,?,?,?,?)")
    .run(id, "philipp", encoded, "admin", 123);
  original
    .prepare("INSERT INTO users VALUES (?,?,?,?,?)")
    .run("normal-id", "normal", encoded, "player", 124);
  original.prepare("INSERT INTO saves VALUES (?,?)").run(id, text);
  original
    .prepare("INSERT INTO sessions VALUES (?,?,?,?)")
    .run("admin-session", id, "csrf", Date.now() + 86400000);
  original
    .prepare("INSERT INTO sessions VALUES (?,?,?,?)")
    .run("normal-session", "normal-id", "csrf", Date.now() + 86400000);
  original
    .prepare("INSERT INTO actions VALUES (?,?,?)")
    .run(id, "existing-action", "fingerprint");
  original
    .prepare("INSERT INTO rewards VALUES (?,?,?)")
    .run("existing-reward", id, 7500);
  original.exec(
    "INSERT INTO invites VALUES ('old-invite',9999999999999,0); INSERT INTO meta VALUES ('amp-admin-file-v1','old-bootstrap-state');",
  );
  original.close();
  return { dir, path, id, encoded, text };
}
it("startet ohne automatisch angelegtes Konto; auch der erste Registrierte wird nur Spieler", async () => {
  const { app, origin, post } = await service();
  expect(app.db.sql.prepare("SELECT id FROM users").all()).toHaveLength(0);
  const r = await post("register", registration());
  expect(r.status).toBe(200);
  const cookie = r.headers.get("set-cookie")!.split(";")[0];
  const me = await (
    await fetch(origin + "/api/me", { headers: { cookie } })
  ).json();
  expect(me.user.role).toBe("player");
  expect(me.save.money).toBe(140000000);
  expect(
    app.db.sql
      .prepare("SELECT role FROM users")
      .all()
      .map((row) => row.role),
  ).toEqual(["player"]);
});
it("weist Rollen, Adminflags und Einladungsschlüssel in Registrierungen zurück", async () => {
  const { app, post } = await service();
  for (const extra of [
    { role: "admin" },
    { admin: true },
    { firstAdmin: true },
    { invite: "x".repeat(43) },
  ]) {
    expect(
      (await post("register", { ...registration(), ...extra })).status,
    ).toBe(400);
  }
  expect(app.db.sql.prepare("SELECT id FROM users").all()).toHaveLength(0);
});
it("weist fehlende Namen, ungültige Benutzernamen und kurze Passwörter zurück", async () => {
  const { post } = await service();
  for (const extra of [
    { name: " " },
    { station: " " },
    { username: "x" },
    { password: "kurz" },
  ])
    expect(
      (await post("register", { ...registration(), ...extra })).status,
    ).toBe(400);
});
it("verhindert doppelte Konten auch bei paralleler Registrierung und unterschiedlicher Großschreibung", async () => {
  const { app } = await service();
  const results = await Promise.allSettled([
    app.auth.create("Duplikat", password, "Erste", "Nord"),
    app.auth.create("duplikat", password, "Zweite", "Süd"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    app.db.sql
      .prepare("SELECT username FROM users")
      .all()
      .map((r) => r.username),
  ).toEqual(["duplikat"]);
  expect(app.db.all().size).toBe(1);
});
it("lässt Anmeldung ohne Sitzung nicht auf private Spielstände zugreifen", async () => {
  const { origin } = await service();
  expect((await fetch(origin + "/api/me")).status).toBe(401);
});
it("entfernt alle früheren Admin-Endpunkte statt ihre Rechte an normale Spieler weiterzugeben", async () => {
  const { origin, post } = await service();
  const r = await post("register", registration()),
    cookie = r.headers.get("set-cookie")!.split(";")[0];
  const me = await (
    await fetch(origin + "/api/me", { headers: { cookie } })
  ).json();
  for (const path of ["admin/invite", "admin/backup", "admin/reset"]) {
    expect(
      (await post(path, {}, { cookie, "x-csrf-token": me.csrf })).status,
    ).toBe(404);
    expect((await post(path, {})).status).toBe(404);
  }
});
it("begrenzt offene Registrierungen nach Quelle und insgesamt; gefälschte Header ändern die Quelle nicht", async () => {
  const { app, post } = await service();
  for (let i = 0; i < 20; i++)
    app.auth.limit("registration-ip:127.0.0.1", 20, 3600000);
  expect(
    (await post("register", registration(), { "x-real-ip": "8.8.8.8" })).status,
  ).toBe(429);
  app.db.sql.exec("DELETE FROM limits");
  for (let i = 0; i < 100; i++)
    app.auth.limit("registration-global", 100, 600000);
  expect((await post("register", registration())).status).toBe(429);
  expect(app.db.sql.prepare("SELECT id FROM users").all()).toHaveLength(0);
});
it("beachtet die erlaubte Origin auch bei öffentlicher Registrierung", async () => {
  const { post } = await service();
  expect(
    (
      await post("register", registration(), {
        origin: "https://other.invalid",
      })
    ).status,
  ).toBe(403);
});
it("wandelt bestehende Administratoren mit unveränderten IDs, Passwort-Hashes und Spielständen um", async () => {
  const { dir, id, encoded, text } = await legacy();
  let db = new Database(dir);
  expect(
    db.sql
      .prepare("SELECT role,password,created FROM users WHERE id=?")
      .get(id),
  ).toEqual({ role: "player", password: encoded, created: 123 });
  expect(await verifyPassword(password, encoded)).toBe(true);
  const expected = JSON.parse(text);
  for (const m of [...expected.missions, ...expected.archive])
    legacyIncident(expected, m);
  syncFms(expected);
  updateWeather(expected);
  for (const m of [...expected.missions, ...expected.archive])
    attachDynamics(expected, m, false);
  expect(
    JSON.parse(
      String(
        db.sql.prepare("SELECT data FROM saves WHERE user_id=?").get(id)!.data,
      ),
    ),
  ).toEqual(expected);
  expect(db.sql.prepare("SELECT id FROM actions").get()!.id).toBe(
    "existing-action",
  );
  expect(db.sql.prepare("SELECT amount FROM rewards").get()!.amount).toBe(7500);
  expect(
    db.sql
      .prepare("SELECT hash FROM sessions")
      .all()
      .map((r) => r.hash),
  ).toEqual(["normal-session"]);
  expect(
    db.sql.prepare("SELECT name FROM sqlite_master WHERE name='invites'").get(),
  ).toBeUndefined();
  expect(
    db.sql
      .prepare("SELECT value FROM meta WHERE key='amp-admin-file-v1'")
      .get(),
  ).toBeUndefined();
  expect(db.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  const session = new Auth(db).issue(id);
  db.close();
  db = new Database(dir);
  expect(new Auth(db).session(`lv_session=${session.value}`)?.role).toBe(
    "player",
  );
  expect(
    JSON.parse(
      String(
        db.sql.prepare("SELECT data FROM saves WHERE user_id=?").get(id)!.data,
      ),
    ),
  ).toEqual(expected);
  db.close();
  const copies = (await readdir(dir)).filter((p) =>
    p.startsWith("pre-migration-v2-"),
  );
  expect(copies).toHaveLength(1);
  const backup = new DatabaseSync(resolve(dir, copies[0]), { readOnly: true });
  expect(backup.prepare("PRAGMA integrity_check").get()!.integrity_check).toBe(
    "ok",
  );
  expect(
    backup.prepare("SELECT role FROM users WHERE id=?").get(id)!.role,
  ).toBe("admin");
  expect(
    backup.prepare("SELECT data FROM saves WHERE user_id=?").get(id)!.data,
  ).toBe(text);
  backup.close();
});
it("blockiert das Erstellen und Wiederhochsetzen von Adminrollen auf Datenbankebene", async () => {
  const { dir, id } = await legacy(),
    db = new Database(dir);
  expect(() =>
    db.sql.prepare("UPDATE users SET role='admin' WHERE id=?").run(id),
  ).toThrow();
  expect(() =>
    db.sql
      .prepare("INSERT INTO users VALUES (?,?,?,?,?)")
      .run("attack", "attack", "hash", "admin", 0),
  ).toThrow();
  expect(
    db.sql.prepare("SELECT role FROM users WHERE id=?").get(id)!.role,
  ).toBe("player");
  db.close();
});
it("rollt eine gescheiterte Rollenumstellung samt Einladungsentfernung vollständig zurück", async () => {
  const { dir, path, id, text } = await legacy();
  let original = new DatabaseSync(path);
  original.exec("DROP TABLE meta");
  original.close();
  expect(() => new Database(dir)).toThrow();
  original = new DatabaseSync(path);
  expect(
    original.prepare("SELECT role FROM users WHERE id=?").get(id)!.role,
  ).toBe("admin");
  expect(
    original.prepare("SELECT data FROM saves WHERE user_id=?").get(id)!.data,
  ).toBe(text);
  expect(original.prepare("SELECT hash FROM invites").get()!.hash).toBe(
    "old-invite",
  );
  expect(original.prepare("PRAGMA user_version").get()!.user_version).toBe(1);
  original.close();
});
