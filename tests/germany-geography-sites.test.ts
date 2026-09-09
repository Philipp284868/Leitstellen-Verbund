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
import { pathToFileURL } from "node:url";
import type * as LocationFixture from "./helpers/incident-location-fixture";
import type { Save } from "../src/model";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fork, type ChildProcess } from "node:child_process";
import { GermanyIncidentGeography } from "../server/germany/geography-sites";
import { LocalGermanyProvider } from "../server/germany/provider";
import { RoutingBridge } from "../server/germany/bridge";
import { GermanyRoutingError } from "../src/germany/errors";
import { unproject } from "../src/germany/projection";
import type { IncidentSiteKind } from "../src/germany/world";
import {
  createMap,
  encodeTile,
  fixtureDataset,
  rectangle,
  tile,
  tilePoint,
  type TileFeature,
} from "./helpers/geography-tile";

let dir: string,
  geography: GermanyIncidentGeography | undefined,
  provider: LocalGermanyProvider | undefined,
  child: ChildProcess | undefined;
let locations: typeof LocationFixture;
beforeAll(async () => {
  const outfile = resolve(`.tools/incident-location-${process.pid}.mjs`);
  await build({
    entryPoints: ["tests/helpers/incident-location-fixture.ts"],
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
  locations = await import(pathToFileURL(outfile).href);
});
beforeEach(() => {
  dir = mkdtempSync(resolve(tmpdir(), "lv-site-geography-"));
});
afterEach(async () => {
  geography?.close();
  geography = undefined;
  if (provider) locations.clearGermanyProvider(provider);
  await provider?.close();
  provider = undefined;
  if (child?.connected)
    await new Promise<void>((done) => {
      child!.once("exit", () => done());
      child!.send("stop");
    });
  child = undefined;
  rmSync(dir, { recursive: true, force: true });
});
function open(features: TileFeature[]) {
  const path = resolve(dir, "maps.mbtiles");
  createMap(path, features);
  geography = new GermanyIncidentGeography(path, fixtureDataset);
  return geography;
}
const area = (
  layer: string,
  featureClass: string,
  parts = [rectangle(500, 500, 1500, 1500)],
): TileFeature => ({
  layer,
  properties: { class: featureClass },
  type: 3,
  parts,
});

describe("incident locations from local OSM MVT evidence", () => {
  it("rejects excessive geometry commands before allocating decoded coordinate arrays", () => {
    const geo = open([
      {
        layer: "landcover",
        properties: { class: "wood" },
        type: 2,
        parts: [
          Array.from({ length: 250001 }, (_, i): [number, number] => [
            1000 + (i % 10),
            1000,
          ]),
        ],
      },
    ]);
    expect(() => geo.evidence(tilePoint(1000, 1000), "forest")).toThrow(
      /Geometriebudget/,
    );
  });
  it.each<[Exclude<IncidentSiteKind, "street" | "water">, string, string]>([
    ["residential", "landuse", "residential"],
    ["commercial", "landuse", "commercial"],
    ["industrial", "landuse", "industrial"],
    ["forest", "landcover", "wood"],
    ["field", "landcover", "farmland"],
    ["rail", "landuse", "railway"],
    ["public", "landuse", "school"],
    ["construction", "landuse", "construction"],
  ])(
    "requires actual %s geometry and rejects an arbitrary urban road",
    (kind, layer, featureClass) => {
      const geo = open([area(layer, featureClass)]);
      expect(geo.evidence(tilePoint(1000, 1000), kind)).toEqual({
        reference: expect.stringMatching(/^tile:14\/[0-9]+\/[0-9]+:/),
        layer,
        featureClass,
        distanceMeters: 0,
      });
      expect(geo.evidence(tilePoint(3000, 3000), kind)).toBeUndefined();
      expect(
        geo.evidence(
          tilePoint(1000, 1000),
          kind === "forest" ? "industrial" : "forest",
        ),
      ).toBeUndefined();
    },
  );
  it("accepts a genuine landward shore, rejects a lake interior, and preserves polygon islands", () => {
    const geo = open([
      area("water", "lake", [
        rectangle(500, 500, 1500, 1500),
        rectangle(900, 900, 1100, 1100).reverse(),
      ]),
    ]);
    expect(
      geo.evidence(tilePoint(1550, 1000), "water")?.distanceMeters,
    ).toBeGreaterThan(2);
    expect(
      geo.evidence(tilePoint(1550, 1000), "water")?.distanceMeters,
    ).toBeLessThan(60);
    expect(geo.evidence(tilePoint(800, 1000), "water")).toBeUndefined();
    expect(geo.evidence(tilePoint(1000, 1000), "water")).toMatchObject({
      layer: "water",
      featureClass: "lake",
    });
    expect(geo.evidence(tilePoint(3000, 1000), "water")).toBeUndefined();
  });
  it("does not treat clipped tile boundaries through water as a shoreline", () => {
    const geo = open([
      area("water", "lake", [rectangle(3500, 500, 4096, 2500)]),
    ]);
    const db = new DatabaseSync(resolve(dir, "maps.mbtiles"));
    db.prepare("INSERT INTO tiles VALUES(?,?,?,?)").run(
      tile.z,
      tile.x + 1,
      2 ** tile.z - 1 - tile.y,
      encodeTile([area("water", "lake", [rectangle(0, 500, 1500, 2500)])]),
    );
    db.close();
    expect(geo.evidence(tilePoint(4085, 1500), "water")).toBeUndefined();
    expect(
      geo.evidence(tilePoint(20, 1500, tile.x + 1), "water"),
    ).toBeUndefined();
  });
  it("does not turn swimming pools, intermittent water or tunnel channels into open-water sites", () => {
    const geo = open([
      area("water", "swimming_pool"),
      {
        layer: "waterway",
        properties: { class: "river", brunnel: "tunnel" },
        type: 2,
        parts: [
          [
            [2000, 500],
            [2000, 1500],
          ],
        ],
      },
      {
        layer: "waterway",
        properties: { class: "river", intermittent: "1" },
        type: 2,
        parts: [
          [
            [3000, 500],
            [3000, 1500],
          ],
        ],
      },
    ]);
    for (const x of [1550, 2050, 3050])
      expect(geo.evidence(tilePoint(x, 1000), "water")).toBeUndefined();
  });
  it("uses river/rail/construction lines and public POIs without treating drains or tunnels as usable shores", () => {
    const geo = open([
      {
        layer: "waterway",
        properties: { class: "river" },
        type: 2,
        parts: [
          [
            [1000, 500],
            [1000, 1500],
          ],
        ],
      },
      {
        layer: "waterway",
        properties: { class: "ditch" },
        type: 2,
        parts: [
          [
            [3000, 500],
            [3000, 1500],
          ],
        ],
      },
      {
        layer: "transportation",
        properties: { class: "rail" },
        type: 2,
        parts: [
          [
            [1000, 2000],
            [2000, 2000],
          ],
        ],
      },
      {
        layer: "transportation",
        properties: { class: "minor_construction" },
        type: 2,
        parts: [
          [
            [1000, 3000],
            [2000, 3000],
          ],
        ],
      },
      {
        layer: "poi",
        properties: { class: "museum" },
        type: 1,
        parts: [[[3000, 3000]]],
      },
    ]);
    expect(geo.evidence(tilePoint(1050, 1000), "water")).toMatchObject({
      featureClass: "river",
    });
    expect(geo.evidence(tilePoint(3050, 1000), "water")).toBeUndefined();
    expect(geo.evidence(tilePoint(1500, 2050), "rail")).toMatchObject({
      featureClass: "rail",
    });
    expect(geo.evidence(tilePoint(1500, 3050), "construction")).toMatchObject({
      featureClass: "minor_construction",
    });
    expect(geo.evidence(tilePoint(3030, 3000), "public")).toMatchObject({
      layer: "poi",
    });
  });
  it("rejects mismatched datasets and oversized compressed tiles before reading their BLOB", () => {
    const path = resolve(dir, "maps.mbtiles");
    createMap(path, []);
    expect(() => new GermanyIncidentGeography(path, "b".repeat(64))).toThrow(
      /OSM-Datenständen/,
    );
    const db = new DatabaseSync(path);
    db.exec("UPDATE tiles SET tile_data=zeroblob(4194305)");
    db.close();
    geography = new GermanyIncidentGeography(path, fixtureDataset);
    expect(() => geography!.evidence(tilePoint(1000, 1000), "water")).toThrow(
      /Lesegröße/,
    );
  });
  it("caches repeated spatial evidence, bounds tile memory, and gives the same evidence after reopen", () => {
    const geo = open([area("landcover", "wood")]);
    const evidence = geo.evidence(tilePoint(1000, 1000), "forest"),
      reads = geo.diagnostics().reads;
    for (let i = 0; i < 100; i++)
      expect(geo.evidence(tilePoint(1000, 1000), "forest")).toEqual(evidence);
    expect(geo.diagnostics().reads).toBe(reads);
    for (let i = 0; i < 150; i++)
      geo.evidence(tilePoint(1000, 1000, tile.x + i), "forest");
    expect(geo.diagnostics().tiles).toBeLessThanOrEqual(96);
    expect(geo.diagnostics().estimatedBytes).toBeLessThanOrEqual(
      48 * 1024 * 1024,
    );
    geo.close();
    geography = new GermanyIncidentGeography(
      resolve(dir, "maps.mbtiles"),
      fixtureDataset,
    );
    expect(geography.evidence(tilePoint(1000, 1000), "forest")).toEqual(
      evidence,
    );
  });
});

async function startProvider() {
  createMap(resolve(dir, "maps.mbtiles"), [
    area("water", "lake"),
    area("landuse", "residential", [rectangle(2400, 800, 2800, 1200)]),
  ]);
  const db = new DatabaseSync(resolve(dir, "index.sqlite"));
  db.exec(
    "CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE anchors(id INTEGER PRIMARY KEY,lon REAL,lat REAL,name TEXT,road_class TEXT,bridge INTEGER,tunnel INTEGER,access TEXT); CREATE VIRTUAL TABLE anchors_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat); CREATE TABLE places(id INTEGER PRIMARY KEY,lon REAL,lat REAL); CREATE VIRTUAL TABLE places_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat);",
  );
  db.prepare("INSERT INTO metadata VALUES('source_sha256',?)").run(
    fixtureDataset,
  );
  for (const [id, x, y, bridge, tunnel, road] of [
    [1, 1550, 1000, 0, 0, "residential"],
    [2, 1550, 1200, 1, 0, "residential"],
    [3, 1550, 800, 0, 1, "residential"],
    [4, 1550, 1300, 0, 0, "motorway"],
    [5, 2600, 1000, 0, 0, "residential"],
  ] as const) {
    const { lon, lat } = unproject(tilePoint(x, y));
    db.prepare("INSERT INTO anchors VALUES(?,?,?,?,?,?,?,?)").run(
      id,
      lon,
      lat,
      `Standort ${id}`,
      road,
      bridge,
      tunnel,
      "",
    );
    db.prepare("INSERT INTO anchors_rtree VALUES(?,?,?,?,?)").run(
      id,
      lon,
      lon,
      lat,
      lat,
    );
  }
  db.close();
  child = fork(resolve("tests/helpers/germany-router.mjs"), {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const origin = await new Promise<string>((done, reject) => {
    child!.once("message", (m: { origin: string }) => done(m.origin));
    child!.once("error", reject);
  });
  provider = new LocalGermanyProvider({
    indexPath: resolve(dir, "index.sqlite"),
    mapsPath: resolve(dir, "maps.mbtiles"),
    dataset: fixtureDataset,
    routerUrl: origin,
  });
  return { origin, center: tilePoint(2600, 1000) };
}
const mode = (name: string) =>
  new Promise<void>((done) => {
    child!.once("message", () => done());
    child!.send({ mode: name });
  });
describe("provider incident access integration", () => {
  it("verifies dataset-backed access and actual bounded road profiles before publishing German incident candidates", async () => {
    const { center } = await startProvider();
    locations.installGermanyProvider(provider!);
    locations.clearReachabilityCache();
    const s = locations.fresh("Dispatcher", "Region", 10);
    s.buildings = [
      {
        id: "home",
        owner: s.player.id,
        type: "fire",
        name: "Test",
        pos: center,
        ready: 0,
        level: 1,
        extensions: [],
      },
    ];
    s.vehicles = [
      {
        id: "unit",
        owner: s.player.id,
        home: "home",
        type: "hlf",
        name: "HLF",
        favorite: false,
        status: "ready",
        mission: null,
        assignment: null,
        path: [center],
        depart: 0,
        arrive: 0,
        patients: 0,
      },
    ];
    const template = locations.missions.find((t) => t.id === "bin")!;
    const points = locations.generationLocations(s, template)!;
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      const proof = locations.verifyIncidentLocation(s, template, p)!;
      expect(proof.dataset).toBe(fixtureDataset);
      expect(proof.siteRef).toMatch(/osm-anchor:/);
      expect(proof.roadRef).toBeTruthy();
      expect(proof.driveSeconds).toBeLessThanOrEqual(900);
      expect(proof.profiles).toEqual(["hlf"]);
    }
    expect(
      locations.verifyIncidentLocation(s, template, { x: 0, y: 0 }),
    ).toBeUndefined();
  });
  it("shares one routing deadline across consecutive unreachable shoreline candidates", async () => {
    const { center } = await startProvider();
    const index = new DatabaseSync(resolve(dir, "index.sqlite"));
    for (const [id, y] of [
      [6, 650],
      [7, 1450],
    ]) {
      const { lon, lat } = unproject(tilePoint(1550, y));
      index
        .prepare("INSERT INTO anchors VALUES(?,?,?,?,?,0,0,'')")
        .run(id, lon, lat, "Ufer", "service");
      index
        .prepare("INSERT INTO anchors_rtree VALUES(?,?,?,?,?)")
        .run(id, lon, lon, lat, lat);
    }
    index.close();
    let elapsed = 0;
    const budgets: number[] = [];
    const clock = vi
      .spyOn(performance, "now")
      .mockImplementation(() => elapsed);
    const route = vi
      .spyOn(RoutingBridge.prototype, "request")
      .mockImplementation((_path, _body, budget) => {
        budgets.push(budget!);
        elapsed += 1500;
        throw new GermanyRoutingError("Connection not found", "no-route");
      });
    try {
      expect(() =>
        provider!.queryIncidentSites(center, 200, "water", 10),
      ).toThrow(/gemeinsame Zeitgrenze/);
      expect(budgets).toEqual([3000, 1500]);
    } finally {
      clock.mockRestore();
      route.mockRestore();
    }
  });
  it("passes actual catalog site kinds to the production location selector and never falls back to arbitrary roads", async () => {
    const { center } = await startProvider();
    locations.installGermanyProvider(provider!);
    const query = vi.spyOn(provider!, "queryIncidentSites"),
      road = vi.spyOn(provider!, "querySites");
    for (const kind of [
      "residential",
      "commercial",
      "industrial",
      "forest",
      "field",
      "rail",
      "public",
      "water",
      "construction",
    ] as const) {
      const template = locations.missions.find(
        (m) => m.profile?.site === kind,
      )!;
      expect(template, `Catalog template for ${kind}`).toBeDefined();
      const unitType = locations.vehicles.find((v) =>
        Object.keys(v.skills).some((k) => template.requirements[k]),
      )!;
      // incidentLocations reads only these fleet coverage fields; simulation lifecycle
      // and schema persistence are exercised by germany-simulation/HTTP tests.
      const save = {
        ...locations.fresh("Dispatcher", "Region", 10),
        buildings: [{ id: "home", pos: center, ready: 0 }],
        vehicles: [{ type: unitType.id, home: "home" }],
      } as Save;
      const selected = locations.incidentLocations(save, template);
      expect(query).toHaveBeenLastCalledWith(center, 180, kind, 32);
      if (kind === "water" || kind === "residential") {
        const expected = kind === "water" ? tilePoint(1550, 1000) : center;
        expect(selected).toHaveLength(1);
        expect(selected[0].x).toBeCloseTo(expected.x, 9);
        expect(selected[0].y).toBeCloseTo(expected.y, 9);
      } else expect(selected).toEqual([]);
    }
    expect(road).not.toHaveBeenCalled();
  });
  it("validates water station construction on the server and rejects arbitrary streets or bridge sites", async () => {
    await startProvider();
    expect(provider!.isWaterSite(tilePoint(1550, 1000))).toBe(true);
    expect(provider!.isWaterSite(tilePoint(2600, 1000))).toBe(false);
    expect(provider!.isWaterSite(tilePoint(1550, 1200))).toBe(false);
    expect(provider!.isWaterSite(tilePoint(1550, 800))).toBe(false);
    expect(provider!.isWaterSite(tilePoint(1550, 1300))).toBe(false);
    expect(provider!.isWaterSite(tilePoint(1500, 1000))).toBe(false);
  });
  it("uses connected road-side shores, excludes bridge/tunnel/motorway candidates and caches routes", async () => {
    const { center, origin } = await startProvider();
    expect(
      provider!.queryIncidentSites(center, 200, "water", 10).map((a) => a.id),
    ).toEqual([1]);
    expect(
      provider!
        .queryIncidentSites(center, 200, "residential", 10)
        .map((a) => a.id),
    ).toEqual([5]);
    expect(provider!.queryIncidentSites(center, 200, "forest", 10)).toEqual([]);
    expect(
      provider!.queryIncidentSites(center, 200, "street", 10),
    ).toHaveLength(5);
    const count = (await (await fetch(origin + "/stats")).json()).requests;
    const copy = provider!.queryIncidentSites(center, 200, "water", 10);
    copy.length = 0;
    expect(provider!.queryIncidentSites(center, 200, "water", 10)).toHaveLength(
      1,
    );
    expect((await (await fetch(origin + "/stats")).json()).requests).toBe(
      count,
    );
  });
  it("does not invent access to an unreachable shore", async () => {
    const { center } = await startProvider();
    await mode("unreachable");
    expect(provider!.queryIncidentSites(center, 200, "water", 10)).toEqual([]);
  });
  it("does not cache routing outages as permanent geographic absence", async () => {
    const { center } = await startProvider();
    await mode("unavailable");
    expect(() =>
      provider!.queryIncidentSites(center, 200, "water", 10),
    ).toThrow();
    await mode("normal");
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60001);
    try {
      expect(
        provider!.queryIncidentSites(center, 200, "water", 10),
      ).toHaveLength(1);
    } finally {
      clock.mockRestore();
    }
  });
});
