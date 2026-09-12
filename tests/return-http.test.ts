import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { recall } from "../src/shared/engine";
import { vehiclePosition } from "../src/shared/vehicle-position";
import { phaseFixture } from "./dispatch-fixture";
import { sites as nodes } from "./fixtures/germany/locations";
import { startServer } from "./fixtures/germany/server";

it("serializes two real dispatcher HTTP sessions on the same returning unit, rejects outsiders and replays the winning id once", async () => {
  const port = 28000 + Math.floor(Math.random() * 1500),
    origin = `http://127.0.0.1:${port}`;
  const dataDir = await mkdtemp(resolve(tmpdir(), "lv-return-http-"));
  const app = startServer(
    {
      host: "127.0.0.1",
      port,
      publicUrl: origin,
      dataDir,
      secure: false,
      trustedProxies: [],
    },
    resolve("dist/client"),
  );
  await app.listen();
  try {
    const owner = await app.auth.create(
      "return-owner",
      "Return-session-password-123!",
      "Owner",
      "North",
    );
    const member = await app.auth.create(
      "return-member",
      "Return-session-password-123!",
      "Member",
      "South",
    );
    const stranger = await app.auth.create(
      "return-other",
      "Return-session-password-123!",
      "Other",
      "West",
    );
    app.game.command(owner, {
      id: crypto.randomUUID(),
      action: { type: "member-invite", username: "return-member" },
    });
    app.game.command(member, {
      id: crypto.randomUUID(),
      action: { type: "member-accept", owner },
    });
    const s = phaseFixture(owner),
      v = s.vehicles[0],
      m = s.missions[0];
    m.control!.locationKnown = true;
    m.control!.reportedTemplate = m.template;
    v.path = [nodes[12]];
    v.status = "scene";
    v.mission = m.id;
    v.assignment = "previous-call";
    recall(s, v);
    s.time = v.depart + Math.min(5, (v.arrive - v.depart) / 3);
    const oldArrival = v.arrive;
    app.db.save(owner, s);
    const sessions = [owner, member, stranger].map((id) => app.auth.issue(id));
    const action = { type: "dispatch", mission: m.id, vehicles: [v.id] };
    const send = (who: number, id: string) =>
      fetch(origin + "/api/action", {
        method: "POST",
        headers: {
          origin,
          cookie: `lv_session=${sessions[who].value}`,
          "x-csrf-token": sessions[who].csrf,
          "content-type": "application/json",
        },
        body: JSON.stringify({ id, action }),
      });
    expect((await send(2, crypto.randomUUID())).status).toBe(400);
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    const results = await Promise.all([send(0, ids[0]), send(1, ids[1])]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const winner = results.findIndex((r) => r.status === 200);
    const current = app.db.all().get(owner)!,
      next = current.vehicles[0];
    const alarms = current.missions[0].control!.events.filter(
      (e) => e.type === "ALARM_STARTED",
    );
    expect(alarms).toHaveLength(1);
    expect(next.path[0]).toEqual(vehiclePosition(v, alarms[0].at));
    expect(next.status).toBe("travel");
    expect(next.depart).toBe(alarms[0].at);
    expect(next.turnout).toBeUndefined();
    expect(current.desk.fleet[v.id].code).toBe(3);
    expect(
      current.people.filter((p) => p.vehicle === v.id).map((p) => p.id),
    ).toEqual(s.people.filter((p) => p.vehicle === v.id).map((p) => p.id));
    expect((await send(winner, ids[winner])).status).toBe(200);
    expect(app.db.all().get(owner)!.vehicles[0].assignment).toBe(
      next.assignment,
    );
    app.game.step(Math.max(1, oldArrival - current.time + 1), Date.now(), {
      generation: false,
    });
    const later = app.db.all().get(owner)!;
    expect(later.vehicles[0].assignment).toBe(next.assignment);
    expect(later.vehicles[0].mission).toBe(m.id);
    expect(later.vehicles[0].status).not.toBe("ready");
    expect(
      later.missions[0].control!.events.filter(
        (e) => e.type === "ALARM_STARTED",
      ),
    ).toHaveLength(1);
  } finally {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}, 20000);
