import { it, expect } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Database, DATABASE_VERSION } from "../server/database";
import { Auth } from "../server/auth";
import { Game } from "../server/game";
import { established } from "./e2e/fixtures";
import { nodes } from "../src/world";
import { type Save } from "../src/model";
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
it("trennt Besitz, Guthaben, Aktionen und Multiplayeransichten auch nach Neustart", async () => {
  const { dir, db, game, a, b } = await fixture();
  try {
    const before = db.all().get(a)!;
    const solo = game.view(a, new Set(), "single");
    expect(solo.network.friends).toEqual([]);
    expect(solo.save.generation).not.toBe(before.generation);
    const cmd = command({ type: "build", kind: "fire", pos: nodes[0] });
    game.command(a, cmd, "single");
    game.command(a, cmd, "single");
    expect(db.all("single").get(a)!.buildings).toHaveLength(1);
    expect(db.all("single").get(a)!.money).toBe(195000);
    expect(db.all().get(a)).toEqual(before);
    expect(
      game.view(b, new Set()).network.friends.find((f) => f.id === a)!
        .buildings,
    ).toHaveLength(0);
    expect(() => game.command(a, cmd, "multi")).toThrow("Aktions-ID");
    expect(() =>
      game.command(a, command({ type: "share", id: "anything" }), "single"),
    ).toThrow("Multiplayer");
    await db.backup();
  } finally {
    db.close();
  }
  const again = new Database(dir);
  try {
    expect(again.all("single").get(a)!.money).toBe(195000);
    expect(again.all().get(a)!.money).toBe(250000);
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
    expect(
      migrated.sql.prepare("SELECT data FROM saves WHERE user_id=?").get(a)!
        .data,
    ).toBe(original);
    expect(migrated.all("single").size).toBe(0);
    expect(
      migrated.sql.prepare("PRAGMA user_version").get()!.user_version,
    ).toBe(DATABASE_VERSION);
  } finally {
    migrated.close();
  }
});
it("erzeugt einzeln mit echten, versetzten Wartezeiten und höchstens zwei Einsätzen", async () => {
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
    expect(s.missions).toHaveLength(1);
    expect(s.missions[0].shared).toBe(true);
    expect(s.missionWait).toBeGreaterThanOrEqual(90);
    expect(s.missionWait).toBeLessThanOrEqual(210);
    expect(s.missionWait).not.toBe(t.missionWait);
    game.step(30);
    expect(db.all().get(a)!.missions).toHaveLength(1);
    expect(db.all().get(a)!.missionWait).toBe(s.missionWait - 30);
    for (let i = 0; i < 20; i++) game.step(30);
    expect(db.all().get(a)!.missions).toHaveLength(2);
    expect(db.all().get(b)!.missions).toHaveLength(2);
    const existing = db.all().get(a)!;
    existing.missions = [];
    existing.missionWait = 0;
    db.save(a, existing);
    game.step(14400);
    expect(db.all().get(a)!.missions).toHaveLength(0);
    game.view(a, new Set(), "single");
    db.save(a, owned(established("Solo"), a), "single");
    game.step(1);
    expect(db.all("single").get(a)!.missions[0].shared).toBe(false);
  } finally {
    db.close();
  }
});
it("Sicherungen enthalten beide Welten und private Spielfinanzen werden nicht geteilt", async () => {
  const { db, game, a, b } = await fixture();
  try {
    game.view(a, new Set(), "single");
    game.command(
      a,
      command({ type: "build", kind: "fire", pos: nodes[1] }),
      "single",
    );
    db.save(a, owned(established("Anna"), a));
    const friend = game
      .view(b, new Set())
      .network.friends.find((f) => f.id === a)!;
    expect(friend.buildings).toHaveLength(1);
    expect(friend).not.toHaveProperty("money");
    expect(friend).not.toHaveProperty("people");
    const backup = await db.backup();
    expect((await readFile(backup)).length).toBeGreaterThan(0);
  } finally {
    db.close();
  }
});
import { startServer } from "../server/index";
import { io, type Socket } from "socket.io-client";
import { spawnSync } from "node:child_process";
it("HTTP und Socket isolieren Einzelspieler einschließlich Chat und Export; Restore behält beide Welten", async () => {
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
      (await request("action", "single", command({ type: "relief" }), "wrong"))
        .status,
    ).toBe(403);
    expect(app.db.all("single").size).toBe(0);
    const res = await request(
      "action",
      "single",
      command({ type: "build", kind: "fire", pos: nodes[0] }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe("single");
    const solo = await (await request("export", "single")).json(),
      multi = await (await request("export", "multi")).json();
    expect(solo.save.money).toBe(195000);
    expect(multi.save.money).toBe(250000);
    expect(solo.mode).toBe("single");
    for (const mode of ["single", "multi"]) {
      const socket = io(origin, {
        autoConnect: false,
        transports: ["websocket"],
        extraHeaders: { cookie, origin },
        auth: { csrf: session.csrf, mode },
      });
      sockets.push(socket);
      const snapshot = await new Promise<{
        mode: string;
        network: { friends: unknown[] };
        save: Save;
      }>((done, reject) => {
        socket.once("snapshot", done);
        socket.once("connect_error", reject);
        socket.connect();
      });
      expect(snapshot.mode).toBe(mode);
      if (mode === "single") expect(snapshot.network.friends).toEqual([]);
    }
    const [singleSocket, multiSocket] = sockets;
    const privateMessages: unknown[] = [];
    singleSocket.on("chat", (m) => privateMessages.push(m));
    const heard = new Promise<{ text: string }>((done) =>
      multiSocket.once("chat", done),
    );
    multiSocket.emit("chat", "Nur Multiplayer");
    expect((await heard).text).toBe("Nur Multiplayer");
    const rejected = new Promise<string>((done) =>
      singleSocket.once("notice", done),
    );
    singleSocket.emit("chat", "Darf nicht ankommen");
    expect(await rejected).toContain("abgelehnt");
    expect(privateMessages).toEqual([]);
    backup = await app.db.backup();
  } finally {
    for (const socket of sockets) socket.disconnect();
    await app.close();
  }
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
  const restored = new Database(dir);
  try {
    expect(restored.all("single").get(user)!.money).toBe(195000);
    expect(restored.all().get(user)!.money).toBe(250000);
    expect(restored.sql.prepare("SELECT * FROM sessions").all()).toHaveLength(
      0,
    );
  } finally {
    restored.close();
  }
}, 30000);
