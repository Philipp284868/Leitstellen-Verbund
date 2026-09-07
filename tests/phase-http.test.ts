import { it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { io, type Socket } from "socket.io-client";
import { startServer } from "../server/index";
import { phaseFixture } from "./phase-fixture";
it("HTTP, Export und Socket verbergen Szenariowissen; Teamzugriff und Funk enden mit dem Rechteentzug", async () => {
  const port = 23000 + Math.floor(Math.random() * 3000),
    origin = `http://127.0.0.1:${port}`;
  const app = startServer(
    {
      host: "127.0.0.1",
      port,
      publicUrl: origin,
      dataDir: await mkdtemp(resolve(tmpdir(), "lv-phase-http-")),
      secure: false,
      trustedProxies: [],
    },
    resolve("dist/client"),
  );
  const sockets: Socket[] = [];
  await app.listen();
  try {
    const a = await app.auth.create(
        "alpha",
        "Phase-http-password-123!",
        "Alpha",
        "Nord",
      ),
      b = await app.auth.create(
        "bravo",
        "Phase-http-password-123!",
        "Bravo",
        "Süd",
      );
    const s = phaseFixture(a);
    s.missions[0].control!.secret!.detail = "INTERNAL-TRUTH-ONLY";
    app.db.save(a, s);
    const sessions = [app.auth.issue(a), app.auth.issue(b)];
    const request = (who: number, path: string, data?: unknown) =>
      fetch(origin + "/api/" + path, {
        method: data ? "POST" : "GET",
        headers: {
          origin,
          cookie: `lv_session=${sessions[who].value}`,
          "x-csrf-token": sessions[who].csrf,
          "content-type": "application/json",
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
    for (const path of ["me", "export"]) {
      const r = await request(0, path);
      expect(r.status).toBe(200);
      const value = await r.json();
      expect(value.save.missions[0].template).toBe("incoming");
      expect(value.save.missions[0].pos).toEqual({ x: 0, y: 0 });
      expect(JSON.stringify(value)).not.toContain("INTERNAL-TRUTH");
      expect(value.save.missions[0].control).not.toHaveProperty("secret");
    }
    const received = [[] as string[], [] as string[]];
    for (let i = 0; i < 2; i++) {
      const socket = io(origin, {
        transports: ["websocket"],
        extraHeaders: { origin, cookie: `lv_session=${sessions[i].value}` },
        auth: { csrf: sessions[i].csrf, mode: "multi" },
        autoConnect: false,
      });
      sockets.push(socket);
      socket.on("chat", (data) => received[i].push(data.text));
      const snapshot = new Promise<unknown>((r) => socket.once("snapshot", r));
      socket.connect();
      expect(JSON.stringify(await snapshot)).not.toContain("INTERNAL-TRUTH");
    }
    sockets[0].emit("chat", "private-before-invite");
    await expect.poll(() => received[0].length).toBe(1);
    expect(received[1]).toEqual([]);
    const action = (who: number, action: unknown) =>
      request(who, "action", { id: crypto.randomUUID(), action });
    expect(
      (
        await action(1, {
          type: "call",
          mission: s.missions[0].id,
          call: s.missions[0].control!.calls[0].id,
          op: "accept",
        })
      ).status,
    ).toBe(400);
    expect(
      (await action(0, { type: "member-invite", username: "bravo" })).status,
    ).toBe(200);
    expect((await action(1, { type: "member-accept", owner: a })).status).toBe(
      200,
    );
    const view = await (await request(1, "me")).json();
    expect(view.save.player.id).toBe(a);
    expect(view.save.missions[0].id).toBe(s.missions[0].id);
    sockets[0].emit("chat", "team-message");
    await expect.poll(() => received[1]).toContain("team-message");
    const mission = s.missions[0].id,
      call = s.missions[0].control!.calls[0].id;
    for (const op of [{ op: "accept" }, { op: "ask", question: "address" }])
      expect(
        (await action(0, { type: "call", mission, call, ...op })).status,
      ).toBe(200);
    app.game.step(5);
    expect(
      (
        await action(0, {
          type: "call",
          mission,
          call,
          op: "ask",
          question: "report",
        })
      ).status,
    ).toBe(200);
    expect(
      (await action(0, { type: "call", mission, call, op: "end" })).status,
    ).toBe(200);
    const dispatch = {
      type: "dispatch",
      mission,
      vehicles: [s.vehicles[0].id],
    };
    const concurrent = await Promise.all([
      action(0, dispatch),
      action(1, dispatch),
    ]);
    expect(concurrent.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(
      app.db
        .all()
        .get(a)!
        .missions[0].control!.events.filter((e) => e.type === "ALARM_STARTED"),
    ).toHaveLength(1);
    expect((await action(0, { type: "member-remove", user: b })).status).toBe(
      200,
    );
    expect((await (await request(1, "me")).json()).save.player.id).toBe(b);
    expect(
      (
        await action(1, {
          type: "aao-propose",
          mission: s.missions[0].id,
          aao: "foreign",
        })
      ).status,
    ).toBe(400);
    // Wait for the rate-limit window, then use the sender echo as delivery barrier.
    await new Promise((r) => setTimeout(r, 1100));
    sockets[0].emit("chat", "private-after-revoke");
    await expect.poll(() => received[0]).toContain("private-after-revoke");
    expect(received[1]).not.toContain("private-after-revoke");
  } finally {
    sockets.forEach((s) => s.close());
    await app.close();
  }
});
