import { fixturePurchase } from "./fixtures/germany/facilities";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { io as client, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { Auth, hash } from "../server/auth";
import { Database, DATABASE_VERSION } from "../server/database";
import { Game } from "../server/game";
import { generate } from "../src/engine";
import { sites as nodes } from "./fixtures/germany/locations";
import { startServer } from "./fixtures/germany/server";
import { fundTestBudget } from "./money-fixture";

import { mt } from "../src/catalog";
import { euro } from "../src/money";
import { expectCoopPaymentOnce } from "./coop-payment-fixture";
import { emsProfile, established } from "./e2e/fixtures";
const password = "Isolated-test-password-284!";
const running: ReturnType<typeof startServer>[] = [];
afterEach(async () => {
  for (const s of running.splice(0)) await s.close();
});
async function server() {
  const base = await mkdtemp(resolve(tmpdir(), "lv-server-test-")),
    dir = resolve(base, "new-data");
  const port = 22000 + Math.floor(Math.random() * 15000),
    origin = `http://127.0.0.1:${port}`;
  const app = startServer(
    {
      host: "127.0.0.1",
      port,
      publicUrl: origin,
      dataDir: dir,
      secure: false,
      trustedProxies: [],
    },
    resolve("dist/client"),
  );
  running.push(app);
  await app.listen();
  const a = await app.auth.create("anna", password, "Anna", "Nord");
  const b = await app.auth.create("ben", password, "Ben", "Süd");
  async function request(
    path: string,
    data?: unknown,
    cookie = "",
    csrf = "",
    originHeader = origin,
  ) {
    return fetch(origin + "/api/" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        origin: originHeader,
        cookie,
        "X-CSRF-Token": csrf,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  }
  async function login(username = "anna") {
    const r = await request("login", { username, password });
    expect(r.status).toBe(200);
    const cookie = r.headers.get("set-cookie")!.split(";")[0];
    const me = await (await request("me", undefined, cookie)).json();
    return { cookie, csrf: me.csrf, save: me.save };
  }
  return { app, dir, origin, a, b, request, login };
}
describe("Autoritativer Server", () => {
  it("verbirgt neue Einsätze und Wachen vor unabhängigen Leitstellen", async () => {
    const { app, a, b } = await server();
    const s = established("Anna");
    s.player.id = a;
    for (const o of [...s.vehicles, ...s.buildings]) o.owner = a;
    app.db.save(a, s);
    app.game.step(5);
    expect(app.db.all().get(a)!.missions).toHaveLength(0);
    for (let i = 0; i < 20; i++) app.game.step(60);
    const m = app.db.all().get(a)!.missions[0];
    expect(m.shared).toBe(false);
    expect(m.control!.calls).toHaveLength(1);
    expect(app.game.view(b, new Set()).network.friends).toEqual([]);
    expect(() =>
      app.game.command(a, {
        id: crypto.randomUUID(),
        action: { type: "share", id: m.id },
      }),
    ).toThrow("Unterstützungsanfrage");
  });
  it("liefert Client und API auf einem Port, ohne private Caches oder externe Ressourcen", async () => {
    const { origin, request } = await server();
    const r = await fetch(origin),
      html = await r.text();
    expect(r.status).toBe(200);
    expect(html).toContain("/assets/");
    expect(html).not.toMatch(/https?:\/\//);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect((await request("me")).status).toBe(401);
    for (const path of [
      "/.env",
      "/game.sqlite",
      "/admin-konto.json",
      "/ADMIN-ZUGANG.txt",
    ])
      expect((await fetch(origin + path)).status).toBe(404);
  });
  it("speichert gesalzene Passwort-Hashes und nur gehashte widerrufbare Sitzungstoken", async () => {
    const { app, login, request } = await server(),
      { cookie, csrf } = await login();
    const rows = app.db.sql.prepare("SELECT password FROM users").all();
    expect(rows[0].password).not.toBe(rows[1].password);
    expect(rows[0].password).toMatch(/^scrypt-65536-8-1:/);
    expect(app.db.sql.prepare("SELECT hash FROM sessions").get()!.hash).toBe(
      hash(cookie.split("=")[1]),
    );
    expect(cookie).not.toContain(password);
    expect((await request("logout", {}, cookie, csrf)).status).toBe(200);
    expect((await request("me", undefined, cookie)).status).toBe(401);
  });
  it("registriert ohne Einladung nur Spieler und begrenzt wiederholte Anmeldung", async () => {
    const { app, request } = await server();
    const data = {
      username: "newuser",
      password,
      name: "Neu",
      station: "West",
    };
    const registered = await request("register", data);
    expect(registered.status).toBe(200);
    const cookie = registered.headers.get("set-cookie")!.split(";")[0];
    const me = await (await request("me", undefined, cookie)).json();
    expect(me.user.role).toBe("player");
    expect(me.save.money).toBe(euro(1400000));
    expect((await request("register", data)).status).toBe(409);
    for (let i = 0; i < 10; i++)
      await request("login", { username: "wronguser", password });
    expect(
      (await request("login", { username: "wronguser", password })).status,
    ).toBe(429);
    expect(
      app.db.sql
        .prepare("SELECT count FROM limits WHERE key=?")
        .get(hash("auth-user:wronguser"))!.count,
    ).toBe(10);
  });
  it("verwirft fremde Origins, fehlenden CSRF-Token und frei vorgegebene Kontostände", async () => {
    const { login, request } = await server();
    expect(
      (
        await request(
          "login",
          { username: "anna", password },
          "",
          "",
          "https://evil.invalid",
        )
      ).status,
    ).toBe(403);
    const { cookie, csrf } = await login(),
      action = { id: crypto.randomUUID(), action: { type: "relief" } };
    expect((await request("action", action, cookie)).status).toBe(403);
    expect(
      (
        await request(
          "action",
          { ...action, action: { type: "relief", money: 1e9 } },
          cookie,
          csrf,
        )
      ).status,
    ).toBe(400);
    expect(
      (await request("action", { save: { money: 1e9 } }, cookie, csrf)).status,
    ).toBe(400);
  });
  it("verhindert wiederholten Kauf, Fremdbesitz und ID-Wiederverwendung mit anderer Bedeutung", async () => {
    const { login, request } = await server(),
      a = await login(),
      b = await login("ben");
    const id = crypto.randomUUID(),
      action = fixturePurchase("fire", nodes[0]);
    for (let i = 0; i < 2; i++)
      expect(
        (await request("action", { id, action }, a.cookie, a.csrf)).status,
      ).toBe(200);
    const current = await (await request("me", undefined, a.cookie)).json();
    expect(current.save.money).toBe(euro(750000));
    expect(current.save.buildings).toHaveLength(1);
    expect(
      (
        await request(
          "action",
          {
            id: crypto.randomUUID(),
            action: {
              type: "rename",
              id: current.save.buildings[0].id,
              name: "Übernommen",
            },
          },
          b.cookie,
          b.csrf,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "action",
          { id, action: { type: "relief" } },
          a.cookie,
          a.csrf,
        )
      ).status,
    ).toBe(400);
    expect(
      (await (await request("me", undefined, b.cookie)).json()).save.money,
    ).toBe(euro(1400000));
  });
  it("nutzt echte authentifizierte Socket.IO-Verbindungen und widerruft offene Kanäle", async () => {
    const { app, origin, login, request } = await server(),
      a = await login();
    const socket: Socket = client(origin, {
      extraHeaders: { origin, cookie: a.cookie },
      auth: { csrf: a.csrf },
      transports: ["websocket"],
      autoConnect: false,
    });
    await new Promise<void>((done, reject) => {
      socket.once("connect", done);
      socket.once("connect_error", reject);
      socket.connect();
    });
    const message = new Promise<{ text: string }>((done) =>
      socket.once("chat", done),
    );
    socket.emit("chat", "<script>text only</script>");
    expect((await message).text).toBe("<script>text only</script>");
    const disconnected = new Promise<void>((done) =>
      socket.once("disconnect", () => done()),
    );
    await request("logout-all", {}, a.cookie, a.csrf);
    await disconnected;
    expect(app.io.sockets.sockets.size).toBe(0);
    socket.close();
    const bad = client(origin, {
      extraHeaders: { origin: "https://evil.invalid", cookie: a.cookie },
      auth: { csrf: a.csrf },
      transports: ["websocket"],
      reconnection: false,
      autoConnect: false,
    });
    await new Promise<void>((done) => {
      bad.once("connect_error", () => done());
      bad.connect();
    });
    expect(bad.connected).toBe(false);
    bad.close();
  });
  it("behält Besitz, Aktionsbelege und laufende Zeit über Datenbankneustart und konsistente Sicherung", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "lv-restart-"));
    let db = new Database(dir);
    const id = await new Auth(db).create("anna", password, "Anna", "Nord"),
      game = new Game(db);
    const command = {
      id: crypto.randomUUID(),
      action: fixturePurchase("fire", nodes[0]),
    };
    game.command(id, command);
    game.step(900);
    expect(db.all().get(id)!.money).toBe(euro(780000));
    const file = await db.backup();
    expect((await readFile(file)).subarray(0, 15).toString()).toBe(
      "SQLite format 3",
    );
    db.close();
    db = new Database(dir);
    new Game(db).command(id, command);
    new Game(db).step(125);
    expect(db.all().get(id)!.money).toBe(euro(780000));
    expect(db.sql.prepare("PRAGMA user_version").get()!.user_version).toBe(
      DATABASE_VERSION,
    );
    db.close();
  });
  it("vollendet gemeinsamen Patiententransport ohne Browser und zahlt beide Konten genau einmal", async () => {
    const { app, a, b } = await server();
    for (const [id, name] of [
      [a, "Anna"],
      [b, "Ben"],
    ]) {
      const s = emsProfile(name),
        old = s.player.id;
      s.player.id = id;
      for (const o of [...s.buildings, ...s.vehicles])
        if (o.owner === old) o.owner = id;
      s.missions[0].template = "sick";
      s.missions[0].pos = nodes[2];
      // Cross a real funding boundary during the transport, independent of
      // random vehicle delays and the wall-clock phase of this fixture.
      fundTestBudget(s, 1000000);
      s.economy!.fundingNextAt = s.time + 1;
      app.db.save(id, s);
    }
    const s = app.db.all().get(a)!,
      helper = app.db.all().get(b)!,
      mission = s.missions[0],
      vehicle = helper.vehicles.find((v) => v.type === "rtw")!;
    app.game.command(a, {
      id: crypto.randomUUID(),
      action: { type: "share", id: mission.id },
    });
    const support = {
      id: crypto.randomUUID(),
      action: {
        type: "support",
        peer: a,
        mission: mission.id,
        round: mission.round,
        vehicle: vehicle.id,
      },
    };
    app.game.command(b, support);
    app.game.command(b, support);
    expect(() =>
      app.game.command(b, { ...support, id: crypto.randomUUID() }),
    ).toThrow();
    for (
      let i = 0;
      i < 400 &&
      !app.db
        .all()
        .get(a)!
        .archive.some((m) => m.round === mission.round);
      i++
    )
      app.game.step(5);
    const endA = app.db.all().get(a)!;
    expect(endA.archive.some((m) => m.round === mission.round)).toBe(true);
    expectCoopPaymentOnce(
      app.db,
      [s, helper],
      mission.round,
      Math.floor(mt("sick").reward / 2),
    );
    app.game.step(7200);
    expect(
      app.db
        .all()
        .get(b)!
        .vehicles.find((v) => v.id === vehicle.id)!.status,
    ).toBe("ready");
    app.game.command(b, support);
    expectCoopPaymentOnce(
      app.db,
      [s, helper],
      mission.round,
      Math.floor(mt("sick").reward / 2),
    );
  });
  it("ruft fremde Kräfte nach explizitem Kooperationsabbruch zurück und schützt Speicherfehler atomar", async () => {
    const { app, a, b } = await server();
    for (const [id, name] of [
      [a, "Anna"],
      [b, "Ben"],
    ]) {
      const s = established(name);
      s.player.id = id;
      for (const o of [...s.buildings, ...s.vehicles]) o.owner = id;
      generate(s); // Existing legacy cooperation remains cancellable after the update.
      app.db.save(id, s);
    }
    app.game.step(5);
    const owner = app.db.all().get(a)!,
      helper = app.db.all().get(b)!,
      m = owner.missions[0],
      v = helper.vehicles[0];
    app.game.command(a, {
      id: crypto.randomUUID(),
      action: { type: "share", id: m.id },
    });
    app.game.command(b, {
      id: crypto.randomUUID(),
      action: {
        type: "support",
        peer: a,
        mission: m.id,
        round: m.round,
        vehicle: v.id,
      },
    });
    app.game.command(a, {
      id: crypto.randomUUID(),
      action: { type: "unshare", id: m.id },
    });
    app.game.step(200);
    expect(app.db.all().get(b)!.vehicles[0].status).toBe("ready");
    const money = app.db.all().get(a)!.money;
    app.db.sql.exec("PRAGMA query_only=ON");
    expect(() =>
      app.game.command(a, {
        id: crypto.randomUUID(),
        action: fixturePurchase("fire", nodes[2]),
      }),
    ).toThrow();
    app.db.sql.exec("PRAGMA query_only=OFF");
    expect(app.db.all().get(a)!.money).toBe(money);
  });
});
