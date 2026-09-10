import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { Auth } from "../server/auth";
import { Database } from "../server/database";
import { startServer } from "./fixtures/germany/server";
it("erhält die alte Datenbank bei abgebrochener Migration und verweigert neuere Schemata", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-migration-")),
    path = resolve(dir, "game.sqlite");
  let original = new DatabaseSync(path);
  original.exec(
    "CREATE TABLE users(value TEXT); INSERT INTO users VALUES ('unveraendert');",
  );
  original.close();
  expect(() => new Database(dir)).toThrow();
  original = new DatabaseSync(path);
  expect(original.prepare("SELECT value FROM users").get()!.value).toBe(
    "unveraendert",
  );
  expect(original.prepare("PRAGMA user_version").get()!.user_version).toBe(0);
  original.exec("PRAGMA user_version=99");
  original.close();
  expect((await readdir(dir)).some((f) => f.startsWith("pre-migration-"))).toBe(
    true,
  );
  const futureBytes = await readFile(path);
  const futureFiles = await readdir(dir);
  expect(() => new Database(dir)).toThrow("neuer");
  expect(await readFile(path)).toEqual(futureBytes);
  expect(await readdir(dir)).toEqual(futureFiles);
  original = new DatabaseSync(path);
  expect(original.prepare("PRAGMA user_version").get()!.user_version).toBe(99);
  original.close();
});
it("behält Anmelde- und Registrierungsratenlimits nach echtem SQLite-Neuöffnen", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-limit-"));
  let db = new Database(dir);
  const auth = new Auth(db);
  auth.limit("persistent-user", 1);
  auth.limit("registration-ip:test", 1, 3600000);
  auth.limit("registration-global", 1, 600000);
  db.close();
  db = new Database(dir);
  for (const key of [
    "persistent-user",
    "registration-ip:test",
    "registration-global",
  ])
    expect(() => new Auth(db).limit(key, 1)).toThrow("Zu viele");
  db.close();
});
it("setzt HTTPS-Sicherheitscookies, ignoriert gefälschte Proxyheader und verhindert zweite Instanz", async () => {
  const dataDir = await mkdtemp(resolve(tmpdir(), "lv-secure-"));
  const port = 20000 + Math.floor(Math.random() * 10000),
    origin = `https://127.0.0.1:${port}`;
  const cfg = {
    host: "127.0.0.1",
    port,
    publicUrl: origin,
    dataDir,
    secure: true,
    trustedProxies: [],
  };
  const app = startServer(cfg, resolve("dist/client"));
  await app.listen();
  try {
    await app.auth.create(
      "player",
      "Only-a-secure-test-password!",
      "Spieler",
      "Nord",
    );
    expect(() => startServer(cfg)).toThrow("gesperrt");
    const r = await fetch(`http://127.0.0.1:${port}/api/login`, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "x-forwarded-proto": "http",
        "x-real-ip": "1.2.3.4",
      },
      body: JSON.stringify({
        username: "player",
        password: "Only-a-secure-test-password!",
      }),
    });
    expect(r.status).toBe(200);
    for (const value of ["Secure", "HttpOnly", "SameSite=Strict"])
      expect(r.headers.get("set-cookie")).toContain(value);
    expect(r.headers.get("strict-transport-security")).toContain("31536000");
  } finally {
    await app.close();
  }
});
