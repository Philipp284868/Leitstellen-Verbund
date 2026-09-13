import { afterEach, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { WaterGeography } from "../src/server/germany/water-geography";
import { prepareWaterIndex } from "../src/server/germany/water-index";
import { germanyProvider, type Anchor } from "../src/shared/germany/world";
import {
  meters,
  unproject,
  METERS_PER_UNIT,
} from "../src/shared/germany/projection";
import type { WaterArea, WaterSource } from "../src/shared/germany/water";
import { sites } from "./fixtures/germany/locations";
import { Database } from "../src/server/database";
import { SharedWater } from "../src/server/infrastructure/water";
const cleanups: (() => void)[] = [];
it("berechnet Kartenquellen in abbrechbaren Zeitscheiben und bewahrt dieselben Quellen wie die Simulation", async () => {
  const water = geography("center"),
    point = sites[0];
  let serviced = false;
  const next = new Promise<void>((resolve) =>
    setImmediate(() => {
      serviced = true;
      resolve();
    }),
  );
  const sources = await water.mapQuery(point, 1500, 1000);
  await next;
  expect(serviced).toBe(true);
  expect(sources).toEqual(water.query(point, 1500, 1000));
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    water.mapQuery(point, 1000, 1000, cancelled.signal),
  ).rejects.toThrow();
  // Empty countryside cells must yield too, so closing a large rural view stops work.
  const rural = geography("unbuilt"),
    during = new AbortController();
  setImmediate(() => during.abort());
  await expect(
    rural.mapQuery(point, 9000, 1000, during.signal),
  ).rejects.toThrow();
});
afterEach(() => {
  for (const cleanup of cleanups.reverse()) cleanup();
  cleanups.length = 0;
});
function geography(area: WaterArea, blocked = false, index?: string) {
  const center = sites[0],
    cell = 180 / METERS_PER_UNIT,
    anchors: Anchor[] = [];
  for (let dx = -12; dx <= 12; dx++)
    for (let dy = -12; dy <= 12; dy++)
      anchors.push({
        x: (Math.floor(center.x / cell) + dx + 0.5) * cell,
        y: (Math.floor(center.y / cell) + dy + 0.5) * cell,
        id: anchors.length,
        name: "Fixture-Straße",
        roadClass: blocked ? "motorway" : "residential",
      });
  const base = germanyProvider();
  const provider = {
    ...base,
    waterEnvironment: () => ({
      area,
      blocked,
      buildings: area === "center" ? 80 : 3,
      roadClass: "residential",
      reference: `fixture:${area}`,
    }),
    nearest: (p: typeof center) =>
      anchors.reduce((a, b) => (meters(a, p) < meters(b, p) ? a : b)),
    querySites: (p: typeof center, r: number, n: number) =>
      anchors.filter((a) => meters(a, p) <= r * METERS_PER_UNIT).slice(0, n),
  };
  const water = new WaterGeography(provider, () => !blocked, index);
  cleanups.push(() => water.close());
  return water;
}
it("erzeugt ein deterministisches dichtes Stadt-, dünneres Dorf- und lückenhaftes Hofnetz ohne Quellen auf unbebautem Land", () => {
  const counts: Record<string, number> = {};
  for (const area of [
    "center",
    "residential",
    "industrial",
    "village",
    "farm",
    "unbuilt",
    "unknown",
  ] as WaterArea[]) {
    const water = geography(area),
      points = water.query(sites[0], 1500, 1000);
    counts[area] = points.length;
    expect(water.query(sites[0], 1500, 1000)).toEqual(points);
    expect(geography(area).query(sites[0], 1500, 1000)).toEqual(points);
    expect(
      points.every(
        (p) =>
          p.origin === "simulation-v1" &&
          p.id.startsWith("sim:") &&
          p.area === area,
      ),
    ).toBe(true);
    const overlapping = water.query(
      { ...sites[0], x: sites[0].x + 20 },
      1000,
      1000,
    );
    for (const p of overlapping.filter((p) => meters(p.pos, sites[0]) < 1400))
      expect(points.find((old) => old.id === p.id)).toEqual(p);
    expect(new Set(points.map((p) => p.id)).size).toBe(points.length);
  }
  expect(counts.center).toBeGreaterThan(counts.residential);
  expect(counts.industrial).toBeGreaterThan(counts.village);
  expect(counts.village).toBeGreaterThan(counts.farm);
  expect(counts.farm).toBeGreaterThan(0);
  expect(counts.unbuilt).toBe(0);
  expect(counts.unknown).toBe(0);
  expect(geography("center", true).query(sites[0], 1500, 1000)).toEqual([]);
});
it("erhält reale Quelle, Quellattribute und Datenstand ohne simulierte Doppelquelle; Paketindex wird wiederverwendet", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "lv-water-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const dataset = germanyProvider().dataset,
    archive = resolve(dir, "water.gz"),
    p = unproject(sites[0]);
  writeFileSync(
    archive,
    gzipSync(
      JSON.stringify({
        schema: 1,
        sourceSha256: dataset,
        snapshot: "2026-09-07",
      }) +
        "\n" +
        JSON.stringify({
          id: "node:123",
          ...p,
          properties: {
            emergency: "fire_hydrant",
            "fire_hydrant:type": "underground",
          },
        }) +
        "\n",
    ),
  );
  const path = await prepareWaterIndex(archive, dir, dataset);
  expect(await prepareWaterIndex(archive, dir, dataset)).toBe(path);
  const water = geography("center", false, path),
    points = water.query(sites[0], 800, 1000),
    real = points.find((p) => p.id === "osm:node:123")!;
  expect(real).toMatchObject({
    origin: "openstreetmap",
    snapshot: "2026-09-07",
    dataset,
    flowSource: "simulation-v1",
    properties: { "fire_hydrant:type": "underground" },
  });
  expect(
    points.filter(
      (p) => p.origin === "simulation-v1" && meters(p.pos, real.pos) < 130,
    ),
  ).toEqual([]);
  expect(water.connection(real, sites[1])?.path.at(-1)).toEqual(sites[1]);
});
it("weist eine Einspeisung als Hydrantenpaket zurück statt sie als Wasserquelle zu erfinden", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "lv-water-invalid-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const dataset = germanyProvider().dataset,
    archive = resolve(dir, "bad.gz");
  writeFileSync(
    archive,
    gzipSync(
      JSON.stringify({
        schema: 1,
        sourceSha256: dataset,
        snapshot: "2026-09-07",
      }) +
        "\n" +
        JSON.stringify({
          id: "node:1",
          ...unproject(sites[0]),
          properties: { emergency: "dry_riser_inlet" },
        }) +
        "\n",
    ),
  );
  await expect(prepareWaterIndex(archive, dir, dataset)).rejects.toThrow(
    /Keine freigegebene/,
  );
});
it("teilt endliche Liter pro Minute zwischen Leitstellen, verhindert Doppelentnahme und erhält sie nach Datenbankneustart", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "lv-water-flow-"));
  let db = new Database(dir);
  cleanups.push(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const source: WaterSource = {
    id: "osm:water",
    pos: sites[0],
    access: sites[0],
    kind: "hydrant",
    origin: "openstreetmap",
    snapshot: "fixture",
    dataset: germanyProvider().dataset,
    area: "village",
    flowLpm: 600,
    flowSource: "simulation-v1",
    properties: {},
    quality: [],
  };
  let service = new SharedWater(db.sql, () => 2),
    a = 0,
    b = 0;
  for (let t = 1000; t < 1030; t++) {
    db.transaction(() => {
      a += service.draw(source, "a", t, 100, 1);
      expect(service.draw(source, "a", t, 100, 1)).toBe(0);
      b += service.draw(source, "b", t, 100, 1);
    });
    if (t === 1015) {
      db.close();
      db = new Database(dir);
      service = new SharedWater(db.sql, () => 2);
    }
  }
  expect(a).toBe(150);
  expect(b).toBe(150);
  db.transaction(() =>
    expect(service.draw({ ...source, usable: false }, "c", 1030, 100, 1)).toBe(
      0,
    ),
  );
  const before = db.sql.prepare("SELECT * FROM water_flow").all();
  expect(() =>
    db.transaction(() => {
      service.draw(source, "a", 1030, 100, 1);
      throw Error("rollback");
    }),
  ).toThrow("rollback");
  expect(db.sql.prepare("SELECT * FROM water_flow").all()).toEqual(before);
});
