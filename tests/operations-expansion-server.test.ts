import { expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { io, type Socket } from "socket.io-client";
import { startServer } from "../server/index";
import { listenBrowserServer } from "./e2e/server-helper";
import { organizationFixture } from "./phase-three-fixture";

it("HTTP/Socket: Notrufübergabe, Lagebuch und KatS bleiben bei Wiederverbindung und Neustart erhalten; Rechte und Zusagen werden serverseitig geprüft", async () => {
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-operations-http-")),
    secure: false,
    trustedProxies: [],
  };
  let app = await listenBrowserServer(startServer, config);
  let socket: Socket | undefined;
  try {
    const ids: string[] = [];
    for (const name of ["alpha", "bravo", "helper", "outside"])
      ids.push(
        await app.auth.create(
          name,
          "Operations-test-password-123!",
          name,
          name,
        ),
      );
    const [owner, member, helper] = ids;
    app.db.save(owner, organizationFixture(owner, "field", "operations-owner"));
    app.db.save(
      helper,
      organizationFixture(helper, "field", "operations-helper"),
    );
    const sessions = ids.map((id) => app.auth.issue(id));
    const action = async (
      who: number,
      action: unknown,
      id = crypto.randomUUID(),
    ) =>
      fetch(config.publicUrl + "/api/action", {
        method: "POST",
        headers: {
          origin: config.publicUrl,
          cookie: `lv_session=${sessions[who].value}`,
          "x-csrf-token": sessions[who].csrf,
          "content-type": "application/json",
        },
        body: JSON.stringify({ id, action }),
      });
    const read = async (who: number) =>
      (
        await fetch(config.publicUrl + "/api/me", {
          headers: { cookie: `lv_session=${sessions[who].value}` },
        })
      ).text();
    const state = (id = owner) => app.db.all().get(id)!;
    const home = state().buildings[0].id,
      mission = state().missions[0].id,
      call = state().missions[0].control!.calls[0].id;
    const configure = {
      type: "civil-station",
      home,
      enabled: true,
      preparation: 60,
    };
    expect((await action(3, configure)).status).toBe(400);
    expect(await read(3)).not.toContain(mission);
    expect(
      (await action(0, { type: "member-invite", username: "bravo" })).status,
    ).toBe(200);
    expect((await action(1, { type: "member-accept", owner })).status).toBe(
      200,
    );
    expect((await action(1, configure)).status).toBe(400);
    expect((await action(0, configure)).status).toBe(200);
    let snapshot = "";
    socket = io(config.publicUrl, {
      transports: ["websocket"],
      extraHeaders: {
        origin: config.publicUrl,
        cookie: `lv_session=${sessions[1].value}`,
      },
      auth: { csrf: sessions[1].csrf, mode: "multi" },
      autoConnect: false,
    });
    socket.on("snapshot", (data) => {
      snapshot = JSON.stringify(data);
    });
    socket.connect();
    await expect.poll(() => snapshot).toContain("civilProtection");
    const callAction = (op: string) => ({ type: "call", mission, call, op });
    const races = await Promise.all([
      action(0, callAction("accept")),
      action(1, callAction("accept")),
    ]);
    expect(races.map((r) => r.status).sort()).toEqual([200, 400]);
    const winner = races[0].status === 200 ? 0 : 1,
      loser = 1 - winner;
    expect((await action(loser, callAction("handoff"))).status).toBe(400);
    expect(
      (await action(winner, { ...callAction("ask"), question: "address" }))
        .status,
    ).toBe(200);
    expect((await action(winner, callAction("handoff"))).status).toBe(200);
    expect((await action(loser, callAction("accept"))).status).toBe(200);
    expect(state().missions[0].control!.calls[0].actor).toBe(ids[loser]);
    const note = "Gemeinsame Zufahrt am Nordtor freihalten";
    const noteAction = { type: "mission-note", mission, text: note },
      noteId = crypto.randomUUID();
    expect((await action(1, noteAction, noteId)).status).toBe(200);
    expect((await action(1, noteAction, noteId)).status).toBe(200);
    expect(
      (
        await action(
          1,
          { ...noteAction, text: "Manipulierte Wiederholung" },
          noteId,
        )
      ).status,
    ).toBe(400);
    expect((await action(3, noteAction)).status).toBe(400);
    await expect.poll(() => snapshot).toContain(note);
    expect(
      state().missions[0].control!.events.filter(
        (e) => e.type === "SITUATION_NOTE",
      ),
    ).toHaveLength(1);
    const mobilize = { type: "civil-readiness", homes: [home], op: "mobilize" };
    const both = await Promise.all([action(0, mobilize), action(1, mobilize)]);
    expect(both.map((r) => r.status)).toEqual([200, 400]);
    const readyAt = state().buildings[0].civilProtection!.readyAt;
    expect(state().buildings[0].civilProtection!.history).toHaveLength(2);
    expect(
      (
        await action(0, {
          type: "dispatch",
          mission,
          vehicles: [state().vehicles[0].id],
        })
      ).status,
    ).toBe(200);
    socket.disconnect();
    await app.close();
    app = startServer(config);
    await app.listen();
    expect(state().buildings[0].civilProtection!.readyAt).toBe(readyAt);
    expect(state().missions[0].control!.calls[0].actor).toBe(ids[loser]);
    snapshot = "";
    socket.connect();
    await expect.poll(() => snapshot).toContain(note);
    app.game.step(Math.max(0, readyAt - state().time) + 1, Date.now(), {
      generation: false,
    });
    expect(state().buildings[0].civilProtection!.state).toBe("ready");
    // A separate desk sees no automatic shared situation. Only an explicit aid request grants its scoped view.
    expect(await read(2)).not.toContain(note);
    const helperHome = state(helper).buildings[0].id,
      helperVehicle = state(helper).vehicles[0].id;
    expect((await action(2, { ...configure, home: helperHome })).status).toBe(
      200,
    );
    expect(
      (
        await action(0, {
          type: "aid-draft",
          peer: helper,
          mission,
          types: ["hlf"],
          priority: "DRINGEND",
          message: "Unterstützung über Nordtor",
        })
      ).status,
    ).toBe(200);
    const aid = state().aid.at(-1)!.id;
    expect((await action(0, { type: "aid-send", id: aid })).status).toBe(200);
    const accept = {
      type: "aid-accept",
      owner,
      id: aid,
      vehicles: [helperVehicle],
    };
    expect((await action(2, accept)).status).toBe(200);
    expect((await action(2, { ...mobilize, homes: [helperHome] })).status).toBe(
      200,
    );
    app.game.step(61, Date.now(), { generation: false });
    expect((await action(2, accept)).status).toBe(400);
    expect(["travel", "scene"]).toContain(state(helper).vehicles[0].status);
    const ownView = app.game.view(owner, new Set([owner, helper]));
    expect(
      ownView.network.friends.find((f) => f.id === helper)!.buildings[0]
        .civilProtection,
    ).toBeUndefined();
    expect(await read(3)).not.toContain(note);
    expect(
      (await action(0, { type: "member-remove", user: member })).status,
    ).toBe(200);
    expect((await action(1, noteAction)).status).toBe(400);
    expect((await action(1, mobilize)).status).toBe(400);
    expect(await read(1)).not.toContain(note);
    await app.close();
    app = startServer(config);
    await app.listen();
    expect(
      state().missions[0].control!.events.filter((e) => e.text === note),
    ).toHaveLength(1);
    expect(state().buildings[0].civilProtection!.state).toBe("ready");
  } finally {
    socket?.close();
    await app.close();
  }
}, 30000);
