import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import type { ServerAction } from "../server/actions";
import { sites as nodes } from "./fixtures/germany/locations";
import { startServer } from "./fixtures/germany/server";

import { fixtureMission } from "./fixtures/germany/mission";
import { vehicleAvailability } from "../src/simulation/availability";
import { attachIncident } from "../src/simulation/calls";

it("supplies staff through real build/buy sessions, serializes shared crews and persists them across restart", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-auto-staff-http-"));
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1",
    dataDir: dir,
    secure: false,
    trustedProxies: [],
  };
  let app = startServer(config, resolve("dist/client"));
  try {
    await app.listen();
    const address = app.http.address();
    if (!address || typeof address === "string")
      throw Error("HTTP port missing");
    config.port = address.port;
    config.publicUrl = `http://127.0.0.1:${address.port}`;
    const owner = await app.auth.create(
      "staff-owner",
      "Automatic-test-password-123!",
      "Owner",
      "Nord",
    );
    const member = await app.auth.create(
      "staff-member",
      "Automatic-test-password-123!",
      "Member",
      "Süd",
    );
    const stranger = await app.auth.create(
      "staff-stranger",
      "Automatic-test-password-123!",
      "Other",
      "West",
    );
    app.game.command(owner, {
      id: crypto.randomUUID(),
      action: { type: "member-invite", username: "staff-member" },
    });
    app.game.command(member, {
      id: crypto.randomUUID(),
      action: { type: "member-accept", owner },
    });
    const sessions = [owner, member, stranger].map((id) => app.auth.issue(id));
    const send = (
      who: number,
      action: ServerAction,
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
    expect(
      (await send(0, { type: "build", kind: "fire", pos: nodes[0] })).status,
    ).toBe(200);
    let save = app.db.all().get(owner)!;
    expect(save.people).toHaveLength(0);
    app.game.step(save.buildings[0].ready - save.time + 1, Date.now(), {
      generation: false,
    });
    save = app.db.all().get(owner)!;
    expect(save.people.length).toBeGreaterThanOrEqual(6);
    const purchase: ServerAction = {
        type: "buy",
        kind: "tsf",
        home: save.buildings[0].id,
      },
      receipt = crypto.randomUUID();
    const bought = await Promise.all([
      send(0, purchase, receipt),
      send(0, purchase, receipt),
      send(1, purchase),
    ]);
    expect(bought.map((r) => r.status)).toEqual([200, 200, 200]);
    save = app.db.all().get(owner)!;
    expect(save.vehicles).toHaveLength(2);
    expect(save.people).toHaveLength(12);
    expect(
      save.vehicles.every((v) => vehicleAvailability(save, v).alarmable),
    ).toBe(true);
    const mission = fixtureMission(save, "field");
    save.missions.push(mission);
    mission.pos = nodes[2];
    attachIncident(save, mission);
    mission.control!.locationKnown = true;
    mission.control!.reportedTemplate = "reported-fire";
    app.db.save(owner, save);
    const actions = save.vehicles.map(
      (v): ServerAction => ({
        type: "dispatch",
        mission: mission.id,
        vehicles: [v.id],
      }),
    );
    expect((await send(2, actions[0])).status).toBe(400);
    const responses = await Promise.all(
      actions.map((action, i) => send(i, action)),
    );
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    save = app.db.all().get(owner)!;
    const responding = save.vehicles.flatMap((v) =>
      v.turnout!.arrivals.filter((a) => a.available).map((a) => a.person),
    );
    expect(responding.length).toBe(8);
    expect(new Set(responding).size).toBe(8);
    const binding = save.people.map((p) => [p.id, p.vehicle]);
    const journeys = save.vehicles.map((v) => ({
      id: v.id,
      assignment: v.assignment,
      depart: v.depart,
      arrive: v.arrive,
      turnout: v.turnout,
      path: v.path,
    }));
    const balance = save.money;
    await app.close();
    app = startServer(config, resolve("dist/client"));
    await app.listen();
    const restarted = app.db.all().get(owner)!;
    expect(restarted.people.map((p) => [p.id, p.vehicle])).toEqual(binding);
    expect(
      restarted.vehicles.map((v) => ({
        id: v.id,
        assignment: v.assignment,
        depart: v.depart,
        arrive: v.arrive,
        turnout: v.turnout,
        path: v.path,
      })),
    ).toEqual(journeys);
    expect(restarted.money).toBe(balance);
    expect((await send(0, purchase, receipt)).status).toBe(200);
    expect(app.db.all().get(owner)!.vehicles).toHaveLength(2);
    app.game.step(
      Math.max(...restarted.vehicles.map((v) => v.depart)) - restarted.time + 1,
      Date.now(),
      { generation: false },
    );
    const departed = app.db.all().get(owner)!;
    // Different FF arrival times can put the first unit on scene before the
    // second one leaves. Both must have actually left with their own crew.
    expect(
      departed.vehicles.every((v) => ["travel", "scene"].includes(v.status)),
    ).toBe(true);
    expect(
      departed.vehicles.every((v) =>
        [3, 4, 5].includes(departed.desk.fleet[v.id].code),
      ),
    ).toBe(true);
    for (const v of departed.vehicles)
      expect(
        departed.missions
          .find((m) => m.id === mission.id)!
          .control!.events.filter(
            (e) => e.type === "VEHICLE_DEPARTED" && e.vehicle === v.id,
          ),
      ).toHaveLength(1);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 20000);
