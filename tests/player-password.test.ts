import { it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { startServer } from "../server/index";
it("normale Spieler ändern nur ihr eigenes Passwort mit aktuellem Passwort und CSRF; alte Sitzungen verfallen", async () => {
  const dataDir = await mkdtemp(resolve(tmpdir(), "lv-player-password-")), port = 25000 + Math.floor(Math.random() * 5000), origin = `http://127.0.0.1:${port}`;
  const app = startServer({ dataDir, port, publicUrl: origin, host: "127.0.0.1", secure: false, trustedProxies: [] });
  await app.listen();
  const post = (path: string, data: unknown, cookie = "", csrf = "") => fetch(origin + "/api/" + path, { method: "POST", headers: { origin, cookie, "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify(data) });
  try {
    const password = "Current-test-password!", next = "Different-new-password!";
    const registration = await post("register", { username: "spieler", password, name: "Spieler", station: "Nord" });
    expect(registration.status).toBe(200);
    const cookie = registration.headers.get("set-cookie")!.split(";")[0];
    const me = await (await fetch(origin + "/api/me", { headers: { cookie } })).json();
    expect(me.user.role).toBe("player");
    expect((await post("password", { current: password, password: next }, cookie)).status).toBe(403);
    expect((await post("password", { current: "Incorrect-old-password!", password: next }, cookie, me.csrf)).status).toBe(400);
    expect((await post("password", { current: password, password: next }, cookie, me.csrf)).status).toBe(200);
    expect((await fetch(origin + "/api/me", { headers: { cookie } })).status).toBe(401);
    expect((await post("login", { username: "spieler", password })).status).toBe(401);
    const login = await post("login", { username: "spieler", password: next }); expect(login.status).toBe(200);
    const latest = await (await fetch(origin + "/api/me", { headers: { cookie: login.headers.get("set-cookie")!.split(";")[0] } })).json();
    expect(latest.user.id).toBe(me.user.id); expect(latest.user.role).toBe("player"); expect(latest.save.money).toBe(me.save.money);
  } finally { await app.close(); }
});
