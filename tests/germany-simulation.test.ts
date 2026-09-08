import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fork, type ChildProcess } from "node:child_process";
import type * as Fixture from "./germany-simulation-fixture";
import type { Save } from "../src/model";
import type { ServerAction } from "../server/actions";

let fixture: typeof Fixture;
const dataset = "c".repeat(64),
  owner = "11111111-2222-4333-8444-555555555555";
let dir: string,
  router: ChildProcess,
  origin: string,
  provider: Awaited<ReturnType<typeof Fixture.initializeGermany>> | undefined,
  db: InstanceType<typeof Fixture.Database> | undefined;
beforeAll(async () => {
  mkdirSync(".tools", { recursive: true });
  const outfile = resolve(`.tools/germany-simulation-${process.pid}.mjs`);
  await build({
    entryPoints: ["tests/germany-simulation-fixture.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    define: { __LV_WORLD__: JSON.stringify("germany-1") },
    plugins: [
      {
        name: "germany-world",
        setup(b) {
          b.onResolve({ filter: /(?:^|\/)world$/ }, () => ({
            path: resolve("src/germany/world.ts"),
          }));
        },
      },
    ],
  });
  fixture = await import(pathToFileURL(outfile).href);
}, 20000);
beforeEach(async () => {
  dir = mkdtempSync(resolve(tmpdir(), "lv-germany-simulation-"));
  const index = new DatabaseSync(resolve(dir, "index.sqlite"));
  index.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE anchors(id INTEGER PRIMARY KEY,lon REAL,lat REAL,name TEXT,road_class TEXT,bridge INTEGER,tunnel INTEGER,access TEXT);
    CREATE VIRTUAL TABLE anchors_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat);
    CREATE TABLE places(id INTEGER PRIMARY KEY,osm_type TEXT,osm_id TEXT,kind TEXT,name TEXT,display_name TEXT,lon REAL,lat REAL,region TEXT);
    CREATE VIRTUAL TABLE places_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat);`);
  index.prepare("INSERT INTO metadata VALUES('source_sha256',?)").run(dataset);
  for (let i = 0; i < 30; i++) {
    const id = 15000000000 + i,
      lon = 13.4 + i * 0.0001,
      lat = 52.52 + i * 0.0001;
    index
      .prepare("INSERT INTO anchors VALUES(?,?,?,?,?,0,0,'')")
      .run(id, lon, lat, "Teststraße", "residential");
    index
      .prepare("INSERT INTO anchors_rtree VALUES(?,?,?,?,?)")
      .run(id, lon, lon, lat, lat);
  }
  index.exec(
    "INSERT INTO places VALUES(1,'node','10','city','Berlin','Berlin',13.4,52.52,'Berlin'); INSERT INTO places_rtree VALUES(1,13.4,13.4,52.52,52.52)",
  );
  index.close();
  router = fork(resolve("tests/helpers/germany-router.mjs"), {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  origin = await new Promise<string>((done, reject) => {
    router.once("message", (m: { origin: string }) => done(m.origin));
    router.once("error", reject);
  });
  provider = await fixture.initializeGermany({
    indexPath: resolve(dir, "index.sqlite"),
    dataset,
    routerUrl: origin,
  });
});
afterEach(async () => {
  db?.close();
  db = undefined;
  await provider?.close();
  provider = undefined;
  if (router?.connected)
    await new Promise<void>((done) => {
      router.once("exit", () => done());
      router.send("stop");
    });
  if (dir) rmSync(dir, { force: true, recursive: true });
});
function createGame() {
  db = new fixture.Database(resolve(dir, "save"));
  db.sql
    .prepare(
      "INSERT INTO users(id,username,password,role,created) VALUES(?,?,?,?,?)",
    )
    .run(owner, "dispatch", "unused-fixture-hash", "player", 0);
  const save = fixture.fresh("Disponent", "Berlin", 1000);
  save.player.id = owner;
  save.seed = 124;
  save.money = 2000000;
  save.xp = fixture.xpForLevel(30);
  save.missionWait = 100000;
  db.save(owner, save);
  return new fixture.Game(db);
}
const command = (
  game: InstanceType<typeof Fixture.Game>,
  action: ServerAction,
  id = crypto.randomUUID(),
) => {
  game.command(owner, { id, action });
  return id;
};
const current = (): Save => db!.all().get(owner)!;
function setupFleet(game: InstanceType<typeof Fixture.Game>) {
  command(game, {
    type: "build",
    kind: "fire",
    pos: fixture.project({ lon: 13.4, lat: 52.52 }),
  });
  let save = current();
  fixture.tick(save, save.time + 30, {}, false, false);
  db!.save(owner, save);
  const home = save.buildings[0].id;
  for (const [kind, count] of [
    ["hlf", 9],
    ["tlf", 3],
  ] as const) {
    command(game, { type: "buy", kind, home });
    command(game, { type: "hire", home, count });
    save = current();
    command(game, { type: "assign", vehicle: save.vehicles.at(-1)!.id });
  }
  save = current();
  fixture.generate(save);
  const m = save.missions[0];
  m.template = "field";
  m.pos = fixture.project({ lon: 13.4029, lat: 52.5229 });
  save.seed = 124;
  fixture.attachIncident(save, m);
  db!.save(owner, save);
  return m.id;
}
function interview(game: InstanceType<typeof Fixture.Game>, mission: string) {
  const call = current().missions.find((m) => m.id === mission)!.control!
    .calls[0].id;
  command(game, { type: "call", mission, call, op: "accept" });
  command(game, {
    type: "call",
    mission,
    call,
    op: "ask",
    question: "address",
  });
  const s = current();
  fixture.tick(s, s.time + 5, {}, false, false);
  db!.save(owner, s);
  command(game, { type: "call", mission, call, op: "ask", question: "report" });
  command(game, { type: "call", mission, call, op: "end" });
}
async function setRouter(mode: string) {
  await new Promise<void>((done) => {
    router.once("message", () => done());
    router.send({ mode });
  });
}
async function reopenProvider() {
  await provider!.close();
  provider = await fixture.initializeGermany({
    indexPath: resolve(dir, "index.sqlite"),
    dataset,
    routerUrl: origin,
  });
}
const requestCount = async () =>
  ((await (await fetch(`${origin}/stats`)).json()) as { requests: number })
    .requests;

describe("Deutschland-Simulation mit echter SQLite und synthetischem Routingvertrag", () => {
  it("persists a safe routing wait, advances the server, and resumes after a database/provider restart", async () => {
    const game = createGame(),
      mission = setupFleet(game);
    interview(game, mission);
    command(game, {
      type: "dispatch",
      mission,
      vehicles: [current().vehicles[0].id],
      alarm: "station",
    });
    const save = current(),
      vehicle = save.vehicles[0];
    fixture.tick(save, vehicle.depart + 1, {}, false, false);
    vehicle.journey!.nextCheck = save.time;
    vehicle.journey!.events = vehicle.journey!.events.filter(
      (e) => !e.startsWith("weather-"),
    );
    db!.save(owner, save);
    await reopenProvider();
    await setRouter("unavailable");
    const count = await requestCount(),
      before = current(),
      position = fixture.vehiclePosition(before.vehicles[0], before.time + 1);
    expect(() => game.step(1)).not.toThrow();
    let waiting = current();
    expect(waiting.time).toBe(before.time + 1);
    expect(waiting.vehicles[0].path).toEqual([position]);
    expect(waiting.vehicles[0].journey!.motion).toEqual([]);
    expect(waiting.vehicles[0].journey!.blockedUntil).toBe(waiting.time + 60);
    expect(waiting.vehicles[0].assignment).toBe(before.vehicles[0].assignment);
    const distanceDone = waiting.vehicles[0].journey!.distanceDone;
    game.step(59);
    waiting = current();
    expect(waiting.vehicles[0].path).toEqual([position]);
    expect(waiting.vehicles[0].journey!.distanceDone).toBe(distanceDone);
    expect(await requestCount()).toBe(count + 1);
    db!.close();
    db = undefined;
    await setRouter("normal");
    await reopenProvider();
    db = new fixture.Database(resolve(dir, "save"));
    new fixture.Game(db).step(2);
    const resumed = current().vehicles[0];
    expect(resumed.journey!.blockedUntil).toBe(0);
    expect(resumed.path.length).toBeGreaterThan(1);
    expect(resumed.journey!.motion!.length).toBeGreaterThan(0);
    expect(resumed.assignment).toBe(before.vehicles[0].assignment);
    expect(resumed.journey!.distanceDone).toBeGreaterThanOrEqual(distanceDone);
  }, 20000);
  it("rolls back a manual alarm during a router outage and accepts its id once after recovery", async () => {
    const game = createGame(),
      mission = setupFleet(game);
    interview(game, mission);
    const action = {
      type: "dispatch",
      mission,
      vehicles: [current().vehicles[0].id],
      alarm: "station",
    } as const;
    const id = crypto.randomUUID(),
      before = current();
    await reopenProvider();
    await setRouter("unavailable");
    expect(() => game.command(owner, { id, action })).toThrow(
      "temporarily unavailable",
    );
    expect(current()).toEqual(before);
    expect(
      db!.sql.prepare("SELECT id FROM actions WHERE id=?").get(id),
    ).toBeUndefined();
    await setRouter("normal");
    await reopenProvider();
    game.command(owner, { id, action });
    const assigned = current();
    game.command(owner, { id, action });
    expect(current()).toEqual(assigned);
  }, 20000);
  it("finishes an incident exactly once while its automatic return awaits the routing service", async () => {
    const game = createGame();
    setupFleet(game);
    const save = current(),
      m = save.missions[0],
      v = save.vehicles[0];
    m.control!.briefed = true;
    m.phase = "transport";
    v.mission = m.id;
    v.assignment = crypto.randomUUID();
    v.status = "scene";
    v.path = [m.pos];
    v.depart = save.time;
    v.arrive = save.time;
    db!.save(owner, save);
    await reopenProvider();
    await setRouter("unavailable");
    expect(() => game.step(1)).not.toThrow();
    const completed = current();
    expect(
      completed.archive.filter((mission) => mission.id === m.id),
    ).toHaveLength(1);
    expect(completed.vehicles[0].status).toBe("return");
    expect(completed.vehicles[0].mission).toBeNull();
    expect(completed.vehicles[0].journey!.blockedUntil).toBe(
      completed.time + 60,
    );
    const reward = completed.money;
    game.step(20);
    expect(current().money).toBe(reward);
    expect(
      current().archive.filter((mission) => mission.id === m.id),
    ).toHaveLength(1);
    await setRouter("normal");
    await reopenProvider();
    game.step(200);
    expect(current().vehicles[0].journey!.blockedUntil).toBe(0);
    const returning = current();
    game.step(Math.max(1, returning.vehicles[0].arrive - returning.time + 1));
    expect(current().vehicles[0].status).toBe("ready");
    expect(current().money).toBe(reward);
  }, 20000);
  it("delivers a patient once when the automatic return from hospital has no router", async () => {
    const game = createGame(),
      mission = setupFleet(game);
    const p = fixture.project({ lon: 13.4029, lat: 52.5229 });
    command(game, { type: "build", kind: "ems", pos: p });
    let save = current();
    fixture.tick(save, save.time + 30, {}, false, false);
    db!.save(owner, save);
    const home = save.buildings.at(-1)!.id;
    command(game, { type: "buy", kind: "rtw", home });
    command(game, { type: "hire", home, count: 2 });
    save = current();
    const id = save.vehicles.at(-1)!.id;
    command(game, { type: "assign", vehicle: id });
    save = current();
    const v = save.vehicles.find((v) => v.id === id)!;
    v.mission = mission;
    v.assignment = crypto.randomUUID();
    v.patients = 1;
    v.destination = "public:node:10";
    fixture.beginTrip(save, v, save.buildings[0].pos, "transport");
    const arrival = v.arrive;
    db!.save(owner, save);
    await reopenProvider();
    await setRouter("unavailable");
    expect(() => game.step(arrival - save.time + 1)).not.toThrow();
    const delivered = current(),
      returning = delivered.vehicles.find((v) => v.id === id)!;
    expect(delivered.beds).toHaveLength(1);
    expect(returning.patients).toBe(0);
    expect(returning.status).toBe("return");
    expect(returning.journey!.blockedUntil).toBeGreaterThan(delivered.time);
    game.step(10);
    expect(current().beds).toHaveLength(1);
  }, 20000);
  it("does not conceal invalid router responses as temporary waits", async () => {
    const game = createGame(),
      mission = setupFleet(game);
    interview(game, mission);
    command(game, {
      type: "dispatch",
      mission,
      vehicles: [current().vehicles[0].id],
      alarm: "station",
    });
    const save = current(),
      v = save.vehicles[0];
    fixture.tick(save, v.depart + 1, {}, false, false);
    v.journey!.nextCheck = save.time;
    v.journey!.events = v.journey!.events.filter(
      (e) => !e.startsWith("weather-"),
    );
    db!.save(owner, save);
    const before = current();
    await reopenProvider();
    await setRouter("invalid");
    expect(() => game.step(1)).toThrow("Ungültige Antwort");
    expect(current()).toEqual(before);
  }, 20000);
  it("keeps a repaired vehicle at its actual position until its route can resume", async () => {
    const game = createGame(),
      mission = setupFleet(game);
    const save = current(),
      v = save.vehicles[0];
    v.mission = mission;
    v.assignment = crypto.randomUUID();
    fixture.beginTrip(save, v, save.missions[0].pos, "travel");
    const point = { ...v.path[0] };
    v.fault = {
      kind: "engine",
      since: save.time,
      repairAt: save.time + 1,
      state: "repairing",
      mission,
      assignment: v.assignment,
      position: point,
    };
    v.path = [point];
    v.depart = save.time;
    v.arrive = save.time;
    db!.save(owner, save);
    await reopenProvider();
    await setRouter("unavailable");
    expect(() => game.step(2)).not.toThrow();
    const repaired = current().vehicles[0];
    expect(repaired.fault!.state).toBe("repaired");
    expect(repaired.path).toEqual([point]);
    expect(repaired.assignment).toBe(v.assignment);
    expect(repaired.journey!.blockedUntil).toBeGreaterThan(current().time);
  }, 20000);
  it("queues the return of an orphaned remote helper outside the individual engine tick", async () => {
    const game = createGame();
    setupFleet(game);
    const save = current(),
      v = save.vehicles[0];
    v.mission = `remote:66666666-7777-4888-8999-000000000000:${crypto.randomUUID()}`;
    v.assignment = crypto.randomUUID();
    v.status = "scene";
    v.path = [save.missions[0].pos];
    v.depart = save.time;
    v.arrive = save.time;
    db!.save(owner, save);
    await reopenProvider();
    await setRouter("unavailable");
    expect(() => game.step(1)).not.toThrow();
    const returning = current().vehicles[0];
    expect(returning.status).toBe("return");
    expect(returning.mission).toBeNull();
    expect(returning.path).toEqual(v.path);
    expect(returning.journey!.blockedUntil).toBeGreaterThan(current().time);
  }, 20000);
  it("opens one circuit per provider instead of sending 100 routing requests during an outage", async () => {
    await setRouter("unavailable");
    const count = await requestCount();
    for (let i = 0; i < 100; i++)
      expect(() =>
        provider!.route(
          fixture.project({ lon: 13.4, lat: 52.52 }),
          fixture.project({ lon: 13.4001 + i * 0.00001, lat: 52.5201 }),
          "road",
          new Set(),
          90,
          new Map(),
          1,
        ),
      ).toThrow();
    expect(await requestCount()).toBe(count + 1);
  }, 20000);
  it("repeats the complete incident deterministically against the same fixed world data", () => {
    const game = createGame();
    setupFleet(game);
    const base = current();
    function replay() {
      const s = structuredClone(base),
        m = s.missions[0],
        call = m.control!.calls[0].id;
      fixture.callAction(s, m, call, "accept", owner);
      fixture.callAction(s, m, call, "ask", owner, "address");
      fixture.tick(s, s.time + 5, {}, false, false);
      fixture.callAction(s, m, call, "ask", owner, "report");
      fixture.callAction(s, m, call, "end", owner);
      fixture.alarm(s, m, [s.vehicles[0].id], owner, "NORMAL", "station");
      fixture.tick(s, s.vehicles[0].arrive + 1, {}, false, false);
      fixture.radioAction(s, m, m.control!.radio[0].id, "report", owner);
      fixture.tick(s, s.time + 1, {}, false, false);
      fixture.radioAction(
        s,
        m,
        m.control!.radio.find((r) => r.reason === "request")!.id,
        "request",
        owner,
      );
      fixture.alarm(s, m, [s.vehicles[1].id], owner, "NORMAL", "station");
      fixture.tick(s, s.vehicles[1].arrive + 1000, {}, false, false);
      expect(s.archive).toHaveLength(1);
      return fixture.validate(s);
    }
    expect(replay()).toEqual(replay());
  }, 20000);
  it("spielt Bau, Personal, Notruf, Alarmierung, Neustart, Nachforderung und Historie ohne doppelte Aktionen", async () => {
    let game = createGame();
    const mission = setupFleet(game);
    interview(game, mission);
    const first = current().vehicles[0].id;
    const action = {
      type: "dispatch",
      mission,
      vehicles: [first],
      alarm: "station",
    } as const;
    const id = command(game, { ...action, vehicles: [...action.vehicles] });
    const alarmed = current(),
      assignment = alarmed.vehicles[0].assignment,
      alarmCount = alarmed.missions[0].control!.events.length;
    game.command(owner, { id, action });
    expect(current().missions[0].control!.events).toHaveLength(alarmCount);
    expect(() =>
      game.command(owner, { id, action: { type: "recall", id: first } }),
    ).toThrow("Aktions-ID");
    expect(
      alarmed.people.every((p) => p.duty && p.duty.homeNode >= 15000000000),
    ).toBe(true);
    expect(
      alarmed.vehicles[0].journey!.motion!.some((p) =>
        p.edge.startsWith(`gh:${dataset}:`),
      ),
    ).toBe(true);
    let s = current();
    fixture.tick(s, s.vehicles[0].depart + 1, {}, false, false);
    db!.save(owner, s);
    expect(s.desk.fleet[first].code).toBe(3);
    const before = structuredClone(s.vehicles[0]);
    db!.close();
    db = undefined;
    await provider!.close();
    provider = await fixture.initializeGermany({
      indexPath: resolve(dir, "index.sqlite"),
      dataset,
      routerUrl: origin,
    });
    db = new fixture.Database(resolve(dir, "save"));
    game = new fixture.Game(db);
    expect(current().vehicles[0]).toEqual(before);
    expect(current().vehicles[0].assignment).toBe(assignment);
    s = current();
    fixture.tick(s, s.vehicles[0].arrive + 1, {}, false, false);
    db.save(owner, s);
    expect(s.vehicles[0].status).toBe("scene");
    command(game, {
      type: "radio",
      mission,
      id: s.missions[0].control!.radio[0].id,
      op: "report",
    });
    s = current();
    fixture.tick(s, s.time + 1, {}, false, false);
    db.save(owner, s);
    const request = s.missions[0].control!.radio.find(
      (r) => r.reason === "request",
    )!;
    command(game, { type: "radio", mission, id: request.id, op: "request" });
    command(game, {
      type: "dispatch",
      mission,
      vehicles: [s.vehicles[1].id],
      alarm: "station",
    });
    s = current();
    fixture.tick(s, s.vehicles[1].arrive + 100, {}, false, false);
    db.save(owner, s);
    expect(s.archive.find((m) => m.id === mission)?.control?.stage).toBe(
      "closed",
    );
    const reward = s.money;
    fixture.tick(s, s.time + 1200, {}, false, false);
    db.save(owner, s);
    expect(s.money).toBe(reward);
    expect(s.vehicles.every((v) => v.status === "ready")).toBe(true);
    expect(fixture.validate(s)).toEqual(s);
  }, 20000);
  it("verbirgt Leitstellenobjekte und schützt eine fremde Welt vor schreibendem Öffnen", () => {
    const game = createGame();
    setupFleet(game);
    const peer = "66666666-7777-4888-8999-000000000000";
    db!.sql
      .prepare(
        "INSERT INTO users(id,username,password,role,created) VALUES(?,?,?,?,?)",
      )
      .run(peer, "other", "unused-fixture-hash", "player", 0);
    const other = fixture.fresh("Andere", "Hamburg", 1000);
    other.player.id = peer;
    db!.save(peer, other);
    expect(game.view(peer, new Set()).network.friends).toEqual([]);
    expect(() =>
      game.command(peer, {
        id: crypto.randomUUID(),
        action: {
          type: "dispatch",
          mission: current().missions[0].id,
          vehicles: [current().vehicles[0].id],
        },
      }),
    ).toThrow("Eigener Einsatz");
    db!.sql
      .prepare("UPDATE meta SET value=? WHERE key='world-identity-v1'")
      .run(
        JSON.stringify({ world: "rivermere-1", seed: 57180908, generator: 1 }),
      );
    db!.close();
    db = undefined;
    const file = resolve(dir, "save/game.sqlite"),
      bytes = readFileSync(file);
    expect(() => new fixture.Database(resolve(dir, "save"))).toThrow(
      "Weltkonflikt",
    );
    expect(readFileSync(file)).toEqual(bytes);
  }, 20000);
});
