import { createFacilityFixture } from "./fixtures/germany/facility-package";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { fundTestBudget } from "./money-fixture";
import { euro } from "../src/shared/money";
import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile, fork, type ChildProcess } from "node:child_process";
import type * as Fixture from "./germany-simulation-fixture";
import { createMap } from "./helpers/geography-tile";

const dataset = "e".repeat(64);
let f: typeof Fixture,
  cli: string,
  dir: string,
  geodataDir: string,
  dataDir: string,
  routerUrl: string;
let router: ChildProcess,
  provider: Awaited<ReturnType<typeof Fixture.initializeGermany>> | undefined,
  db: InstanceType<typeof Fixture.Database> | undefined;
let owner: string, cookie: string, backup: string;
beforeAll(async () => {
  mkdirSync(".tools", { recursive: true });
  const fixture = resolve(`.tools/germany-restore-fixture-${process.pid}.mjs`);
  cli = resolve("dist/server/cli.js");
  const common = {
    bundle: true,
    format: "esm" as const,
    platform: "node" as const,
    packages: "external" as const,
  };
  await Promise.all([
    build({
      ...common,
      entryPoints: ["tests/germany-simulation-fixture.ts"],
      outfile: fixture,
    }),
  ]);
  f = await import(pathToFileURL(fixture).href);
}, 20000);
beforeEach(async () => {
  dir = mkdtempSync(resolve(tmpdir(), "lv-germany-restore-"));
  geodataDir = resolve(dir, "geo");
  dataDir = resolve(dir, "save");
  mkdirSync(geodataDir);
  mkdirSync(dataDir);
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
  const index = new DatabaseSync(resolve(geodataDir, "index.sqlite"));
  index.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE anchors(id INTEGER PRIMARY KEY,lon REAL,lat REAL,name TEXT,road_class TEXT,bridge INTEGER,tunnel INTEGER,access TEXT);
    CREATE VIRTUAL TABLE anchors_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat);
    CREATE TABLE places(id INTEGER PRIMARY KEY,osm_type TEXT,osm_id TEXT,kind TEXT,name TEXT,display_name TEXT,lon REAL,lat REAL,region TEXT);
    CREATE VIRTUAL TABLE places_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat);
    CREATE VIRTUAL TABLE places_fts USING fts5(name,display_name,content='places',content_rowid='id');
    INSERT INTO anchors VALUES(16000000000,13.4,52.52,'Teststraße','residential',0,0,'');
    INSERT INTO anchors_rtree VALUES(16000000000,13.4,13.4,52.52,52.52);
    INSERT INTO anchors VALUES(16000000001,13.4008,52.5208,'Teststraße','residential',0,0,'');
    INSERT INTO anchors_rtree VALUES(16000000001,13.4008,13.4008,52.5208,52.5208);`);
  index.prepare("INSERT INTO metadata VALUES('source_sha256',?)").run(dataset);
  createFacilityFixture(geodataDir, {
    dataset,
    positions: [f.project({ lon: 13.4, lat: 52.52 })],
  });
  index.close();
  createMap(
    resolve(geodataDir, "maps.mbtiles"),
    [
      {
        layer: "transportation",
        properties: { class: "minor", name: "Teststraße" },
        type: 2,
        parts: [
          [
            [100, 100],
            [3900, 3900],
          ],
        ],
      },
    ],
    dataset,
  );
  router = fork(resolve("tests/helpers/germany-router.mjs"), {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  routerUrl = await new Promise<string>((done, reject) => {
    router.once("message", (message: { origin: string }) =>
      done(message.origin),
    );
    router.once("error", reject);
  });
  provider = await f.initializeGermany({
    indexPath: resolve(geodataDir, "index.sqlite"),
    dataset,
    routerUrl,
  });
  db = new f.Database(dataDir);
  const auth = new f.Auth(db);
  owner = await auth.create(
    "restore-player",
    "Only-isolated-test-284!",
    "Disponent",
    "Berlin",
  );
  cookie = `lv_session=${auth.issue(owner).value}`;
  const save = db.all().get(owner)!;
  fundTestBudget(save, 123456);
  db.save(owner, save);
  backup = await db.backup();
  fundTestBudget(save, 654321);
  db.save(owner, save);
  db.close();
  db = undefined;
}, 20000);
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
  if (dir) rmSync(dir, { recursive: true, force: true });
});
async function cliCommand(args: string[], managed = false) {
  return new Promise<{ code: number; output: string }>((done) => {
    execFile(
      process.execPath,
      [managed ? resolve("scripts/facilities-maintenance.mjs") : cli, ...args],
      {
        cwd: resolve("."),
        windowsHide: true,
        timeout: 20000,
        env: {
          ...process.env,
          NODE_ENV: "production",
          HOST: "127.0.0.1",
          PORT: "8991",
          PUBLIC_URL: "http://127.0.0.1:8991",
          DATA_DIR: dataDir,
          GEODATA_DIR: geodataDir,
          GRAPHHOPPER_URL: routerUrl,
        },
      },
      (error, stdout, stderr) =>
        done({
          code: error ? Number(error.code) || 1 : 0,
          output: stdout + stderr,
        }),
    );
  });
}
const restore = () => cliCommand(["restore", "--file", backup, "--confirm"]);
function legacyStation(name = "Teststandort fire 0") {
  const file = resolve(dataDir, "game.sqlite"),
    sql = new DatabaseSync(file);
  const save = JSON.parse(
    String(
      sql.prepare("SELECT data FROM saves WHERE user_id=?").get(owner)!.data,
    ),
  );
  save.buildings.push({
    id: "legacy-fire",
    owner,
    type: "fire",
    name,
    pos: f.project({ lon: 13.4, lat: 52.52 }),
    level: 1,
    ready: save.time,
    extensions: [],
    purchasePriceCents: 123456,
  });
  sql
    .prepare("UPDATE saves SET data=? WHERE user_id=?")
    .run(JSON.stringify(save), owner);
  sql.close();
  return { file, save };
}

describe("Tatsächlicher Deutschland-CLI-Prozess: Restore und Datenidentität", () => {
  it("migriert Altstandorte erst nach Trockenlauf und Sicherung, wiederholt sicher und stellt den Altstand tatsächlich wieder her", async () => {
    const { file, save } = legacyStation();
    const before = readFileSync(file);
    const preview = await cliCommand([], true);
    expect(preview.code, preview.output).toBe(0);
    expect(preview.output).toContain('"ready": true');
    expect(readFileSync(file)).toEqual(before);
    const rejected = await cliCommand(["facilities-migrate"], true);
    expect(rejected.code).not.toBe(0);
    expect(readFileSync(file)).toEqual(before);
    const result = await cliCommand(["facilities-migrate", "--confirm"], true);
    expect(result.code, result.output).toBe(0);
    const saved = JSON.parse(
      result.output.slice(
        result.output.indexOf("{"),
        result.output.lastIndexOf("}") + 1,
      ),
    );
    const migrated = new f.Database(dataDir);
    const after = migrated.all().get(owner)!;
    expect(after.buildings[0]).toMatchObject({
      id: "legacy-fire",
      purchasePriceCents: 123456,
      facility: { id: "fixture:fire:0" },
    });
    expect(after.money).toBe(save.money);
    migrated.close();
    const repeat = await cliCommand(["facilities-migrate", "--confirm"]);
    expect(repeat.code, repeat.output).toBe(0);
    expect(repeat.output).toContain('"changes": []');
    const restored = await cliCommand([
      "restore",
      "--file",
      saved.backup,
      "--confirm",
    ]);
    expect(restored.code, restored.output).toBe(0);
    const restoredDb = new DatabaseSync(file, { readOnly: true });
    try {
      const old = JSON.parse(
        String(
          restoredDb
            .prepare("SELECT data FROM saves WHERE user_id=?")
            .get(owner)!.data,
        ),
      );
      expect(old.buildings[0].facility).toBeUndefined();
      expect(old.money).toBe(save.money);
    } finally {
      restoredDb.close();
    }
  }, 60000);
  it("zeigt bei einer frei benannten Altwache Kandidaten und verlangt eine belegte Zuordnung", async () => {
    const { file } = legacyStation("Feuerwehrwache 1");
    const before = readFileSync(file);
    const preview = await cliCommand([], true);
    expect(preview.code, preview.output).toBe(0);
    const report = JSON.parse(
      preview.output.slice(
        preview.output.indexOf("{"),
        preview.output.lastIndexOf("}") + 1,
      ),
    );
    expect(report).toMatchObject({ readOnly: true, ready: false, changes: [] });
    expect(report.conflicts[0]).toMatchObject({
      owner,
      building: "legacy-fire",
      name: "Feuerwehrwache 1",
      type: "fire",
      position: { lon: expect.closeTo(13.4, 5), lat: expect.closeTo(52.52, 5) },
      candidateDetails: [
        expect.objectContaining({
          id: "fixture:fire:0",
          name: "Teststandort fire 0",
        }),
      ],
    });
    expect(readFileSync(file)).toEqual(before);
    const rejected = await cliCommand(
      ["facilities-migrate", "--confirm"],
      true,
    );
    expect(rejected.code).not.toBe(0);
    expect(readFileSync(file)).toEqual(before);
    expect(
      readdirSync(dataDir).some((p) => p.startsWith("pre-facilities-")),
    ).toBe(false);
    const resolutions = resolve(dir, "Geprüfte Zuordnung.json");
    writeFileSync(
      resolutions,
      JSON.stringify([
        {
          owner,
          building: "legacy-fire",
          facility: "fixture:fire:0",
          evidence:
            "Synthetische Prüfwache am identischen dokumentierten Standort.",
        },
      ]),
    );
    const checked = await cliCommand(
      ["facilities-preview", "--resolutions", resolutions],
      true,
    );
    expect(checked.code, checked.output).toBe(0);
    expect(checked.output).toContain('"ready": true');
    expect(readFileSync(file)).toEqual(before);
    const migrated = await cliCommand(
      ["facilities-migrate", "--resolutions", resolutions, "--confirm"],
      true,
    );
    expect(migrated.code, migrated.output).toBe(0);
    const after = new f.Database(dataDir);
    try {
      expect(after.all().get(owner)!.buildings[0].facility?.id).toBe(
        "fixture:fire:0",
      );
    } finally {
      after.close();
    }
    const lockFile = resolve(dataDir, "server.lock");
    writeFileSync(lockFile, JSON.stringify({ pid: process.pid }));
    const locked = readFileSync(file);
    const refused = await cliCommand([], true);
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain("bereits gesperrt");
    expect(readFileSync(file)).toEqual(locked);
    expect(readFileSync(lockFile, "utf8")).toContain(String(process.pid));
  }, 60000);
  it.each(["different", "missing"])(
    "weist migration-preview bei %s PBF-Metadaten schreibgeschützt zurück",
    async (mismatch) => {
      const target = resolve(dataDir, "game.sqlite");
      const input = new DatabaseSync(target);
      if (mismatch === "different")
        input
          .prepare("UPDATE meta SET value=? WHERE key='geodata-dataset-v1'")
          .run("f".repeat(64));
      else input.exec("DELETE FROM meta WHERE key='geodata-dataset-v1'");
      input.close();
      const before = readFileSync(target);
      const result = await cliCommand(["migration-preview"]);
      expect(result.code).not.toBe(0);
      expect(result.output).toMatch(/Geodaten|Datenstand|Datensatz|PBF/i);
      expect(result.output).not.toContain('"readOnly": true');
      expect(readFileSync(target)).toEqual(before);
    },
    25000,
  );
  it("liefert eine passende migration-preview ohne den Spielstand oder Sitzungen zu verändern", async () => {
    const target = resolve(dataDir, "game.sqlite"),
      before = readFileSync(target);
    const result = await cliCommand(["migration-preview"]);
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain('"readOnly": true');
    expect(result.output).toContain(`"user": "${owner}"`);
    expect(readFileSync(target)).toEqual(before);
    db = new f.Database(dataDir);
    expect(db.all().get(owner)!.money).toBe(euro(654321));
    expect(new f.Auth(db).session(cookie)?.user_id).toBe(owner);
  }, 25000);
  it.each(["different", "missing"])(
    "weist %s PBF-Metadaten vor jeder Änderung der Zielwelt zurück",
    async (mismatch) => {
      const input = new DatabaseSync(backup);
      if (mismatch === "different")
        input
          .prepare("UPDATE meta SET value=? WHERE key='geodata-dataset-v1'")
          .run("f".repeat(64));
      else input.exec("DELETE FROM meta WHERE key='geodata-dataset-v1'");
      input.close();
      const target = resolve(dataDir, "game.sqlite"),
        before = readFileSync(target),
        entries = readdirSync(dataDir);
      const result = await restore();
      expect(result.code).not.toBe(0);
      expect(result.output).toMatch(/Geodaten|Datenstand|Datensatz|PBF/i);
      expect(readFileSync(target)).toEqual(before);
      expect(readdirSync(dataDir)).toEqual(entries);
      db = new f.Database(dataDir);
      expect(new f.Auth(db).session(cookie)?.user_id).toBe(owner);
      expect(db.all().get(owner)!.money).toBe(euro(654321));
    },
    25000,
  );
  it("stellt eine kompatible Sicherung wieder her und widerruft deren Sitzungen", async () => {
    const result = await restore();
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("Wiederhergestellt");
    db = new f.Database(dataDir);
    expect(db.all().get(owner)!.money).toBe(euro(123456));
    expect(new f.Auth(db).session(cookie)).toBeNull();
    expect(db.sql.prepare("SELECT count(*) n FROM sessions").get()!.n).toBe(0);
    expect(
      db.sql
        .prepare("SELECT value FROM meta WHERE key='geodata-dataset-v1'")
        .get()!.value,
    ).toBe(dataset);
  }, 25000);
});
