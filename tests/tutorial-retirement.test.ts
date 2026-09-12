import { it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../server/database";
import { fresh } from "../src/model";
import { startServer } from "./fixtures/germany/server";
it("migriert alte isolierte Tutorialdaten ohne echte Objekte oder Guthaben zu ändern", () => {
  const dir = mkdtempSync(join(tmpdir(), "lv-retired-training-"));
  let db = new Database(dir);
  const s = fresh("Altbestand", "Nord", 1000);
  s.player.id = "retired";
  db.sql
    .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
    .run(s.player.id, "retired", "unused", "player", 0);
  db.save(s.player.id, s);
  const original = db.all().get(s.player.id)!;
  db.sql
    .prepare("INSERT INTO tutorial_progress VALUES(?,?)")
    .run(s.player.id, JSON.stringify({ chapter: 3 }));
  db.sql
    .prepare("INSERT INTO training_worlds VALUES(?,?,?)")
    .run(
      s.player.id,
      JSON.stringify({ active: true, save: { money: 1234 } }),
      0,
    );
  db.sql.exec("PRAGMA user_version=21");
  db.close();
  db = new Database(dir);
  expect(db.all().get(s.player.id)).toEqual(original);
  expect(db.sql.prepare("SELECT * FROM training_worlds").all()).toEqual([]);
  expect(db.sql.prepare("SELECT * FROM tutorial_progress").all()).toEqual([]);
  db.close();
  db = new Database(dir);
  expect(db.all().get(s.player.id)).toEqual(original);
  db.close();
});
it("lehnt alte Tutorial- und Trainingsaktionen authentifiziert ab und legt keine Übung an", async () => {
  const c = {
    dataDir: mkdtempSync(join(tmpdir(), "lv-retired-http-")),
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    host: "127.0.0.1",
    secure: false,
    trustedProxies: [],
  };
  const app = startServer(c);
  await app.listen();
  const address = app.http.address();
  if (!address || typeof address === "string") throw Error("address");
  c.publicUrl = `http://127.0.0.1:${address.port}`;
  const post = (
    path: string,
    data: unknown,
    cookie = "",
    csrf = "",
    extra: Record<string, string> = {},
  ) =>
    fetch(c.publicUrl + "/api/" + path, {
      method: "POST",
      headers: {
        origin: c.publicUrl,
        cookie,
        "content-type": "application/json",
        "x-csrf-token": csrf,
        ...extra,
      },
      body: JSON.stringify(data),
    });
  try {
    const r = await post("register", {
      username: "retirement",
      password: "Retirement-password!",
      name: "Alt",
      station: "Nord",
    });
    expect(r.status).toBe(200);
    const cookie = r.headers.get("set-cookie")!.split(";")[0];
    const me = await (
      await fetch(c.publicUrl + "/api/me", { headers: { cookie } })
    ).json();
    const before = app.db.all().get(me.user.id)!;
    for (const path of ["tutorial", "training"]) {
      expect((await post(path, { op: "start" }, cookie, me.csrf)).status).toBe(
        410,
      );
      expect(
        (await post(path, { op: "advance" }, cookie, me.csrf)).status,
      ).toBe(410);
    }
    expect(
      (
        await post(
          "action",
          { id: crypto.randomUUID(), action: { type: "relief" } },
          cookie,
          me.csrf,
          { "x-training-session": "old" },
        )
      ).status,
    ).toBe(409);
    expect(app.db.all().get(me.user.id)!.money).toBe(before.money);
    expect(app.db.sql.prepare("SELECT * FROM training_worlds").all()).toEqual(
      [],
    );
    expect(me).not.toHaveProperty("tutorial");
    expect(me).not.toHaveProperty("training");
  } finally {
    await app.close();
  }
});
