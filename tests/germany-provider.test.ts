import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fork, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  LocalGermanyProvider,
  initializeGermany,
} from "../server/germany/provider";
import { RoutingBridge } from "../server/germany/bridge";
import { project, meters } from "../src/germany/projection";
import {
  adaptGraphHopperRoute,
  graphHopperRequest,
} from "../src/germany/route";
import { nodes, nearest, germanyProvider } from "../src/germany/world";

const a = project({ lon: 13.4, lat: 52.52 }),
  b = project({ lon: 13.401, lat: 52.521 });
const dataset = "a".repeat(64);
let child: ChildProcess,
  origin: string,
  dir: string,
  provider: LocalGermanyProvider | undefined;
beforeEach(async () => {
  dir = mkdtempSync(resolve(tmpdir(), "lv-germany-provider-"));
  const db = new DatabaseSync(resolve(dir, "index.sqlite"));
  db.exec(`CREATE TABLE anchors(id INTEGER PRIMARY KEY,lon REAL,lat REAL,name TEXT,road_class TEXT,bridge INTEGER,tunnel INTEGER,access TEXT);
    CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);
    CREATE VIRTUAL TABLE anchors_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat);
    CREATE TABLE places(id INTEGER PRIMARY KEY,osm_type TEXT,osm_id TEXT,kind TEXT,name TEXT,display_name TEXT,lon REAL,lat REAL,region TEXT);
    CREATE VIRTUAL TABLE places_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat);`);
  db.prepare("INSERT INTO metadata VALUES('source_sha256',?)").run(dataset);
  const insert = db.prepare("INSERT INTO anchors VALUES(?,?,?,?,?,0,0,'')"),
    index = db.prepare("INSERT INTO anchors_rtree VALUES(?,?,?,?,?)");
  for (const [id, lon, lat, name] of [
    [12345678901, 13.4, 52.52, "Teststraße"],
    [12345678902, 13.401, 52.521, "Testallee"],
  ] as const) {
    insert.run(id, lon, lat, name, "residential");
    index.run(id, lon, lon, lat, lat);
  }
  db.exec(
    "INSERT INTO places VALUES(1,'node','20','city','Berlin','Berlin',13.4,52.52,'Berlin'); INSERT INTO places_rtree VALUES(1,13.4,13.4,52.52,52.52); INSERT INTO places VALUES(2,'way','21','hospital','Testklinik','Testklinik',13.401,52.521,'Berlin'); INSERT INTO places_rtree VALUES(2,13.401,13.401,52.521,52.521);",
  );
  db.close();
  child = fork(resolve("tests/helpers/germany-router.mjs"), {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  origin = await new Promise<string>((resolve, reject) => {
    child.once("message", (message: { origin: string }) =>
      resolve(message.origin),
    );
    child.once("error", reject);
  });
});
afterEach(async () => {
  await provider?.close();
  provider = undefined;
  if (child?.connected)
    await new Promise<void>((done) => {
      child.once("exit", () => done());
      child.send("stop");
    });
  rmSync(dir, { recursive: true, force: true });
});
const options = () => ({
  indexPath: resolve(dir, "index.sqlite"),
  dataset,
  routerUrl: origin,
});
const setMode = (mode: string) =>
  new Promise<void>((done) => {
    child.once("message", () => done());
    child.send({ mode });
  });

describe("Germany provider contract (synthetic API fixtures, not nationwide geographic acceptance)", () => {
  it("accepts the captured GH11 zero-route response without inventing an edge", () => {
    const raw = JSON.parse(
      readFileSync(
        resolve("tests/fixtures/germany-graphhopper-zero-route.json"),
        "utf8",
      ),
    );
    const route = adaptGraphHopperRoute(raw, dataset);
    expect(route).toMatchObject({ meters: 0, routerSeconds: 0, legs: [] });
    expect(route.path).toHaveLength(1);
    raw.paths[0].distance = 100;
    expect(() => adaptGraphHopperRoute(raw, dataset)).toThrow();
  });
  it("retains the OSM hospital location and rejects a road access more than 300 meters away", async () => {
    const index = new DatabaseSync(resolve(dir, "index.sqlite"));
    index.exec(
      "INSERT INTO places VALUES(3,'way','22','hospital','Entfernte Klinik','Entfernte Klinik',13.4,52.53,'Berlin'); INSERT INTO places_rtree VALUES(3,13.4,13.4,52.53,52.53)",
    );
    index.close();
    provider = await initializeGermany(options());
    const hospitals = provider.hospitals(a, 5);
    expect(hospitals.map((hospital) => hospital.id)).toEqual(["way:21"]);
    expect(hospitals[0].osmLocation).toEqual(b);
    expect(meters(hospitals[0], hospitals[0].osmLocation!)).toBeLessThanOrEqual(
      300,
    );
  });
  it("keeps finite vehicle-limited speeds when the road has no encoded statutory limit", async () => {
    const response = await fetch(origin + "/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        graphHopperRequest(
          { lon: 13.4, lat: 52.52 },
          { lon: 13.401, lat: 52.521 },
          45,
        ),
      ),
    });
    const raw = await response.json();
    for (const unknown of [null, Infinity]) {
      raw.paths[0].details.max_speed = [[0, 2, unknown]];
      const route = adaptGraphHopperRoute(raw, dataset, 45);
      expect(route.legs.map((leg) => leg.legalLimit)).toEqual([null, null]);
      expect(route.legs.map((leg) => leg.limit)).toEqual([30, 45]);
      expect(route.legs[1].waitSeconds).toBeCloseTo(5, 4);
      expect(Number.isFinite(route.routerSeconds)).toBe(true);
    }
  });
  it("accepts GraphHopper road-environment enum values with either JSON casing", async () => {
    const response = await fetch(origin + "/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        graphHopperRequest(
          { lon: 13.4, lat: 52.52 },
          { lon: 13.401, lat: 52.521 },
          120,
        ),
      ),
    });
    const raw = await response.json();
    for (const [bridge, tunnel] of [
      ["bridge", "tunnel"],
      ["BRIDGE", "TUNNEL"],
    ]) {
      raw.paths[0].details.road_environment = [
        [0, 1, bridge],
        [1, 2, tunnel],
      ];
      const route = adaptGraphHopperRoute(raw, dataset);
      expect(route.legs[0]).toMatchObject({ bridge: true, tunnel: false });
      expect(route.legs[1]).toMatchObject({ bridge: false, tunnel: true });
    }
  });
  it("memoizes repeated spatial lookups without rereading SQLite or exposing its cached array", async () => {
    provider = await initializeGermany(options());
    const reads = vi.spyOn(DatabaseSync.prototype, "prepare");
    try {
      expect(provider.nearest(a).id).toBe(12345678901);
      const initial = reads.mock.calls.length;
      for (let i = 0; i < 100; i++)
        expect(provider.nearest(a).id).toBe(12345678901);
      expect(reads.mock.calls.length).toBe(initial);
      const sites = provider.querySites(a, 100, 20),
        afterSites = reads.mock.calls.length;
      sites.length = 0;
      for (let i = 0; i < 100; i++)
        expect(provider.querySites(a, 100, 20)).toHaveLength(2);
      expect(reads.mock.calls.length).toBe(afterSites);
    } finally {
      reads.mockRestore();
    }
  });
  it("rejects a mismatched data fingerprint without writing the imported SQLite index", () => {
    const path = resolve(dir, "index.sqlite"),
      before = readFileSync(path);
    expect(
      () => new LocalGermanyProvider({ ...options(), dataset: "b".repeat(64) }),
    ).toThrow("Geodatenkonflikt");
    expect(readFileSync(path)).toEqual(before);
  });
  it("resolves sparse stable OSM IDs and real index search without allocating a country array", async () => {
    provider = await initializeGermany(options());
    expect(nearest(a)).toBe(12345678901);
    expect(nodes[12345678901]).toMatchObject(a);
    expect(nodes.length).toBe(0);
    expect(provider.querySites(a, 100, 20).map((p) => p.id)).toEqual([
      12345678901, 12345678902,
    ]);
    expect(provider.districtAt(a)).toBe("Berlin");
    expect(provider.addressAt(a)).toBe("Teststraße, Berlin");
    expect(provider.hospitals(a, 1)[0].name).toBe("Testklinik");
  });
  it("keeps section identity, legal speed, geometry distance and turn cost from the route response", async () => {
    provider = await initializeGermany(options());
    const path = provider.route(a, b, "road", new Set(), 120, new Map(), 1);
    const first = provider.sectionBetween(path[0], path[1]),
      last = provider.sectionBetween(path[1], path[2]);
    expect(first.id).toBe(`gh:${dataset}:12`);
    expect(last.id).toBe(`gh:${dataset}:13`);
    expect(first.limit).toBe(30);
    expect(last.limit).toBe(60);
    expect(last.bridge).toBe(true);
    expect(last.waitSeconds).toBeCloseTo(5, 4);
    expect(first.meters + last.meters).toBeCloseTo(meters(a, b), 3);
    expect(() => provider!.sectionBetween(path[1], path[0])).toThrow(
      "Exakte Straßenabschnittsdaten fehlen",
    );
    const slower = provider.route(a, b, "road", new Set(), 45, new Map(), 1);
    expect(slower).toEqual(path);
    expect(provider.sectionBetween(slower[1], slower[2])).toMatchObject({
      limit: 45,
      waitSeconds: last.waitSeconds,
    });
    const road = provider.projectRoad(a);
    expect(road.section.id).toBe(`gh:${dataset}:12`);
  });
  it("fails closed for blocked real edges and unavailable waterways without an air fallback", async () => {
    provider = await initializeGermany(options());
    expect(() =>
      provider!.route(
        a,
        b,
        "road",
        new Set([`gh:${dataset}:13`]),
        120,
        new Map(),
        1,
      ),
    ).toThrow("gesperrten");
    expect(() =>
      provider!.route(a, b, "water", new Set(), 120, new Map(), 1),
    ).toThrow("schiffbare");
    await setMode("unreachable");
    expect(() =>
      provider!.route(b, a, "road", new Set(), 90, new Map(), 1),
    ).toThrow("Connection not found");
  });
  it("reuses bounded route results but preserves stable IDs after reopening the index", async () => {
    provider = await initializeGermany(options());
    const path = provider.route(a, b, "road", new Set(), 120, new Map(), 1),
      before = provider.sectionBetween(path[0], path[1]);
    await setMode("unreachable");
    expect(provider.route(a, b, "road", new Set(), 120, new Map(), 1)).toEqual(
      path,
    );
    await provider.close();
    expect(() => germanyProvider()).toThrow("noch nicht verfügbar");
    await setMode("normal");
    provider = await initializeGermany(options());
    const restored = provider.route(a, b, "road", new Set(), 120, new Map(), 1);
    expect(provider.node(12345678901)).toMatchObject(a);
    expect(provider.sectionBetween(restored[0], restored[1])).toEqual(before);
  });
  it("bounds a hung local HTTP request while its worker event loop remains separate", async () => {
    await setMode("timeout");
    const bridge = new RoutingBridge(origin, 150);
    const start = performance.now();
    try {
      expect(() => bridge.request("/route", {})).toThrow();
      expect(performance.now() - start).toBeLessThan(1000);
    } finally {
      await bridge.close();
    }
  });
  it("rejects remote router endpoints and contradictory geometry", () => {
    expect(() => new RoutingBridge("https://example.com")).toThrow(
      "lokale HTTP",
    );
    expect(() =>
      adaptGraphHopperRoute(
        {
          paths: [
            {
              distance: 100000,
              time: 100,
              points: { type: "LineString", coordinates: [[13.4, 52.52]] },
              details: {},
            },
          ],
        },
        "fixture",
      ),
    ).toThrow("Straßenlänge");
  });
});
