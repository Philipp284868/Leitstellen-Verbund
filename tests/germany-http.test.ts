import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { build } from "esbuild";
import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { fork, type ChildProcess } from "node:child_process";
import { io, type Socket } from "socket.io-client";
import {
  RouteSnapshotDecoder,
  type RouteSnapshotFrame,
} from "../src/germany/snapshot";
import type * as Fixture from "./germany-simulation-fixture";
import type { Config } from "../server/config";
import type { ServerAction } from "../server/actions";
import type { Mission, Save } from "../src/model";
import { unproject } from "../src/germany/projection";
import {
  encodeTile,
  rectangle,
  tile,
  tilePoint,
} from "./helpers/geography-tile";

const dataset = "d".repeat(64),
  password = "Isolated-germany-test-284!";
type Session = { id: string; cookie: string; csrf: string };
type View = ReturnType<InstanceType<typeof Fixture.Game>["view"]>;
let f: typeof Fixture,
  dir: string,
  child: ChildProcess,
  app: ReturnType<typeof Fixture.startServer> | undefined,
  c: Config;
const sockets: Socket[] = [];
let user: Session, other: Session, vehicle: string;
beforeAll(async () => {
  mkdirSync(".tools", { recursive: true });
  const outfile = resolve(`.tools/germany-http-${process.pid}.mjs`);
  await build({
    entryPoints: ["tests/germany-simulation-fixture.ts"],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
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
  f = await import(pathToFileURL(outfile).href);
}, 20000);
async function start() {
  c.port = 0;
  c.publicUrl = "http://127.0.0.1:0";
  const geo = await f.prepareGeography(c);
  try {
    app = f.startServer(c, resolve(dir, "client"), geo);
  } catch (error) {
    await geo?.close();
    throw error;
  }
  await app.listen();
  const address = app.http.address();
  if (!address || typeof address === "string") throw Error("Testserver fehlt.");
  c.port = address.port;
  c.publicUrl = `http://127.0.0.1:${address.port}`;
}
async function request(
  path: string,
  session?: Session,
  action?: unknown,
  mode = "multi",
) {
  return fetch(c.publicUrl + path, {
    method: action === undefined ? "GET" : "POST",
    headers: {
      Origin: c.publicUrl,
      "X-Game-Mode": mode,
      ...(session
        ? { Cookie: session.cookie, "X-CSRF-Token": session.csrf }
        : {}),
      ...(action === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(action === undefined ? {} : { body: JSON.stringify(action) }),
  });
}
async function login(username: string): Promise<Session> {
  const response = await request("/api/login", undefined, {
    username,
    password,
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const data = await (
    await request("/api/me", { id: "", cookie, csrf: "" })
  ).json();
  return { id: data.user.id, cookie, csrf: data.csrf };
}
beforeEach(async () => {
  dir = mkdtempSync(resolve(tmpdir(), "lv-germany-http-"));
  const geodataDir = resolve(dir, "geo");
  mkdirSync(geodataDir);
  writeFileSync(
    resolve(geodataDir, "manifest.json"),
    JSON.stringify({
      schema: 1,
      worldId: "germany-1",
      status: "ready",
      snapshot: "2026-09-07",
      dataset,
      graphRuntimeIdentity: JSON.parse(
        readFileSync(
          resolve("tests/fixtures/germany-graph-runtime.json"),
          "utf8",
        ),
      ),
    }),
  );
  const db = new DatabaseSync(resolve(geodataDir, "index.sqlite"));
  db.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE anchors(id INTEGER PRIMARY KEY,lon REAL,lat REAL,name TEXT,road_class TEXT,bridge INTEGER,tunnel INTEGER,access TEXT);
    CREATE VIRTUAL TABLE anchors_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat);
    CREATE TABLE places(id INTEGER PRIMARY KEY,osm_type TEXT,osm_id TEXT,kind TEXT,name TEXT,display_name TEXT,lon REAL,lat REAL,region TEXT);
    CREATE VIRTUAL TABLE places_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat);
    CREATE VIRTUAL TABLE places_fts USING fts5(name,display_name,content='places',content_rowid='id');`);
  db.prepare("INSERT INTO metadata VALUES('source_sha256',?)").run(dataset);
  for (let i = 0; i < 10; i++) {
    const id = 16000000000 + i,
      lon = 13.4 + i * 0.0001,
      lat = 52.52 + i * 0.0001;
    db.prepare("INSERT INTO anchors VALUES(?,?,?,?,?,0,0,'')").run(
      id,
      lon,
      lat,
      "Teststraße",
      "residential",
    );
    db.prepare("INSERT INTO anchors_rtree VALUES(?,?,?,?,?)").run(
      id,
      lon,
      lon,
      lat,
      lat,
    );
  }
  for (const [id, x, y] of [
    [17000000001, 1550, 1000],
    [17000000002, 2600, 1000],
    [17000000003, 1550, 600],
    [17000000004, 1550, 1450],
  ]) {
    const { lon, lat } = unproject(tilePoint(x, y));
    db.prepare("INSERT INTO anchors VALUES(?,?,?,?,?,0,0,'')").run(
      id,
      lon,
      lat,
      "Uferstraße",
      "residential",
    );
    db.prepare("INSERT INTO anchors_rtree VALUES(?,?,?,?,?)").run(
      id,
      lon,
      lon,
      lat,
      lat,
    );
  }
  db.exec(
    "INSERT INTO places VALUES(1,'node','10','city','Berlin','Berlin',13.4,52.52,'Berlin'); INSERT INTO places_rtree VALUES(1,13.4,13.4,52.52,52.52); INSERT INTO places VALUES(2,'way','11','hospital','Testklinik','Testklinik',13.4009,52.5209,'Berlin'); INSERT INTO places_rtree VALUES(2,13.4009,13.4009,52.5209,52.5209); INSERT INTO places_fts(places_fts) VALUES('rebuild')",
  );
  db.close();
  const tiles = new DatabaseSync(resolve(geodataDir, "maps.mbtiles"));
  tiles.exec(
    "CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB); CREATE TABLE metadata(name TEXT PRIMARY KEY,value TEXT)",
  );
  tiles.prepare("INSERT INTO metadata VALUES('source_sha256',?)").run(dataset);
  tiles.exec("INSERT INTO metadata VALUES('maxzoom','14')");
  tiles.prepare("INSERT INTO tiles VALUES(?,?,?,?)").run(
    tile.z,
    tile.x,
    2 ** tile.z - 1 - tile.y,
    encodeTile([
      {
        layer: "water",
        properties: { class: "lake" },
        type: 3,
        parts: [rectangle(500, 500, 1500, 1500)],
      },
    ]),
  );
  tiles
    .prepare("INSERT INTO tiles VALUES(?,?,?,?)")
    .run(2, 2, 2, gzipSync(Buffer.from("synthetic vector transport fixture")));
  tiles.close();
  mkdirSync(resolve(dir, "client"));
  writeFileSync(
    resolve(dir, "client/index.html"),
    "<!doctype html><title>HTTP fixture</title>",
  );
  child = fork(resolve("tests/helpers/germany-router.mjs"), {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const routerUrl = await new Promise<string>((done, reject) => {
    child.once("message", (m: { origin: string }) => done(m.origin));
    child.once("error", reject);
  });
  c = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: resolve(dir, "save"),
    secure: false,
    trustedProxies: [],
    geodataDir,
    routerUrl,
  };
  mkdirSync(c.dataDir);
  await start();
  const owner = await app!.auth.create(
    "germany-owner",
    password,
    "Disponent",
    "Leitstelle A",
  );
  await app!.auth.create("germany-other", password, "Fremde", "Leitstelle B");
  let s = app!.db.all().get(owner)!;
  s.money = 2000000;
  s.xp = f.xpForLevel(30);
  s.missionWait = 100000;
  f.apply(s, {
    type: "build",
    kind: "fire",
    pos: f.project({ lon: 13.4, lat: 52.52 }),
  });
  f.tick(s, s.time + 30, {}, false, false);
  app!.db.save(owner, s);
  const home = s.buildings[0].id;
  for (const action of [
    { type: "buy", kind: "hlf", home },
    { type: "hire", home, count: 9 },
  ] as ServerAction[])
    app!.game.command(owner, { id: crypto.randomUUID(), action });
  s = app!.db.all().get(owner)!;
  vehicle = s.vehicles[0].id;
  app!.game.command(owner, {
    id: crypto.randomUUID(),
    action: { type: "assign", vehicle },
  });
  user = await login("germany-owner");
  other = await login("germany-other");
}, 20000);
afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  await app?.close();
  app = undefined;
  if (child?.connected)
    await new Promise<void>((done) => {
      child.once("exit", () => done());
      child.send("stop");
    });
  if (dir) rmSync(dir, { recursive: true, force: true });
});
const location = () => {
  const p = f.project({ lon: 13.4009, lat: 52.5209 });
  return `x=${p.x}&y=${p.y}`;
};
function connect(session: Session, delta: boolean) {
  const socket = io(c.publicUrl, {
    autoConnect: false,
    reconnection: false,
    transports: ["websocket"],
    extraHeaders: { Origin: c.publicUrl, Cookie: session.cookie },
    auth: {
      csrf: session.csrf,
      mode: "multi",
      ...(delta ? { routeSnapshots: 1 } : {}),
    },
  });
  sockets.push(socket);
  const frames: (RouteSnapshotFrame<View> | View)[] = [],
    waiting: ((frame: RouteSnapshotFrame<View> | View) => void)[] = [];
  socket.on("snapshot", (frame: RouteSnapshotFrame<View> | View) => {
    const next = waiting.shift();
    if (next) next(frame);
    else frames.push(frame);
  });
  const next = () =>
    new Promise<RouteSnapshotFrame<View> | View>((done, reject) => {
      const old = frames.shift();
      if (old) return done(old);
      const timeout = setTimeout(
        () => reject(Error("Socket-Snapshot nicht angekommen.")),
        6000,
      );
      waiting.push((frame) => {
        clearTimeout(timeout);
        done(frame);
      });
    });
  socket.connect();
  return { socket, next };
}
async function routerMode(mode: string) {
  await new Promise<void>((done) => {
    child.once("message", () => done());
    child.send({ mode });
  });
}
function waterGeneration() {
  const save = app!.db.all().get(user.id)!;
  f.apply(save, { type: "build", kind: "water", pos: tilePoint(1550, 1000) });
  const water = save.buildings.at(-1)!.id;
  f.apply(save, { type: "build", kind: "ems", pos: tilePoint(2600, 1000) });
  const ems = save.buildings.at(-1)!.id;
  f.tick(save, save.time + 30, {}, false, false);
  f.apply(save, { type: "extension", id: ems, kind: "doctor" });
  f.tick(
    save,
    Math.max(...save.buildings.map((b) => b.ready)) + 1,
    {},
    false,
    false,
  );
  for (const [kind, home] of [
    ["boat", water],
    ["gww", water],
    ["rtw", ems],
    ["nef", ems],
  ])
    f.apply(save, { type: "buy", kind, home });
  // Keep the retry inside one weather/hour weighting window. This case tests
  // routing recovery; crossing a real-time weather boundary changes the catalog draw.
  f.tick(save, Math.ceil(save.time / 900) * 900 + 120, {}, false, false);
  const available = f.capacity(save);
  const weighted = f.missions
    .filter(
      (m) =>
        m.level <= 30 &&
        Object.entries(m.requirements).every(
          ([k, n]) => (available[k] || 0) >= n,
        ),
    )
    .flatMap((m) =>
      Array.from({ length: f.weatherWeight(save, m.id) }, () => m),
    );
  for (let seed = 1; seed < 100000; seed++) {
    const next = (seed * 1664525 + 1013904223) >>> 0;
    const selected = weighted[(next >>> 16) % weighted.length];
    if (selected?.profile?.site !== "water") continue;
    save.seed = seed;
    save.missionWait = 0;
    save.nextMission = save.time;
    app!.db.save(user.id, save);
    return { seed, template: selected.id, save };
  }
  throw Error("No eligible catalog water profile in the fixture fleet.");
}
describe("Deutschland HTTP und Socket.IO (kleine synthetische Geodatenfixtures)", () => {
  it("verzögert automatische Wassereinsätze bei Routingausfall, hält Health und Fortschritt aktiv und versucht erneut", async () => {
    const { seed, template, save: before } = waterGeneration();
    await routerMode("unavailable");
    const count = (await (await fetch(c.routerUrl + "/stats")).json()).requests;
    expect(() => app!.game.step(1)).not.toThrow();
    const waiting = app!.db.all().get(user.id)!;
    expect(waiting.missions).toHaveLength(0);
    expect(waiting.seed).toBe(seed);
    expect(waiting.time).toBeGreaterThan(before.time);
    expect(waiting.missionWait).toBe(60);
    expect(waiting.nextMission).toBe(waiting.time + 60);
    expect((await (await fetch(c.routerUrl + "/stats")).json()).requests).toBe(
      count + 1,
    );
    await new Promise((done) => setTimeout(done, 1100));
    expect((await request("/api/health")).status).toBe(200);
    expect(app!.db.all().get(user.id)!.time).toBeGreaterThan(waiting.time);
    expect((await (await fetch(c.routerUrl + "/stats")).json()).requests).toBe(
      count + 1,
    );
    await routerMode("normal");
    // Advance only the router circuit clock; simulation advances through its real
    // existing persisted retry timer, without changing profile selection or seed.
    const now = Date.now() + 61000,
      clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      expect(() => app!.game.step(60, now)).not.toThrow();
    } finally {
      clock.mockRestore();
    }
    const recovered: Save = app!.db.all().get(user.id)!;
    expect(
      recovered.missions,
      JSON.stringify({
        seed: recovered.seed,
        priorSeed: seed,
        wait: recovered.missionWait,
        time: recovered.time,
        priorTime: before.time,
        environment: recovered.environment?.kind,
        priorEnvironment: before.environment?.kind,
        template,
      }),
    ).toHaveLength(1);
    expect(recovered.missions[0].template).toBe(template);
    expect((await request("/api/health")).status).toBe(200);
  }, 20000);
  it("weist ungültige Routerverträge weiterhin sichtbar zurück und rollt Game.step zurück", async () => {
    waterGeneration();
    await routerMode("invalid");
    const before = app!.db.all().get(user.id)!;
    expect(() => app!.game.step(1)).toThrow();
    const after = app!.db.all().get(user.id)!;
    expect(after.seed).toBe(before.seed);
    expect(after.time).toBe(before.time);
    expect(after.missions).toEqual(before.missions);
  });
  it("prüft Wasserwachen am Ufer serverseitig, bucht wiederholte Käufe nur einmal und erhält sie nach Neustart", async () => {
    const shore = tilePoint(1550, 1000),
      inland = tilePoint(2600, 1000);
    const url = (p: { x: number; y: number }) =>
      `/api/geo/site?type=water&x=${p.x}&y=${p.y}`;
    expect((await request(url(shore))).status).toBe(401);
    const invalid = await request(url(inland), user);
    expect(invalid.status).toBe(200);
    expect((await invalid.json()).reason).toMatch(/Uferzugang/);
    const before = app!.db.all().get(user.id)!;
    expect(
      (
        await request("/api/action", user, {
          id: crypto.randomUUID(),
          action: { type: "build", kind: "water", pos: inland },
        })
      ).status,
    ).toBe(400);
    expect(app!.db.all().get(user.id)!.money).toBe(before.money);
    const checked = await request(url(shore), user);
    expect(checked.status).toBe(200);
    expect((await checked.json()).reason).toBeNull();
    const action = {
      id: crypto.randomUUID(),
      action: { type: "build", kind: "water", pos: shore },
    };
    expect((await request("/api/action", user, action)).status).toBe(200);
    const after = app!.db.all().get(user.id)!;
    expect(after.buildings.filter((b) => b.type === "water")).toHaveLength(1);
    expect(after.money).toBeLessThan(before.money);
    expect((await request("/api/action", user, action)).status).toBe(200);
    expect(app!.db.all().get(user.id)!.money).toBe(after.money);
    await app!.close();
    app = undefined;
    await start();
    const restored = app!.db.all().get(user.id)!;
    expect(restored.money).toBe(after.money);
    expect(restored.buildings.filter((b) => b.type === "water")).toEqual(
      after.buildings.filter((b) => b.type === "water"),
    );
  }, 20000);
  it("teilt pro Veröffentlichung den berechtigten View desselben Kontos zwischen Tabs und HTTP", async () => {
    const a = connect(user, true),
      b = connect(user, true),
      foreign = connect(other, true);
    await Promise.all([a.next(), b.next(), foreign.next()]);
    const spy = vi.spyOn(app!.game, "view");
    try {
      const response = await request("/api/action", user, {
        id: crypto.randomUUID(),
        action: { type: "favorite", id: vehicle },
      });
      expect(response.status).toBe(200);
      const view = (await response.json()) as View;
      expect(view.save.player.id).toBe(user.id);
      const matching = spy.mock.calls.filter(([actor], i) => {
        const result = spy.mock.results[i];
        return (
          actor === user.id &&
          result.type === "return" &&
          result.value.save.revision === view.save.revision
        );
      });
      expect(matching).toHaveLength(1);
      const foreignFrame = (await foreign.next()) as RouteSnapshotFrame<View>;
      expect(foreignFrame.snapshot.save.player.id).toBe(other.id);
      expect(foreignFrame.snapshot.save.vehicles).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
  it("belastet mit DEM-Kachelanfragen nicht das Kontingent der Ortssuche", async () => {
    const statuses = await Promise.all(
      Array.from({ length: 125 }, async () => {
        const response = await request("/geo/dem/2/2/1.png");
        await response.arrayBuffer();
        return response.status;
      }),
    );
    // This fixture has no DEM. Missing map assets remain 404, not rate-limited search requests.
    expect(statuses.every((status) => status === 404)).toBe(true);
    const search = await request("/geo/search?q=Berlin");
    expect(search.status).toBe(200);
    expect((await search.json())[0].name).toBe("Berlin");
  }, 20000);
  it("liefert öffentliche Geodaten ohne Spielerdaten und schützt spielbezogene Karten-APIs", async () => {
    const manifestResponse = await request("/geo/manifest"),
      manifest = await manifestResponse.json();
    expect(manifestResponse.status).toBe(200);
    expect(manifest.dataset).toBe(dataset);
    expect(JSON.stringify(manifest)).not.toContain(user.id);
    expect(manifest).not.toHaveProperty("dir");
    const result = await (await request("/geo/search?q=Berlin")).json();
    expect(result[0].name).toBe("Berlin");
    expect(JSON.stringify(result)).not.toContain(vehicle);
    const tile = await request("/geo/tiles/2/2/1.pbf");
    expect(tile.status).toBe(200);
    expect(await tile.text()).toBe("synthetic vector transport fixture");
    expect((await request("/geo/tiles/2/2/1.pbf?dataset=wrong")).status).toBe(
      409,
    );
    for (const endpoint of ["site", "approach", "hospitals"])
      expect(
        (await request(`/api/geo/${endpoint}?${location()}&vehicle=${vehicle}`))
          .status,
      ).toBe(401);
    expect((await request(`/api/geo/site?${location()}`, user)).status).toBe(
      200,
    );
    expect(
      (
        await request(
          `/api/geo/approach?${location()}&vehicle=${vehicle}`,
          user,
        )
      ).status,
    ).toBe(200);
    const hospitals = await (
      await request(`/api/geo/hospitals?${location()}&vehicle=${vehicle}`, user)
    ).json();
    expect(hospitals.options[0].id).toBe("public:way:11");
    expect(hospitals.options[0].name).toBe("Testklinik");
    expect((await request("/api/geo/site?x=Infinity&y=1", user)).status).toBe(
      400,
    );
    expect(
      (
        await request(
          `/api/geo/approach?${location()}&vehicle=${vehicle}&mission=foreign-mission`,
          user,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/api/geo/approach?${location()}&vehicle=${vehicle}`,
          other,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/api/geo/hospitals?${location()}&vehicle=${vehicle}`,
          other,
        )
      ).status,
    ).toBe(403);
  }, 20000);
  it("erlaubt berechtigte Disponenten derselben Leitstelle und lehnt den ausgeschalteten Einzelspielermodus ab", async () => {
    app!.game.command(user.id, {
      id: crypto.randomUUID(),
      action: { type: "member-invite", username: "germany-other" },
    });
    app!.game.command(other.id, {
      id: crypto.randomUUID(),
      action: { type: "member-accept", owner: user.id },
    });
    expect(
      (
        await request(
          `/api/geo/approach?${location()}&vehicle=${vehicle}`,
          other,
        )
      ).status,
    ).toBe(200);
    const before = app!.db.all().get(user.id)!.vehicles[0].favorite;
    expect(
      (
        await request(
          "/api/action",
          other,
          {
            id: crypto.randomUUID(),
            action: { type: "favorite", id: vehicle },
          },
          "single",
        )
      ).status,
    ).toBe(400);
    expect(app!.db.all().get(user.id)!.vehicles[0].favorite).toBe(before);
    app!.game.command(user.id, {
      id: crypto.randomUUID(),
      action: { type: "member-remove", user: other.id },
    });
    expect(
      (
        await request(
          `/api/geo/approach?${location()}&vehicle=${vehicle}`,
          other,
        )
      ).status,
    ).toBe(403);
  }, 20000);
  it("sendet initial vollständige Routendaten, danach Referenzen und nach Wiederverbindung erneut vollständig", async () => {
    const save = app!.db.all().get(user.id)!;
    // This test exercises route snapshot transport, not geographic generation.
    const mission: Mission = {
      id: crypto.randomUUID(),
      template: "field",
      pos: f.project({ lon: 13.4009, lat: 52.5209 }),
      progress: 0,
      phase: "offered",
      created: save.time,
      completed: 0,
      shared: false,
      round: crypto.randomUUID(),
      contributors: [],
      transports: [],
    };
    save.missions.push(mission);
    f.attachIncident(save, mission);
    const call = mission.control!.calls[0].id;
    f.callAction(save, mission, call, "accept", user.id);
    f.callAction(save, mission, call, "ask", user.id, "address");
    f.tick(save, save.time + 5, {}, false, false);
    f.callAction(save, mission, call, "ask", user.id, "report");
    f.callAction(save, mission, call, "end", user.id);
    f.alarm(save, mission, [vehicle], user.id, "NORMAL", "station");
    app!.db.save(user.id, save);
    const route = structuredClone(save.vehicles[0].path),
      motion = structuredClone(save.vehicles[0].journey!.motion);
    expect(route.length).toBeGreaterThan(1);
    const client = connect(user, true),
      decoder = new RouteSnapshotDecoder<View>();
    const full = (await client.next()) as RouteSnapshotFrame<View>;
    expect(full.protocol).toBe("lv-routes-1");
    expect(full.sequence).toBe(1);
    expect(Object.keys(full.routes)).toHaveLength(1);
    expect(decoder.decode(full)!.save.vehicles[0].id).toBe(vehicle);
    const delta = (await client.next()) as RouteSnapshotFrame<View>;
    expect(Object.keys(delta.routes)).toHaveLength(0);
    const restored = decoder.decode(delta)!.save.vehicles[0];
    expect(restored.path).toEqual(route);
    expect(restored.journey!.motion).toEqual(motion);
    client.socket.disconnect();
    decoder.reset();
    client.socket.connect();
    const again = (await client.next()) as RouteSnapshotFrame<View>;
    expect(again.stream).not.toBe(full.stream);
    expect(again.reset).toBe(true);
    expect(Object.keys(again.routes)).toHaveLength(1);
    expect(decoder.decode(again)!.save.vehicles[0].id).toBe(vehicle);
    const legacy = connect(other, false),
      legacyFrame = (await legacy.next()) as View;
    expect(legacyFrame).not.toHaveProperty("protocol");
    expect(legacyFrame.save.vehicles).toEqual([]);
    expect(legacyFrame.network.friends).toEqual([]);
  }, 20000);
  it("öffnet Server und Geodaten erneut und erhält Sitzung, Besitz und Kartenstand", async () => {
    const before = app!.db.all().get(user.id)!;
    await app!.close();
    app = undefined;
    await start();
    const response = await request("/api/me", user),
      state = await response.json();
    expect(response.status).toBe(200);
    expect(state.save.world).toBe("germany-1");
    expect(state.save.player.id).toBe(user.id);
    expect(state.save.buildings).toEqual(before.buildings);
    expect(
      state.save.vehicles.map((v: Record<string, unknown>) => {
        const copy = { ...v };
        delete copy.availability;
        return copy;
      }),
    ).toEqual(before.vehicles);
    expect(
      state.save.vehicles.every(
        (v: { availability?: unknown }) => !!v.availability,
      ),
    ).toBe(true);
    expect((await request("/geo/manifest")).status).toBe(200);
    expect(
      (
        await request(
          `/api/geo/approach?${location()}&vehicle=${vehicle}`,
          user,
        )
      ).status,
    ).toBe(200);
  }, 20000);
});
