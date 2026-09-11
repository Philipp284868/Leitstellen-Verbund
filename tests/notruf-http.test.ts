import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { io, type Socket } from "socket.io-client";
import { expect, it, vi } from "vitest";
import { type Save } from "../src/model";
import { phaseFixture } from "./dispatch-fixture";
import { startServer } from "./fixtures/germany/server";

it("Tabs, zugeordnete Disponenten und Reconnect verändern die gespeicherte Notrufrate nicht; Geheimnisse bleiben serverseitig", async () => {
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  const dir = mkdtempSync(resolve(tmpdir(), "lv-call-api-"));
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:1",
    dataDir: dir,
    secure: false,
    trustedProxies: [] as string[],
  };
  let app = startServer(config);
  const sockets: Socket[] = [];
  try {
    await app.listen();
    config.publicUrl = `http://127.0.0.1:${(app.http.address() as { port: number }).port}`;
    const identities = ["owner", "member", "stranger"].map((id) => {
      const initial = phaseFixture(id, "flat");
      const s: Save = JSON.parse(
        JSON.stringify(initial).replaceAll(
          initial.generation,
          crypto.randomUUID(),
        ),
      );
      s.missions = [];
      s.archive = [];
      s.missionWait = 0;
      app.db.sql
        .prepare(
          "INSERT INTO users(id,username,password,role,created) VALUES (?,?,?,?,?)",
        )
        .run(id, id, "unused-test-account", "player", now);
      app.db.save(id, s);
      const session = app.auth.issue(id);
      return { id, cookie: `lv_session=${session.value}`, csrf: session.csrf };
    });
    app.db.sql
      .prepare("INSERT INTO desk_members VALUES (?,?)")
      .run("member", "owner");
    app.game.step(1, now);
    const before = app.db.all().get("owner")!.callPacing!;
    const connect = async (identity: (typeof identities)[number]) => {
      const socket = io(config.publicUrl, {
        autoConnect: false,
        reconnection: false,
        transports: ["websocket"],
        extraHeaders: { cookie: identity.cookie, origin: config.publicUrl },
        auth: { csrf: identity.csrf, mode: "multi" },
      });
      sockets.push(socket);
      const first = new Promise<{ save: Save }>((done) =>
        socket.once("snapshot", done),
      );
      socket.connect();
      return { socket, view: await first };
    };
    const first = await connect(identities[0]);
    await connect(identities[0]);
    await connect(identities[1]);
    expect(app.db.all().get("owner")!.callPacing).toEqual(before);
    first.socket.disconnect();
    await connect(identities[0]);
    expect(app.db.all().get("owner")!.callPacing).toEqual(before);
    for (let i = 0; i < 21; i++) app.game.step(60, now);
    const owner = app.db.all().get("owner")!;
    expect(owner.missions.length).toBeGreaterThan(2);
    expect(app.db.all().get("member")!.missions).toHaveLength(0);
    const read = async (identity: (typeof identities)[number]) => {
      const response = await fetch(`${config.publicUrl}/api/me`, {
        headers: { cookie: identity.cookie, origin: config.publicUrl },
      });
      expect(response.status).toBe(200);
      return response.json();
    };
    const own = await read(identities[0]),
      shared = await read(identities[1]),
      stranger = await read(identities[2]);
    expect(shared.save.missions).toEqual(own.save.missions);
    expect(own.save.missions[0].template).toBe("incoming");
    expect(own.save.missions[0].control.secret).toBeUndefined();
    for (const field of [
      "dynamics",
      "tasks",
      "telemetry",
      "report",
      "major",
      "organization",
    ])
      expect(own.save.missions[0][field]).toBeUndefined();
    expect(JSON.stringify(stranger)).not.toContain(owner.missions[0].id);
    const mission = owner.missions[0],
      call = mission.control!.calls[0];
    const action = (
      identity: (typeof identities)[number],
      op: string,
      question?: string,
    ) =>
      fetch(`${config.publicUrl}/api/action`, {
        method: "POST",
        headers: {
          cookie: identity.cookie,
          origin: config.publicUrl,
          "X-CSRF-Token": identity.csrf,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          action: {
            type: "call",
            mission: mission.id,
            call: call.id,
            op,
            ...(question ? { question } : {}),
          },
        }),
      });
    expect((await action(identities[2], "accept")).status).toBe(400);
    expect((await action(identities[0], "accept")).status).toBe(200);
    expect((await action(identities[1], "accept")).status).toBe(400);
    expect((await action(identities[0], "ask", "report")).status).toBe(200);
    const learned = await read(identities[1]);
    expect(learned.save.missions[0].template).toMatch(/^reported-/);
    expect(learned.save.missions[0].template).not.toBe(mission.template);
    expect(learned.save.missions[0].control.facts).toHaveLength(1);
    const persisted = app.db.all().get("owner")!.callPacing;
    sockets.forEach((socket) => socket.disconnect());
    await app.close();
    app = startServer(config);
    await app.listen();
    expect(app.db.all().get("owner")!.callPacing).toEqual(persisted);
    expect(
      app.db
        .all()
        .get("owner")!
        .missions.map((m) => m.id),
    ).toEqual(owner.missions.map((m) => m.id));
    app.game.step(14400, now);
    expect(
      app.db
        .all()
        .get("owner")!
        .missions.map((m) => m.id),
    ).toEqual(owner.missions.map((m) => m.id));
    expect(app.db.all().get("owner")!.missionWait).toBeGreaterThan(0);
  } finally {
    sockets.forEach((socket) => socket.disconnect());
    await app.close();
    clock.mockRestore();
  }
}, 30000);
