import { it, expect } from "vitest";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { Database, DATABASE_VERSION } from "../server/database";
import { Auth } from "../server/auth";
import { Game } from "../server/game";
import { fresh, validate, type Save } from "../src/model";
import {
  nodes,
  overpasses,
  edges,
  roads,
  route,
  distance,
  docks,
  publicHospital,
  WORLD,
  LEGACY_WORLD,
  type Point,
} from "../src/world";
import { legacyNodes } from "../src/world-migration";
import { emsProfile } from "./e2e/fixtures";
import { mt } from "../src/catalog";

it("verbindet sämtliche Straßen und Häfen mit kurzen, tatsächlich gezeichneten Fahrwegen", () => {
  const adjacent = nodes.map(() => [] as number[]);
  for (const [a, b] of edges) {
    adjacent[a].push(b);
    adjacent[b].push(a);
  }
  const visited = new Set([0]),
    queue = [0];
  for (const a of queue)
    for (const b of adjacent[a])
      if (!visited.has(b)) {
        visited.add(b);
        queue.push(b);
      }
  expect(visited.size).toBe(nodes.length);
  const pairs = new Set(edges.flatMap(([a, b]) => [`${a}:${b}`, `${b}:${a}`]));
  const landmarks = [
    nodes[0],
    publicHospital,
    ...docks,
    ...roads.map((r) => r.points.at(-1)!),
  ];
  for (const [j, a] of landmarks.entries())
    for (const b of [
      landmarks[0],
      landmarks[(j + Math.floor(landmarks.length / 2)) % landmarks.length],
    ]) {
      const path = route(a, b);
      expect(path.length).toBeLessThanOrEqual(4096);
      for (let i = 2; i < path.length - 1; i++)
        expect(
          pairs.has(`${nodes.indexOf(path[i - 1])}:${nodes.indexOf(path[i])}`),
        ).toBe(true);
    }
}, 30000);
it("zeichnet unverbundene Straßenkreuzungen ausdrücklich als Überführung", () => {
  const cross = (ax: number, ay: number, bx: number, by: number) =>
    ax * by - ay * bx;
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const [ai, bi] = edges[i],
        [ci, di] = edges[j];
      if (ai === ci || ai === di || bi === ci || bi === di) continue;
      const a = nodes[ai],
        b = nodes[bi],
        c = nodes[ci],
        d = nodes[di],
        den = cross(b.x - a.x, b.y - a.y, d.x - c.x, d.y - c.y);
      if (Math.abs(den) < 1e-6) continue;
      const t = cross(c.x - a.x, c.y - a.y, d.x - c.x, d.y - c.y) / den,
        u = cross(c.x - a.x, c.y - a.y, b.x - a.x, b.y - a.y) / den;
      if (t > 1e-5 && t < 1 - 1e-5 && u > 1e-5 && u < 1 - 1e-5)
        expect(
          overpasses.some(
            (p) =>
              (p.upper === `${ai}:${bi}` && p.lower === `${ci}:${di}`) ||
              (p.lower === `${ai}:${bi}` && p.upper === `${ci}:${di}`),
          ),
        ).toBe(true);
    }
});
it("übernimmt alle 117 alten Bauplätze getrennt und migriert nur bekannte gültige Karten", () => {
  const s = fresh("Altbestand", "Bestand", 1000);
  const old = {
    ...s,
    world: LEGACY_WORLD,
    buildings: legacyNodes.map((pos, i) => ({
      id: `home-${i}`,
      owner: s.player.id,
      type: [76, 89, 102].includes(i) ? "water" : "fire",
      name: `Wache ${i}`,
      pos,
      level: 1,
      ready: 0,
      extensions: [],
    })),
  };
  const result = validate(old);
  expect(result.world).toBe(WORLD);
  expect(result.money).toBe(old.money);
  expect(
    new Set(result.buildings.map((b) => `${b.pos.x}:${b.pos.y}`)).size,
  ).toBe(117);
  for (const a of result.buildings)
    for (const b of result.buildings)
      if (a !== b) expect(distance(a.pos, b.pos)).toBeGreaterThanOrEqual(20);
  expect(validate(result)).toEqual(result);
  expect(old.world).toBe(LEGACY_WORLD);
  expect(old.buildings[0].pos).toEqual(legacyNodes[0]);
  expect(() => validate({ ...old, world: "unbekannt" })).toThrow();
  expect(() =>
    validate({
      ...old,
      buildings: [{ ...old.buildings[0], pos: { x: 3, y: 3 } }],
    }),
  ).toThrow("Bauplatz");
  expect(() =>
    validate({ ...old, buildings: [{ ...old.buildings[0], owner: "fremd" }] }),
  ).toThrow("Gebäudebesitz");
});
function oldProfile(s: Save) {
  const oldPoint = (p: Point) => {
    if (distance(p, nodes[0]) < 0.01) return legacyNodes[0];
    if (distance(p, nodes[3]) < 0.01) return legacyNodes[1];
    if (distance(p, nodes[2]) < 0.01) return legacyNodes[2];
    if (distance(p, publicHospital) < 0.01) return legacyNodes[58];
    return legacyNodes.reduce((a, b) =>
      distance(a, p) < distance(b, p) ? a : b,
    );
  };
  const old = structuredClone(s);
  for (const b of old.buildings) b.pos = oldPoint(b.pos);
  for (const m of [...old.missions, ...old.archive]) m.pos = oldPoint(m.pos);
  for (const v of old.vehicles) v.path = v.path.map(oldPoint);
  return { ...old, world: LEGACY_WORLD };
}
it("migriert beide Welten samt aktivem Verbundtransport, sichert das Original und stellt alte Sicherungen per CLI wieder her", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-map-migration-"));
  let db = new Database(dir);
  try {
    const auth = new Auth(db),
      a = await auth.create("anna", "Migration-pass-123!", "Anna", "Nord"),
      b = await auth.create("ben", "Migration-pass-123!", "Ben", "Süd");
    for (const id of [a, b]) {
      const s = emsProfile(id);
      s.player.id = id;
      for (const o of [...s.buildings, ...s.vehicles]) o.owner = id;
      db.save(id, s);
      db.save(id, structuredClone(db.all().get(id)!), "single");
    }
    const game = new Game(db),
      owner = db.all().get(a)!,
      helper = db.all().get(b)!,
      m = owner.missions[0],
      v = helper.vehicles.find((v) => v.type === "rtw")!;
    const startA = owner.money,
      startB = helper.money;
    game.command(a, {
      id: crypto.randomUUID(),
      action: { type: "share", id: m.id },
    });
    const support = {
      id: crypto.randomUUID(),
      action: {
        type: "support",
        peer: a,
        mission: m.id,
        round: m.round,
        vehicle: v.id,
      },
    };
    game.command(b, support);
    for (
      let i = 0;
      i < 1000 &&
      db
        .all()
        .get(b)!
        .vehicles.find((x) => x.id === v.id)!.status !== "transport";
      i++
    )
      game.step(1);
    expect(
      db
        .all()
        .get(b)!
        .vehicles.find((x) => x.id === v.id)!.status,
    ).toBe("transport");
    for (const mode of ["multi", "single"] as const)
      for (const [id, s] of db.all(mode))
        db.sql
          .prepare(
            `UPDATE ${mode === "multi" ? "saves" : "solo_saves"} SET data=? WHERE user_id=?`,
          )
          .run(JSON.stringify(oldProfile(s)), id);
    db.sql.exec("PRAGMA user_version=3;");
    const original = String(
      db.sql.prepare("SELECT data FROM saves WHERE user_id=?").get(b)!.data,
    );
    db.close();
    db = new Database(dir);
    const initial = db.all(),
      solo = db.all("single"),
      migrated = initial.get(b)!,
      trip = migrated.vehicles.find((x) => x.id === v.id)!;
    expect(trip.status).toBe("transport");
    expect(trip.path.at(-1)).toEqual(publicHospital);
    expect(trip.depart).toBe(
      JSON.parse(original).vehicles.find((x: { id: string }) => x.id === v.id)
        .depart,
    );
    expect(migrated.money).toBe(startB);
    expect(db.sql.prepare("PRAGMA user_version").get()!.user_version).toBe(
      DATABASE_VERSION,
    );
    const backup = resolve(
      dir,
      (await readdir(dir)).find((f) => f.startsWith("pre-migration-v2-"))!,
    );
    const preserved = new DatabaseSync(backup, { readOnly: true });
    try {
      expect(
        preserved.prepare("SELECT data FROM saves WHERE user_id=?").get(b)!
          .data,
      ).toBe(original);
    } finally {
      preserved.close();
    }
    const resumed = new Game(db);
    for (
      let i = 0;
      i < 400 &&
      !db
        .all()
        .get(a)!
        .archive.some((x) => x.round === m.round);
      i++
    )
      resumed.step(5);
    expect(
      db
        .all()
        .get(a)!
        .archive.some((x) => x.round === m.round),
    ).toBe(true);
    expect(db.all().get(a)!.money - startA).toBe(
      Math.floor(mt("sick").reward / 2),
    );
    expect(db.all().get(b)!.money - startB).toBe(
      Math.floor(mt("sick").reward / 2),
    );
    resumed.command(b, support);
    resumed.step(7200);
    expect(db.all().get(b)!.money - startB).toBe(
      Math.floor(mt("sick").reward / 2),
    );
    expect(
      db
        .all()
        .get(b)!
        .vehicles.find((x) => x.id === v.id)!.status,
    ).toBe("ready");
    const target = await mkdtemp(resolve(tmpdir(), "lv-map-restore-"));
    const restored = spawnSync(
      process.execPath,
      ["dist/server/cli.js", "restore", "--file", backup, "--confirm"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATA_DIR: target,
          PUBLIC_URL: "http://127.0.0.1:7799",
          PORT: "7799",
          HOST: "127.0.0.1",
          ALLOW_HTTP: "true",
          TRUSTED_PROXIES: "",
        },
      },
    );
    expect(restored.status, restored.stderr).toBe(0);
    const check = new Database(target);
    try {
      expect(check.all()).toEqual(initial);
      expect(check.all("single")).toEqual(solo);
    } finally {
      check.close();
    }
  } finally {
    db.close();
  }
}, 30000);
it("rollt die Kartenmigration beider Tabellen bei einem beschädigten Einzelspielerstand zurück", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-map-rollback-"));
  const db = new Database(dir),
    id = await new Auth(db).create(
      "anna",
      "Migration-pass-123!",
      "Anna",
      "Nord",
    );
  const original = JSON.stringify(oldProfile(db.all().get(id)!));
  db.sql.prepare("UPDATE saves SET data=? WHERE user_id=?").run(original, id);
  db.sql
    .prepare("INSERT INTO solo_saves VALUES (?,?)")
    .run(id, '{"world":"broken"}');
  db.sql.exec("PRAGMA user_version=3;");
  db.close();
  expect(() => new Database(dir)).toThrow();
  const raw = new DatabaseSync(resolve(dir, "game.sqlite"));
  try {
    expect(raw.prepare("PRAGMA user_version").get()!.user_version).toBe(3);
    expect(raw.prepare("SELECT data FROM saves").get()!.data).toBe(original);
  } finally {
    raw.close();
  }
});
it("übernimmt Boote und Rückfahrten an die neuen Häfen ohne Verlust von Auftrag oder Fahrzeit", () => {
  const s = fresh("Boot", "Wasserrettung", 1000);
  const old = {
    ...s,
    world: LEGACY_WORLD,
    buildings: [
      {
        id: "dock-home",
        owner: s.player.id,
        type: "water",
        name: "Wasserrettung",
        pos: legacyNodes[102],
        level: 1,
        ready: 0,
        extensions: [],
      },
    ],
    vehicles: [
      {
        id: "boat-1",
        owner: s.player.id,
        type: "boat",
        name: "Boot",
        home: "dock-home",
        favorite: true,
        status: "return",
        mission: null,
        assignment: null,
        path: [legacyNodes[76], { x: 1115, y: 490 }, legacyNodes[102]],
        depart: 900,
        arrive: 1200,
        patients: 0,
      },
    ],
  };
  const result = validate(old),
    v = result.vehicles[0];
  expect(v.path[0]).toEqual(docks[0]);
  expect(v.path.at(-1)).toEqual(docks[2]);
  expect(v.status).toBe("return");
  expect(v.depart).toBe(900);
  expect(v.arrive).toBe(1200);
  expect(v.favorite).toBe(true);
  expect(result.buildings[0].pos).toEqual(docks[2]);
  expect(
    validate({ ...old, vehicles: [{ ...old.vehicles[0], status: "ready" }] })
      .vehicles[0].path,
  ).toEqual([docks[2]]);
});
