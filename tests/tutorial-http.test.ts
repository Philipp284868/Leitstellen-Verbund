import { fixturePurchase } from "./fixtures/germany/facilities";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import type { ServerAction } from "../server/actions";
import type { TrainingView, TutorialView } from "../server/tutorial";
import type { Save } from "../src/model";
import { sites as nodes } from "./fixtures/germany/locations";
import { startServer } from "./fixtures/germany/server";

import { bt, vt } from "../src/catalog";
import { ledgerBalance } from "../src/economy/ledger";
import { tick } from "../src/engine";
import { euro } from "../src/money";
import { withAutomaticRouting } from "../src/simulation/routing-context";
import {
  newTutorial,
  tutorialReady,
  tutorialReinforcementComplete,
} from "../src/tutorial-model";

type View = {
  playContext: number;
  save: Save;
  training: TrainingView;
  tutorial: TutorialView;
  csrf: string;
  user: { id: string };
  workspace: { owner: string; canManage: boolean; members: unknown[] };
  network: { friends: unknown[]; support: unknown[]; requests: unknown[] };
};
type Client = { cookie: string; csrf: string; user: string; context: number };

async function fixture() {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-tutorial-http-"));
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1",
    dataDir: dir,
    secure: false,
    trustedProxies: [],
  };
  let app = startServer(config, resolve("dist/client"));
  async function listen() {
    await app.listen();
    const address = app.http.address();
    if (!address || typeof address === "string") throw Error("Port missing");
    config.port = address.port;
    config.publicUrl = `http://127.0.0.1:${address.port}`;
  }
  await listen();
  async function request(
    client: Client | null,
    path: string,
    data?: unknown,
    session?: string,
    overrides: Record<string, string> = {},
  ) {
    const payload =
      path === "training" && typeof data === "object" && data !== null
        ? { id: crypto.randomUUID(), ...data }
        : data;
    const response = await fetch(config.publicUrl + "/api/" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        origin: config.publicUrl,
        "x-game-mode": "multi",
        "x-play-context": String(client?.context ?? 0),
        ...(client
          ? { cookie: client.cookie, "x-csrf-token": client.csrf }
          : {}),
        ...(session ? { "x-training-session": session } : {}),
        ...(data === undefined ? {} : { "content-type": "application/json" }),
        ...overrides,
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    if (client && response.ok) {
      const result = (await response.clone().json()) as Partial<View>;
      if (result.playContext !== undefined)
        client.context = Math.max(client.context, result.playContext);
    }
    return response;
  }
  async function value<T = View>(response: Promise<Response>): Promise<T> {
    const r = await response,
      body = await r.json();
    expect(r.status, JSON.stringify(body)).toBe(200);
    return body as T;
  }
  async function login(username: string): Promise<Client> {
    const password = "Tutorial-http-password-123!";
    await app.auth.create(username, password, username, "Nord");
    const logged = await request(null, "login", { username, password });
    expect(logged.status).toBe(200);
    const client = {
      cookie: logged.headers.get("set-cookie")!.split(";")[0],
      csrf: "",
      user: "",
      context: 0,
    };
    const me = await value(request(client, "me"));
    client.csrf = me.csrf;
    client.user = me.user.id;
    return client;
  }
  function command(
    client: Client,
    session: string | undefined,
    action: ServerAction,
    id = crypto.randomUUID(),
  ) {
    return request(client, "action", { id, action }, session);
  }
  function advance(client: Client, seconds: number) {
    const row = app.db.sql
      .prepare("SELECT updated_at FROM training_worlds WHERE user_id=?")
      .get(client.user)!;
    // Exercise the authoritative elapsed-time entrypoint. Neither global
    // time nor production saves are changed to manufacture practice progress.
    app.tutorial.step(Number(row.updated_at) + seconds * 1000);
  }
  const realEconomy = (client: Client) => {
    const s = app.db.all().get(client.user)!;
    return {
      money: s.money,
      xp: s.xp,
      buildings: s.buildings,
      vehicles: s.vehicles,
      people: s.people,
      journal: s.journal,
      archive: s.archive,
      statistics: s.statistics,
    };
  };
  return {
    get app() {
      return app;
    },
    request,
    value,
    login,
    command,
    advance,
    realEconomy,
    async restart() {
      await app.close();
      app = startServer(config, resolve("dist/client"));
      await listen();
    },
    async close() {
      await app.close();
      // mkdtemp created this dedicated directory under the OS temp root.
      if (
        !resolve(dir).startsWith(resolve(tmpdir()) + "/") &&
        !resolve(dir).startsWith(resolve(tmpdir()) + "\\")
      )
        throw Error("Unexpected test directory");
      await rm(dir, { recursive: true, force: true });
    },
  };
}

