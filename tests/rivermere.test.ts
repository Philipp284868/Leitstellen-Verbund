import { beforeAll, describe, it, expect } from "vitest";
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { Database } from "../server/database";
import type * as Fixture from "./rivermere-fixture";
let f: typeof Fixture;
beforeAll(async () => {
  mkdirSync(".tools", { recursive: true });
  const outfile = resolve(`.tools/rivermere-unit-${process.pid}.mjs`);
  await build({
    entryPoints: ["tests/rivermere-fixture.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    define: { __LV_WORLD__: JSON.stringify("rivermere-1") },
  });
  f = await import(pathToFileURL(outfile).href);
}, 20000);
describe("Rivermere als eigenständige Serverwelt", () => {
  it("hat metrische 100 km, zentrale Großstadt und dieselben sichtbaren Routenabschnitte", () => {
    expect(f.WORLD_WIDTH * f.METERS_PER_UNIT).toBe(100000);
    expect(f.WORLD_HEIGHT * f.METERS_PER_UNIT).toBe(100000);
    expect(f.settlements[0].x / f.WORLD_WIDTH).toBeCloseTo(0.5);
    expect(f.settlements[0].size).toBeGreaterThan(
      Math.max(...f.settlements.slice(1).map((s) => s.size)) * 3,
    );
    expect(f.roadSections.length).toBe(f.edges.length);
    for (const e of f.roadSections)
      expect(e.meters).toBeCloseTo(
        f.distance(f.nodes[e.a], f.nodes[e.b]) * 12,
        7,
      );
  });
  it("verbindet jeden Ort und Stadtteil legal mit dem Zentrum ohne Straßen durch Seen", () => {
    const center = f.nodes[f.nearest(f.settlements[0])];
    for (const p of f.districts)
      expect(f.route(center, f.nodes[f.nearest(p)]).length).toBeGreaterThan(0);
    const adjacency: number[][] = f.nodes.map(() => []);
    for (const [a, b] of f.edges) {
      adjacency[a].push(b);
      adjacency[b].push(a);
    }
    const reached = new Set([0]),
      queue = [0];
    for (let i = 0; i < queue.length; i++)
      for (const n of adjacency[queue[i]])
        if (!reached.has(n)) {
          reached.add(n);
          queue.push(n);
        }
    expect(reached.size).toBe(f.nodes.length);
    for (const road of f.roads.filter((r) => r.kind !== "country"))
      for (const p of road.points)
        expect(f.riverDistance(p)).toBeGreaterThan(45);
    for (const p of f.nodes) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(f.extent);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(f.extent);
      expect(f.inLake(p)).toBe(false);
    }
  });
  it("verwendet auch für Bootsfahrten den dargestellten Fluss statt gerader Landquerung", () => {
    for (const a of f.docks)
      for (const b of f.docks) {
        expect(f.riverDistance(a)).toBeLessThan(20);
        for (const p of f.route(a, b, "water"))
          expect(f.riverDistance(p)).toBeLessThan(20.001);
      }
  });
  it("lässt sich deterministisch erneut erzeugen und lehnt fremde Spielstände ab", async () => {
    const outfile = resolve(`.tools/rivermere-repeat-${process.pid}.mjs`);
    await build({
      entryPoints: ["tests/rivermere-fixture.ts"],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      define: { __LV_WORLD__: JSON.stringify("rivermere-1") },
    });
    const other = (await import(pathToFileURL(outfile).href)) as typeof Fixture;
    const hash = (v: unknown) =>
      createHash("sha256").update(JSON.stringify(v)).digest("hex");
    expect(hash(other.nodes)).toBe(hash(f.nodes));
    expect(hash(other.roadSections)).toBe(hash(f.roadSections));
    const s = f.phaseFixture("11111111-2222-4333-8444-555555555555");
    expect(f.validate(structuredClone(s)).world).toBe("rivermere-1");
    expect(() => f.validate({ ...s, world: "falkenried-2" })).toThrow();
  });
  it("weist eine fremde Welt vor Änderungen an SQLite ab", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "lv-world-protect-")),
      db = new Database(dir);
    db.sql
      .prepare("UPDATE meta SET value=? WHERE key='world-identity-v1'")
      .run(
        JSON.stringify({ world: "rivermere-1", seed: 57180908, generator: 1 }),
      );
    db.sql.close();
    const file = resolve(dir, "game.sqlite"),
      before = readFileSync(file);
    expect(() => new Database(dir)).toThrow(/Weltkonflikt/);
    expect(readFileSync(file)).toEqual(before);
  });
});
