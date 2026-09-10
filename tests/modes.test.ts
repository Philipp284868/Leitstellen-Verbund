import { fixturePurchase } from "./fixtures/germany/facilities";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { Auth } from "../server/auth";
import { Database, DATABASE_VERSION } from "../server/database";
import { Game } from "../server/game";
import { publicSave } from "../src/simulation/incidents";
import { environmentAt } from "../src/simulation/weather";
import { established } from "./e2e/fixtures";
import { sites as nodes } from "./fixtures/germany/locations";
import { installLogicGeography } from "./fixtures/germany/logic-provider";
import "./fixtures/germany/session";

import { spawnSync } from "node:child_process";
import { io, type Socket } from "socket.io-client";
import { type Save } from "../src/model";
import { euro } from "../src/money";
import { startServer } from "./fixtures/germany/server";
import { fundTestBudget } from "./money-fixture";
const pass = "Separate-game-worlds-123!";
const command = (action: unknown) => ({ id: crypto.randomUUID(), action });
function owned(s: Save, id: string) {
  s.player.id = id;
  for (const o of [...s.buildings, ...s.vehicles]) o.owner = id;
  s.missions = [];
  s.missionWait = 0;
  return s;
}
async function fixture() {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-modes-"));
  const db = new Database(dir),
    auth = new Auth(db),
    game = new Game(db);
  const a = await auth.create("anna", pass, "Anna", "Nord");
  const b = await auth.create("ben", pass, "Ben", "Süd");
  return { dir, db, game, a, b };
}
it("weist entfernte Modi ab und erhält das inaktive Archiv bytegleich nach Neustart", async () => {
  const { dir, db, game, a, b } = await fixture();
  db.save(a, owned(established("Archiv"), a), "single");
  const archived = db.sql
    .prepare("SELECT data FROM solo_saves WHERE user_id=?")
    .get(a)!.data;
  try {
    const before = db.all().get(a)!;
    for (const value of ["single", "invalid"]) {
      expect(() => game.view(a, new Set(), value as never)).toThrow(
        "Multiplayer",
      );
      expect(() =>
        game.command(
          a,
          command(fixturePurchase("fire", nodes[0])),
          value as never,
        ),
      ).toThrow("Multiplayer");
    }
    expect(db.all().get(a)).toEqual(before);
    const cmd = command(fixturePurchase("fire", nodes[0]));
    game.command(a, cmd);
    game.command(a, cmd);
    expect(db.all().get(a)!.buildings).toHaveLength(1);
    expect(db.all().get(a)!.money).toBe(euro(750000));
    expect(game.view(b, new Set()).network.friends).toEqual([]);
    game.step(10);
    expect(
      db.sql.prepare("SELECT data FROM solo_saves WHERE user_id=?").get(a)!
        .data,
    ).toBe(archived);
    await db.backup();
  } finally {
    db.close();
  }
  const again = new Database(dir);
  try {
    expect(
      again.sql.prepare("SELECT data FROM solo_saves WHERE user_id=?").get(a)!
        .data,
    ).toBe(archived);
  } finally {
    again.close();
  }
});
it("migriert Schema 2 ohne Änderung des bestehenden Multiplayer-Spielstands", async () => {
  const { dir, db, a } = await fixture();
  const original = db.sql
    .prepare("SELECT data FROM saves WHERE user_id=?")
    .get(a)!.data;
  db.sql.exec("DROP TABLE solo_saves; PRAGMA user_version=2;");
  db.close();
  const migrated = new Database(dir);
  try {
    const expected = JSON.parse(String(original));
    expected.environment = environmentAt(expected.time);
    expected.staffing = { version: 1, migratedAt: expected.time };
    expected.radioNetwork = { version: 1, sequence: 0, entries: [] };
    expected.locationReview = {
      version: 1,
      pending: [],
      nextAt: expected.time,
      checked: 0,
    };
    expect(
      JSON.parse(
        String(
          migrated.sql.prepare("SELECT data FROM saves WHERE user_id=?").get(a)!
            .data,
        ),
      ),
    ).toEqual(expected);
    expect(migrated.all("single").size).toBe(0);
    expect(
      migrated.sql.prepare("PRAGMA user_version").get()!.user_version,
    ).toBe(DATABASE_VERSION);
  } finally {
    migrated.close();
  }
});
it("beginnt ruhig mit versetzten Mindestabständen und füllt unbearbeitete Leitstellen nicht weiter", async () => {
  const { db, game, a, b } = await fixture();
  try {
    const first = owned(established("Anna"), a),
      second = owned(established("Ben"), b);
    first.speed = 32;
    second.speed = 1;
    first.seed = 123;
    second.seed = 987;
    db.save(a, first);
    db.save(b, second);
    game.step(1);
    const s = db.all().get(a)!,
      t = db.all().get(b)!;
    expect(s.missions).toHaveLength(0);
    expect(s.missionWait).toBeGreaterThanOrEqual(300);
    expect(s.missionWait).toBeLessThanOrEqual(1200);
    expect(s.missionWait).not.toBe(t.missionWait);
    game.step(30);
    expect(db.all().get(a)!.missions).toHaveLength(0);
    expect(db.all().get(a)!.missionWait).toBe(s.missionWait - 30);
    for (let i = 0; i < 35; i++) {
      const before = db.all().get(a)!.missions.length;
      game.step(30);
      expect(db.all().get(a)!.missions.length - before).toBeLessThanOrEqual(1);
    }
    expect(db.all().get(a)!.missions).toHaveLength(1);
    expect(db.all().get(b)!.missions).toHaveLength(1);
    expect(db.all().get(a)!.missions[0].shared).toBe(false);
    const existing = db.all().get(a)!;
    existing.missions = [];
    existing.missionWait = 0;
    db.save(a, existing);
    game.step(14400);
    expect(db.all().get(a)!.missions).toHaveLength(0);
  } finally {
    db.close();
  }
});
it("Sicherungen enthalten beide Welten und private Spielfinanzen werden nicht geteilt", async () => {
  const { db, game, a, b } = await fixture();
  try {
    db.save(a, owned(established("Archiv"), a), "single");
    db.save(a, owned(established("Anna"), a));
    expect(game.view(b, new Set()).network.friends).toEqual([]);
    const backup = await db.backup();
    expect((await readFile(backup)).length).toBeGreaterThan(0);
  } finally {
    db.close();
  }
});
it("HTTP und Socket weisen alte Einzelspielereinstiege ab; Export und Restore bewahren das Archiv", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-mode-api-")),
    port = 23000 + Math.floor(Math.random() * 9000),
    origin = `http://127.0.0.1:${port}`;
  const app = startServer({
    host: "127.0.0.1",
    port,
    publicUrl: origin,
    dataDir: dir,
    secure: false,
    trustedProxies: [],
  });
  await app.listen();
  const sockets: Socket[] = [];
  let backup = "";
  let user = "";
  try {
    user = await app.auth.create("modeapi", pass, "API", "Test");
    const issued = app.auth.issue(user),
      cookie = `lv_session=${issued.value}`;
    const session = app.auth.session(cookie)!;
    const request = (
      path: string,
      mode: string,
      data?: unknown,
      csrf = session.csrf,
    ) =>
      fetch(`${origin}/api/${path}`, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          cookie,
          origin,
          "X-Game-Mode": mode,
          "X-CSRF-Token": csrf,
          "Content-Type": "application/json",
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
    expect((await request("me", "invalid")).status).toBe(400);
    expect(
      (await request("action", "multi", command({ type: "relief" }), "wrong"))
        .status,
    ).toBe(403);
    for (const path of ["me", "export", "action"])
      expect(
        (
          await request(
            path,
            "single",
            path === "action" ? command({ type: "relief" }) : undefined,
          )
        ).status,
      ).toBe(400);
    expect(app.db.all("single").size).toBe(0);
    const archived = owned(established("Archiv"), user);
    fundTestBudget(archived, 195000);
    app.db.save(user, archived, "single");
    const archive = await (await request("archive-export", "multi")).json();
    expect(archive.source).toBe("retired-single-player");
    expect(archive.save).toEqual(publicSave(archived));
    const other = await app.auth.create(
      "otherarchive",
      pass,
      "Andere",
      "Andere",
    );
    const otherCookie = `lv_session=${app.auth.issue(other).value}`;
    expect(
      (
        await fetch(`${origin}/api/archive-export`, {
          headers: { cookie: otherCookie, origin },
        })
      ).status,
    ).toBe(404);
    const multi = await (await request("export", "multi")).json();
    expect(multi.save.money).toBe(euro(1400000));
    const single = io(origin, {
      autoConnect: false,
      transports: ["websocket"],
      extraHeaders: { cookie, origin },
      auth: { csrf: session.csrf, mode: "single" },
      reconnection: false,
    });
    sockets.push(single);
    const rejected = new Promise<Error>((done) =>
      single.once("connect_error", done),
    );
    single.connect();
    expect((await rejected).message).toContain("Multiplayer");
    const multiSocket = io(origin, {
      autoConnect: false,
      transports: ["websocket"],
      extraHeaders: { cookie, origin },
      auth: { csrf: session.csrf, mode: "multi" },
    });
    sockets.push(multiSocket);
    const ready = new Promise<{ mode: string }>((done) =>
      multiSocket.once("snapshot", done),
    );
    multiSocket.connect();
    expect((await ready).mode).toBe("multi");
    const heard = new Promise<{ text: string }>((done) =>
      multiSocket.once("chat", done),
    );
    multiSocket.emit("chat", "Multiplayer bleibt verbunden");
    expect((await heard).text).toBe("Multiplayer bleibt verbunden");
    backup = await app.db.backup();
  } finally {
    for (const socket of sockets) socket.disconnect();
    await app.close();
  }
  const archiveFile = resolve(dir, "solo-archive.json");
  const exported = spawnSync(
    process.execPath,
    [
      "dist/server/cli.js",
      "archive-export",
      "--username",
      "modeapi",
      "--file",
      archiveFile,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DATA_DIR: dir,
        PUBLIC_URL: origin,
        PORT: String(port),
        HOST: "127.0.0.1",
        ALLOW_HTTP: "true",
        TRUSTED_PROXIES: "",
      },
    },
  );
  expect(exported.status, exported.stderr).toBe(0);
  expect(JSON.parse(await readFile(archiveFile, "utf8"))).toMatchObject({
    source: "retired-single-player",
    save: { money: euro(195000) },
  });
  const result = spawnSync(
    process.execPath,
    ["dist/server/cli.js", "restore", "--file", backup, "--confirm"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DATA_DIR: dir,
        PUBLIC_URL: origin,
        PORT: String(port),
        HOST: "127.0.0.1",
        ALLOW_HTTP: "true",
        TRUSTED_PROXIES: "",
      },
    },
  );
  expect(result.status, result.stderr).toBe(0);
  installLogicGeography();
  const restored = new Database(dir);
  try {
    expect(restored.all("single").get(user)!.money).toBe(euro(195000));
    expect(restored.all().get(user)!.money).toBe(euro(1400000));
    expect(restored.sql.prepare("SELECT * FROM sessions").all()).toHaveLength(
      0,
    );
  } finally {
    restored.close();
  }
}, 30000);