it("authenticates practice requests and isolates two dispatchers of one real desk", async () => {
  const f = await fixture();
  try {
    const owner = await f.login("tutorial-http-owner"),
      member = await f.login("tutorial-http-member");
    expect((await f.request(null, "training", { op: "start" })).status).toBe(
      401,
    );
    expect(
      (
        await f.request(owner, "training", { op: "start" }, undefined, {
          "x-csrf-token": "wrong",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await f.request(owner, "training", { op: "start" }, undefined, {
          origin: "http://foreign.invalid",
        })
      ).status,
    ).toBe(403);
    await f.value(
      f.command(owner, undefined, {
        type: "member-invite",
        username: "tutorial-http-member",
      }),
    );
    await f.value(
      f.command(member, undefined, {
        type: "member-accept",
        owner: owner.user,
      }),
    );
    expect((await f.value(f.request(member, "me"))).workspace.owner).toBe(
      owner.user,
    );
    const real = [f.realEconomy(owner), f.realEconomy(member)],
      a = await f.value(f.request(owner, "training", { op: "start" })),
      b = await f.value(f.request(member, "training", { op: "start" }));
    expect(a.training!.session).not.toBe(b.training!.session);
    expect(b.save.player.id).toBe(member.user);
    expect(b.workspace).toMatchObject({
      owner: member.user,
      canManage: true,
      members: [],
    });
    expect(b.network).toMatchObject({ friends: [], support: [], requests: [] });
    const build: ServerAction = fixturePurchase("fire", nodes[0]);
    expect((await f.command(owner, undefined, build)).status).toBe(400);
    expect((await f.command(owner, b.training!.session, build)).status).toBe(
      400,
    );
    expect((await f.command(member, a.training!.session, build)).status).toBe(
      400,
    );
    const id = crypto.randomUUID();
    const parallel = await Promise.all([
      f.command(owner, a.training!.session, build, id),
      f.command(owner, a.training!.session, build, id),
    ]);
    expect(parallel.map((r) => r.status)).toEqual([200, 200]);
    const built = await f.value(f.request(owner, "me"));
    expect(built.save.buildings).toHaveLength(1);
    expect(built.save.money).toBe(a.save.money - bt("fire").price);
    expect(
      (await f.value(f.request(member, "me"))).save.buildings,
    ).toHaveLength(0);
    expect(
      (
        await f.command(
          owner,
          a.training!.session,
          fixturePurchase("ems", nodes[2]),
          id,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await f.command(owner, a.training!.session, {
          type: "member-invite",
          username: "tutorial-http-member",
        })
      ).status,
    ).toBe(400);
    expect([f.realEconomy(owner), f.realEconomy(member)]).toEqual(real);
    await f.value(
      f.request(owner, "training", { op: "stop" }, a.training!.session),
    );
    expect((await f.command(owner, a.training!.session, build)).status).toBe(
      400,
    );
    expect(f.realEconomy(owner)).toEqual(real[0]);
    expect((await f.value(f.request(member, "me"))).training!.session).toBe(
      b.training!.session,
    );
    await f.value<{ ok: boolean }>(f.request(owner, "logout", {}));
    expect((await f.request(owner, "me")).status).toBe(401);
    expect((await f.request(owner, "training", { op: "start" })).status).toBe(
      401,
    );
  } finally {
    await f.close();
  }
}, 20000);

it("upgrades an earlier practice envelope without changing assets, progress, seed or replay protection", async () => {
  const f = await fixture();
  try {
    const client = await f.login("tutorial-http-legacy"),
      started = await f.value(f.request(client, "training", { op: "start" })),
      session = started.training!.session,
      id = crypto.randomUUID(),
      build: ServerAction = fixturePurchase("fire", nodes[0]);
    const built = await f.value(f.command(client, session, build, id));
    // This is an explicit historical serialized fixture in a fresh test DB,
    // reproducing the envelope before context fields were introduced.
    const row = f.app.db.sql
      .prepare("SELECT payload FROM training_worlds WHERE user_id=?")
      .get(client.user)!;
    const envelope = JSON.parse(String(row.payload)) as Record<string, unknown>;
    delete envelope.contextRevision;
    delete envelope.controlCommands;
    f.app.db.sql
      .prepare("UPDATE training_worlds SET payload=? WHERE user_id=?")
      .run(JSON.stringify(envelope), client.user);
    await f.restart();
    client.context = 0;
    const restored = await f.value(f.request(client, "me"));
    expect(restored.playContext).toBe(0);
    expect(restored.training!.session).toBe(session);
    expect(restored.save.generation).toBe(built.save.generation);
    expect(restored.save.seed).toBe(built.save.seed);
    expect(restored.save.money).toBe(built.save.money);
    expect(restored.save.buildings).toEqual(built.save.buildings);
    expect(restored.tutorial.progress).toEqual(built.tutorial.progress);
    expect(
      (await f.value(f.command(client, session, build, id))).save.buildings,
    ).toHaveLength(1);
    const stopped = await f.value(
      f.request(client, "training", { op: "stop" }, session),
    );
    expect(stopped.playContext).toBe(1);
    expect(stopped.training).toBeNull();
    expect(stopped.save.buildings).toHaveLength(0);
  } finally {
    await f.close();
  }
}, 20000);

it("serializes context switches and rejects stale controls without replaying reset or stop", async () => {
  const f = await fixture();
  try {
    const client = await f.login("tutorial-http-context"),
      start = { id: crypto.randomUUID(), op: "start" },
      initialHeaders = { "x-play-context": "0" };
    const first = await Promise.all([
      f.value(f.request(client, "training", start, undefined, initialHeaders)),
      f.value(f.request(client, "training", start, undefined, initialHeaders)),
    ]);
    expect(first.map((v) => v.playContext)).toEqual([1, 1]);
    const session = first[0].training!.session;
    expect(first[1].training!.session).toBe(session);
    expect(
      (
        await f.request(
          client,
          "training",
          { ...start, reset: true },
          undefined,
          initialHeaders,
        )
      ).status,
    ).toBe(400);
    const reset = { id: crypto.randomUUID(), op: "start", reset: true },
      oldHeaders = { "x-play-context": "1" },
      fresh = await f.value(
        f.request(client, "training", reset, session, oldHeaders),
      );
    expect(fresh.playContext).toBe(2);
    expect(fresh.training!.session).not.toBe(session);
    // Even with the current context, a stop from the old practice session is unsafe.
    expect(
      (await f.request(client, "training", { op: "stop" }, session)).status,
    ).toBe(400);
    // A delayed, different reset must not erase the new practice.
    expect(
      (
        await f.request(
          client,
          "training",
          { ...reset, id: crypto.randomUUID() },
          session,
          oldHeaders,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await f.request(
          client,
          "tutorial",
          { op: "ui", kind: "pan" },
          session,
          oldHeaders,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await f.request(
          client,
          "action",
          {
            id: crypto.randomUUID(),
            action: fixturePurchase("fire", nodes[0]),
          },
          session,
          oldHeaders,
        )
      ).status,
    ).toBe(400);
    expect(
      (await f.value(f.request(client, "me"))).tutorial.progress.ui,
    ).toEqual([]);
    const stop = { id: crypto.randomUUID(), op: "stop" },
      stopHeaders = { "x-play-context": "2" };
    const ended = await Promise.all([
      f.value(
        f.request(
          client,
          "training",
          stop,
          fresh.training!.session,
          stopHeaders,
        ),
      ),
      f.value(
        f.request(
          client,
          "training",
          stop,
          fresh.training!.session,
          stopHeaders,
        ),
      ),
    ]);
    expect(ended.map((v) => v.playContext)).toEqual([3, 3]);
    expect(ended.every((v) => v.training === null)).toBe(true);
    // Receipt replay after further context changes returns the newest state;
    // it never re-enters or re-creates the historic practice.
    const replayReset = await f.value(
      f.request(client, "training", reset, session, oldHeaders),
    );
    expect(replayReset.playContext).toBe(3);
    expect(replayReset.training).toBeNull();
    const replayStart = await f.value(
      f.request(client, "training", start, undefined, initialHeaders),
    );
    expect(replayStart.playContext).toBe(3);
    expect(replayStart.training).toBeNull();
    expect(replayStart.save.buildings).toHaveLength(0);
    await f.restart();
    const restarted = await f.value(f.request(client, "me"));
    expect(restarted.playContext).toBe(3);
    expect(restarted.training).toBeNull();
    expect(
      (
        await f.request(client, "tutorial", { op: "start" }, undefined, {
          "x-play-context": "NaN",
        })
      ).status,
    ).toBe(400);
  } finally {
    await f.close();
  }
}, 20000);

it("keeps real call, dispatch, FMS, radio, rewards and export exclusively in the practice world", async () => {
  const f = await fixture();
  try {
    const client = await f.login("tutorial-http-flow"),
      real = f.realEconomy(client),
      started = await f.value(f.request(client, "training", { op: "start" })),
      session = started.training!.session;
    await f.value(
      f.command(client, session, fixturePurchase("fire", nodes[0])),
    );
    f.advance(client, 40);
    let s = (await f.value(f.request(client, "me"))).save;
    await f.value(
      f.command(client, session, {
        type: "buy",
        kind: "lf",
        home: s.buildings[0].id,
      }),
    );
    const spawned = await f.value(
      f.request(
        client,
        "training",
        { op: "scenario", kind: "technical", session },
        session,
      ),
    );
    s = spawned.save;
    expect(s.money).toBe(
      started.save.money - bt("fire").price - vt("lf").price,
    );
    const mission = s.missions[0],
      call = mission.control!.calls[0],
      vehicle = s.vehicles[0];
    expect(mission.template).toBe("incoming");
    expect(mission.control!.secret).toBeUndefined();
    expect(mission.paymentCents).toBeUndefined();
    expect(mission.dynamics).toBeUndefined();
    await f.value(
      f.request(
        client,
        "training",
        { op: "scenario", kind: "technical", session },
        session,
      ),
    );
    expect(f.app.tutorial.trainingSave(client.user)!.missions).toHaveLength(1);
    await f.value(
      f.command(client, session, {
        type: "call",
        mission: mission.id,
        call: call.id,
        op: "accept",
      }),
    );
    for (const question of ["address", "report", "people", "hazard"] as const) {
      f.advance(client, 12);
      await f.value(
        f.command(client, session, {
          type: "call",
          mission: mission.id,
          call: call.id,
          op: "ask",
          question,
        }),
      );
    }
    await f.value(
      f.command(client, session, {
        type: "call",
        mission: mission.id,
        call: call.id,
        op: "end",
      }),
    );
    const dispatched = await f.value(
      f.command(client, session, {
        type: "dispatch",
        mission: mission.id,
        vehicles: [vehicle.id],
        alarm: "dme",
        priority: "NORMAL",
        travel: "priority",
      }),
    );
    expect(dispatched.save.vehicles[0].mission).toBe(mission.id);
    expect(dispatched.save.vehicles[0].assignment).toBeTruthy();
    const persisted = f.app.tutorial.trainingSave(client.user)!,
      replayA = structuredClone(persisted),
      replayB = structuredClone(persisted);
    for (const replay of [replayA, replayB])
      withAutomaticRouting(() =>
        tick(
          replay,
          replay.time + 90,
          {},
          false,
          false,
          {},
          new Set(),
          {},
          true,
        ),
      );
    expect(replayA).toEqual(replayB);
    const codes = new Set<number>();
    for (let i = 0; i < 140; i++) {
      f.advance(client, 10);
      s = (await f.value(f.request(client, "me"))).save;
      codes.add(s.desk.fleet[vehicle.id].code);
      const active = s.missions.find((m) => m.id === mission.id);
      if (!active) break;
      for (const request of active.control!.radio.filter(
        (r) => r.state === "open",
      )) {
        await f.value(
          f.command(client, session, {
            type: "radio",
            mission: mission.id,
            id: request.id,
            op: "report",
          }),
        );
        await f.value(
          f.command(client, session, {
            type: "radio",
            mission: mission.id,
            id: request.id,
            op: "close",
          }),
        );
      }
    }
    expect(codes.has(3)).toBe(true);
    expect(codes.has(4) || codes.has(5)).toBe(true);
    expect(s.archive).toHaveLength(1);
    const completed = s.archive[0];
    expect(completed.phase).toBe("done");
    expect(completed.control!.briefed).toBe(true);
    expect(completed.telemetry!.credits).toBeGreaterThan(0);
    expect(completed.telemetry!.xp).toBeGreaterThan(0);
    expect(s.economy!.fundingPaidCents).toBe(0);
    expect(ledgerBalance(s)).toBe(s.money);
    const history = await f.value<{ total: number; missions: Save["archive"] }>(
      f.request(client, "history"),
    );
    expect(history.total).toBe(1);
    expect(history.missions[0].id).toBe(mission.id);
    const exported = await f.value<{ format: string; save: Save }>(
      f.request(client, "export"),
    );
    expect(exported.format).toBe("leitstellen-verbund-practice");
    expect(exported.save.archive[0].id).toBe(mission.id);
    expect(
      f.app.db.sql.prepare("SELECT COUNT(*) AS n FROM mission_history").get()!
        .n,
    ).toBe(0);
    expect(
      f.app.db.sql.prepare("SELECT COUNT(*) AS n FROM rewards").get()!.n,
    ).toBe(0);
    expect(f.realEconomy(client)).toEqual(real);
    // The second, ordinary catalog incident deliberately has a genuine supply
    // deficit: LF 20 water:2 cannot satisfy field water:3. No rule is patched.
    for (let i = 0; i < 8; i++) {
      const resting = f.app.tutorial.trainingSave(client.user)!,
        unit = resting.vehicles.find((v) => v.id === vehicle.id)!;
      if (unit.status === "ready") break;
      f.advance(client, Math.max(5, unit.arrive - resting.time + 5));
    }
    expect(
      f.app.tutorial
        .trainingSave(client.user)!
        .vehicles.find((v) => v.id === vehicle.id)!.status,
    ).toBe("ready");
    const fireStart = await f.value(
      f.request(
        client,
        "training",
        { op: "scenario", kind: "fire", session },
        session,
      ),
    );
    const fire = fireStart.save.missions[0],
      fireCall = fire.control!.calls[0];
    expect(fire.template).toBe("incoming");
    expect(f.app.tutorial.trainingSave(client.user)!.missions[0].template).toBe(
      "field",
    );
    await f.value(
      f.command(client, session, {
        type: "call",
        mission: fire.id,
        call: fireCall.id,
        op: "accept",
      }),
    );
    for (const question of ["address", "report", "people", "hazard"] as const) {
      f.advance(client, 12);
      await f.value(
        f.command(client, session, {
          type: "call",
          mission: fire.id,
          call: fireCall.id,
          op: "ask",
          question,
        }),
      );
    }
    await f.value(
      f.command(client, session, {
        type: "call",
        mission: fire.id,
        call: fireCall.id,
        op: "end",
      }),
    );
    await f.value(
      f.command(client, session, {
        type: "dispatch",
        mission: fire.id,
        vehicles: [vehicle.id],
      }),
    );
    for (let i = 0; i < 120; i++) {
      f.advance(client, 10);
      s = (await f.value(f.request(client, "me"))).save;
      const arrival = s.missions
        .find((m) => m.id === fire.id)!
        .control!.radio.find(
          (r) => r.reason === "arrival" && r.state === "open",
        );
      if (!arrival) continue;
      await f.value(
        f.command(client, session, {
          type: "radio",
          mission: fire.id,
          id: arrival.id,
          op: "report",
        }),
      );
      break;
    }
    f.advance(client, 5);
    s = (await f.value(f.request(client, "me"))).save;
    const briefed = s.missions.find((m) => m.id === fire.id)!;
    expect(briefed.control!.briefed).toBe(true);
    const reinforcement = briefed.control!.radio.find(
      (r) => r.reason === "request" && r.state === "open",
    )!;
    expect(reinforcement.details).toContain("Löschwasser");
    const fireChapter = {
      ...newTutorial(),
      state: "active" as const,
      chapter: 11,
    };
    expect(tutorialReady(fireChapter, s)).toBe(false);
    f.advance(client, 25);
    s = (await f.value(f.request(client, "me"))).save;
    expect(
      s.missions.find((m) => m.id === fire.id)!.dynamics!.fire!.extinguishedAt,
    ).toBeUndefined();
    expect(s.archive.some((m) => m.id === fire.id)).toBe(false);
    await f.value(
      f.command(client, session, {
        type: "radio",
        mission: fire.id,
        id: reinforcement.id,
        op: "request",
      }),
    );
    const beforePurchase = (await f.value(f.request(client, "me"))).save;
    expect(started.save.money - bt("fire").price - vt("lf").price).toBe(
      euro(430000),
    );
    expect(vt("tsf").price).toBe(euro(180000));
    const purchase = await f.value(
      f.command(client, session, {
        type: "buy",
        kind: "tsf",
        home: vehicle.home,
      }),
    );
    const second = purchase.save.vehicles.find((v) => v.type === "tsf")!;
    expect(purchase.save.money).toBe(beforePurchase.money - vt("tsf").price);
    expect(purchase.save.money).toBeGreaterThanOrEqual(euro(250000));
    await f.value(
      f.command(client, session, {
        type: "dispatch",
        mission: fire.id,
        vehicles: [second.id],
      }),
    );
    const repeat = f.app.tutorial.trainingSave(client.user)!,
      a = structuredClone(repeat),
      b = structuredClone(repeat);
    for (const copy of [a, b])
      withAutomaticRouting(() =>
        tick(copy, copy.time + 120, {}, false, false, {}, new Set(), {}, true),
      );
    expect(a).toEqual(b);
    let sawSecondArrival = false;
    for (let i = 0; i < 200; i++) {
      f.advance(client, 10);
      s = (await f.value(f.request(client, "me"))).save;
      const current = [...s.missions, ...s.archive].find(
        (m) => m.id === fire.id,
      )!;
      sawSecondArrival ||= current.control!.events.some(
        (e) => e.type === "VEHICLE_ARRIVED" && e.vehicle === second.id,
      );
      if (current.phase === "done") break;
      expect(tutorialReady(fireChapter, s)).toBe(false);
      for (const r of current.control!.radio.filter((r) => r.state === "open"))
        await f.value(
          f.command(client, session, {
            type: "radio",
            mission: fire.id,
            id: r.id,
            op: r.reason === "arrival" ? "report" : "close",
          }),
        );
    }
    expect(sawSecondArrival).toBe(true);
    expect(s.archive).toHaveLength(2);
    const completedFire = s.archive.find((m) => m.id === fire.id)!;
    expect(completedFire.dynamics!.fire!.extinguishedAt).toBeDefined();
    expect(tutorialReady(fireChapter, s)).toBe(true);
    const withoutRequest = structuredClone(completedFire);
    withoutRequest.control!.events = withoutRequest.control!.events.filter(
      (e) => e.type !== "REINFORCEMENT_REQUESTED",
    );
    expect(tutorialReinforcementComplete(withoutRequest)).toBe(false);
    const withoutArrival = structuredClone(completedFire);
    withoutArrival.control!.events = withoutArrival.control!.events.filter(
      (e) => !(e.type === "VEHICLE_ARRIVED" && e.vehicle === second.id),
    );
    expect(tutorialReinforcementComplete(withoutArrival)).toBe(false);
    const premature = structuredClone(completedFire),
      secondDispatch = premature.control!.events.find(
        (e) => e.type === "VEHICLE_DISPATCHED" && e.vehicle === second.id,
      )!;
    premature.control!.events = [
      secondDispatch,
      ...premature.control!.events.filter((e) => e.id !== secondDispatch.id),
    ];
    expect(tutorialReinforcementComplete(premature)).toBe(false);
    const repeatedFire = await f.value(
      f.request(
        client,
        "training",
        { op: "scenario", kind: "fire", session },
        session,
      ),
    );
    expect(repeatedFire.save.missions).toHaveLength(0);
    expect(repeatedFire.save.archive).toHaveLength(2);
    expect(repeatedFire.save.money).toBe(s.money);
    expect(
      (await f.value<{ total: number }>(f.request(client, "history"))).total,
    ).toBe(2);
    expect(ledgerBalance(s)).toBe(s.money);
    expect(
      f.app.db.sql.prepare("SELECT COUNT(*) AS n FROM rewards").get()!.n,
    ).toBe(0);
    expect(
      f.app.db.sql.prepare("SELECT COUNT(*) AS n FROM mission_history").get()!
        .n,
    ).toBe(0);
    expect(f.realEconomy(client)).toEqual(real);
    await f.value(f.request(client, "training", { op: "stop" }, session));
    expect(
      (await f.value<{ total: number }>(f.request(client, "history"))).total,
    ).toBe(0);
    expect(
      (await f.value<{ format: string }>(f.request(client, "export"))).format,
    ).toBe("leitstellen-verbund");
    expect(f.realEconomy(client)).toEqual(real);
  } finally {
    await f.close();
  }
}, 20000);

it("persists private progress, session and duplicate receipts through a real server restart", async () => {
  const f = await fixture();
  try {
    const client = await f.login("tutorial-http-restart"),
      started = await f.value(f.request(client, "training", { op: "start" })),
      session = started.training!.session,
      id = crypto.randomUUID(),
      build: ServerAction = fixturePurchase("fire", nodes[0]);
    const real = f.realEconomy(client);
    expect(
      (await f.request(client, "tutorial", { op: "next", chapter: 0 }, session))
        .status,
    ).toBe(400);
    for (const kind of ["pan", "zoom", "search"])
      await f.value(f.request(client, "tutorial", { op: "ui", kind }, session));
    const next = await f.value(
      f.request(client, "tutorial", { op: "next", chapter: 0 }, session),
    );
    expect(next.tutorial.progress.chapter).toBe(1);
    expect(
      (await f.request(client, "tutorial", { op: "next", chapter: 0 }, session))
        .status,
    ).toBe(400);
    const built = await f.value(f.command(client, session, build, id));
    await f.restart();
    const restored = await f.value(f.request(client, "me"));
    expect(restored.user.id).toBe(client.user);
    expect(restored.csrf).toBe(client.csrf);
    expect(restored.training!.session).toBe(session);
    expect(restored.tutorial.progress).toEqual(next.tutorial.progress);
    expect(restored.save.generation).toBe(built.save.generation);
    expect(restored.save.money).toBe(built.save.money);
    expect(restored.save.buildings).toEqual(built.save.buildings);
    expect(
      (await f.value(f.command(client, session, build, id))).save.buildings,
    ).toHaveLength(1);
    expect(f.realEconomy(client)).toEqual(real);
    await f.value(f.request(client, "training", { op: "stop" }, session));
    await f.restart();
    expect((await f.value(f.request(client, "me"))).training).toBeNull();
    expect((await f.command(client, session, build)).status).toBe(400);
    const resumed = await f.value(
      f.request(client, "training", { op: "start" }),
    );
    expect(resumed.training!.session).toBe(session);
    expect(resumed.save.buildings).toEqual(built.save.buildings);
    expect(resumed.tutorial.progress).toEqual(next.tutorial.progress);
    const reset = await f.value(
      f.request(client, "training", { op: "start", reset: true }, session),
    );
    expect(reset.training!.session).not.toBe(session);
    expect(reset.save.generation).not.toBe(resumed.save.generation);
    expect(reset.save.buildings).toHaveLength(0);
    expect(reset.save.money).toBe(started.save.money);
    expect(reset.save.seed).toBe(started.save.seed);
    expect(reset.tutorial.progress.chapter).toBe(0);
    expect((await f.command(client, session, build)).status).toBe(400);
    expect(f.realEconomy(client)).toEqual(real);
  } finally {
    await f.close();
  }
}, 20000);
