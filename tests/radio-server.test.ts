import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { io, type Socket } from "socket.io-client";
import { expect, it } from "vitest";
import { RADIO_LEASE_SECONDS } from "../src/simulation/radio-state";
import { startServer } from "./fixtures/germany/server";
import { listenServer as listenBrowserServer } from "./helpers/listen-server";
import { radioFixture } from "./radio-fixture";

it("HTTP und Socket: konkurrierende Übernahme, Identität, Wiederverbindung, Neustart, Ablauf und Rechteentzug", async () => {
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-radio-server-")),
    secure: false,
    trustedProxies: [],
  };
  let app = await listenBrowserServer(startServer, config);
  const sockets: Socket[] = [];
  try {
    const ids = [];
    for (const name of ["alpha", "bravo", "outside"])
      ids.push(
        await app.auth.create(name, "Radio-server-password-123!", name, name),
      );
    const [owner, member] = ids;
    const s = radioFixture(owner),
      mission = s.missions[0].id,
      id = s.missions[0].control!.radio[0].id;
    app.db.save(owner, s);
    const sessions = ids.map((id) => app.auth.issue(id));
    const request = (who: number, path: string, data?: unknown) =>
      fetch(config.publicUrl + "/api/" + path, {
        method: data ? "POST" : "GET",
        headers: {
          origin: config.publicUrl,
          cookie: `lv_session=${sessions[who].value}`,
          "x-csrf-token": sessions[who].csrf,
          "content-type": "application/json",
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
    const action = (
      who: number,
      action: unknown,
      commandId = crypto.randomUUID(),
    ) => request(who, "action", { id: commandId, action });
    const radio = (op: string) => ({ type: "radio", mission, id, op });
    const stored = () => app.db.all().get(owner)!.missions[0].control!.radio[0];
    expect((await action(2, radio("claim"))).status).toBe(400);
    expect(await (await request(2, "me")).text()).not.toContain(id);
    expect(
      (await action(0, { type: "member-invite", username: "bravo" })).status,
    ).toBe(200);
    expect((await action(1, { type: "member-accept", owner })).status).toBe(
      200,
    );
    const socket = io(config.publicUrl, {
      transports: ["websocket"],
      extraHeaders: {
        origin: config.publicUrl,
        cookie: `lv_session=${sessions[1].value}`,
      },
      auth: { csrf: sessions[1].csrf, mode: "multi" },
      autoConnect: false,
    });
    sockets.push(socket);
    let snapshot = "";
    socket.on("snapshot", (data) => {
      snapshot = JSON.stringify(data);
    });
    socket.connect();
    await expect.poll(() => snapshot).toContain(id);
    const both = await Promise.all([
      action(0, radio("claim")),
      action(1, radio("claim")),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 400]);
    const winner = both[0].status === 200 ? 0 : 1,
      loser = 1 - winner;
    expect(stored().handling?.actor).toBe(ids[winner]);
    await expect.poll(() => snapshot).toContain(`"actor":"${ids[winner]}"`);
    const before = structuredClone(stored());
    expect((await action(loser, radio("report"))).status).toBe(400);
    expect(
      (await action(loser, { ...radio("claim"), actor: ids[winner] })).status,
    ).toBe(400);
    expect(stored()).toEqual(before);
    expect((await action(winner, radio("release"))).status).toBe(200);
    const replayId = crypto.randomUUID();
    expect((await action(1, radio("claim"), replayId)).status).toBe(200);
    const until = stored().handling!.until;
    expect((await action(1, radio("claim"), replayId)).status).toBe(200);
    expect(stored().handling!.until).toBe(until);
    socket.disconnect();
    await app.close();
    app = startServer(config);
    await app.listen();
    expect(stored().handling).toEqual({ actor: member, until });
    expect((await action(0, radio("report"))).status).toBe(400);
    snapshot = "";
    socket.connect();
    await expect.poll(() => snapshot).toContain(`"until":${until}`);
    app.game.step(RADIO_LEASE_SECONDS + 1, Date.now(), { generation: false });
    expect((await action(0, radio("claim"))).status).toBe(200);
    expect(stored().handling!.actor).toBe(owner);
    expect((await action(1, radio("report"))).status).toBe(400);
    expect(
      (await action(0, { type: "member-remove", user: member })).status,
    ).toBe(200);
    expect((await action(1, radio("claim"))).status).toBe(400);
    expect(await (await request(1, "me")).text()).not.toContain(id);
    const completeId = crypto.randomUUID();
    expect((await action(0, radio("report"), completeId)).status).toBe(200);
    expect((await action(0, radio("report"), completeId)).status).toBe(200);
    expect(stored().handledBy).toBe(owner);
    expect(stored().handling).toBeUndefined();
    expect(
      app.db
        .all()
        .get(owner)!
        .missions[0].control!.events.filter(
          (e) => e.type === "REPORT_RECEIVED",
        ),
    ).toHaveLength(1);
    await app.close();
    app = startServer(config);
    await app.listen();
    expect(stored().handledBy).toBe(owner);
  } finally {
    sockets.forEach((socket) => socket.close());
    await app.close();
  }
}, 30000);
