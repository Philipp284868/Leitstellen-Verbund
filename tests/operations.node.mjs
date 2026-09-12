import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, parse } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { initialize, instance } from "../ops/runtime/instance.mjs";
import {
  fresh,
  inspect,
  snapshot,
  migrate,
  restoreBeforeAdmission,
} from "../ops/runtime/database.mjs";
import { grantOperator } from "../ops/runtime/operator.mjs";
import { preview, reset } from "../ops/runtime/reset.mjs";
import {
  atomic,
  lock,
  safePath,
  unlock,
  hash,
  assertSpace,
} from "../ops/runtime/files.mjs";
import {
  update,
  rollbackBeforeReady,
  acceptReady,
} from "../ops/runtime/update.mjs";
import { unpack } from "../ops/runtime/archive.mjs";
import { gzipSync } from "node:zlib";

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), "lv-ops-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let i = initialize(root, {});
  writeFileSync(
    resolve(i.geo, "manifest.json"),
    JSON.stringify({
      status: "ready",
      worldId: "germany-1",
      dataset: "a".repeat(64),
    }),
  );
  const pointer = {
    release: "2.26.0-" + "a".repeat(40),
    commit: "a".repeat(40),
    sequence: 10,
    sha256: "b".repeat(64),
  };
  const app = resolve(root, "releases", pointer.release);
  mkdirSync(resolve(app, "config"), { recursive: true });
  copyFileSync("config/baseline.sql", resolve(app, "config/baseline.sql"));
  atomic(resolve(app, "release.json"), { compatibility: { database: 26 } });
  fresh(i, app);
  atomic(resolve(root, "current.json"), pointer);
  atomic(resolve(i.state, "instance.json"), { ...i.record, initialized: true });
  i = instance(root);
  return { root, i, app };
}
test("Reset requires instance-bound confirmation, preserves configuration and geodata, consumes ID once", async (t) => {
  const { root, i } = fixture(t);
  const db = new DatabaseSync(resolve(i.data, "game.sqlite"));
  db.prepare(
    "INSERT INTO users(id,username,password,role,created) VALUES('old','old','hash','player',1)",
  ).run();
  db.close();
  const config = readFileSync(resolve(root, "shared/config/.env"));
  const geo = readFileSync(resolve(i.geo, "manifest.json"));
  writeFileSync(resolve(root, "shared/uploads/old-user.txt"), "private");
  const plan = preview(root, "reset-test");
  assert.equal(plan.accounts, 1);
  await assert.rejects(reset(root, "reset-test", "wrong"), /bestätigt/);
  assert.equal(inspect(resolve(i.data, "game.sqlite")).accounts, 1);
  const result = await reset(root, "reset-test", plan.confirmation);
  assert.notEqual(result.generation, i.record.generation);
  const next = instance(root);
  assert.equal(inspect(resolve(next.data, "game.sqlite")).accounts, 0);
  assert.equal(existsSync(i.data), false);
  assert.equal(
    readFileSync(
      resolve(root, "shared/backups/reset-reset-test/uploads/old-user.txt"),
      "utf8",
    ),
    "private",
  );
  assert.deepEqual(readFileSync(resolve(root, "shared/config/.env")), config);
  assert.deepEqual(readFileSync(resolve(next.geo, "manifest.json")), geo);
  const newDb = new DatabaseSync(resolve(next.data, "game.sqlite"));
  newDb
    .prepare("INSERT INTO users VALUES('new','new','hash','player',2)")
    .run();
  newDb.close();
  assert.equal(
    (await reset(root, "reset-test", plan.confirmation)).repeated,
    true,
  );
  assert.equal(inspect(resolve(next.data, "game.sqlite")).accounts, 1);
});
test("Snapshot includes uncheckpointed WAL data and is independently checked", async (t) => {
  const { root, i } = fixture(t),
    db = new DatabaseSync(resolve(i.data, "game.sqlite"));
  db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
  db.prepare("INSERT INTO users VALUES('wal','wal','hash','player',1)").run();

  const saved = await snapshot(
    resolve(i.data, "game.sqlite"),
    resolve(root, "shared/backups/wal.sqlite"),
  );
  db.close();
  assert.equal(saved.accounts, 1);
  assert.equal(saved.sha256.length, 64);
});
test("Live processes and overlapping operations cannot be unlocked or reset", async (t) => {
  const { root, i } = fixture(t),
    plan = preview(root, "locked");
  const release = lock(resolve(i.state, "operation.lock"), "start");

  assert.throws(() => unlock(resolve(i.state, "operation.lock")), /existiert/);
  await assert.rejects(reset(root, "locked", plan.confirmation), /EEXIST/);
  release();
});
test("Symlink ancestors and filesystem roots are rejected", (t) => {
  const { root } = fixture(t);
  assert.throws(() => safePath(parse(root).root), /Unsicher/);
  const link = resolve(root, "linked");
  symlinkSync(resolve(root, "shared"), link, "junction");
  assert.throws(() => safePath(root, resolve(link, "data")), /Symlink/);
});
test("Backup failure stops reset and preserves original database", async (t) => {
  const { root, i } = fixture(t),
    plan = preview(root, "backup-error");
  mkdirSync(resolve(root, "shared/backups/reset-backup-error"));
  writeFileSync(
    resolve(root, "shared/backups/reset-backup-error/game.sqlite"),
    "do not overwrite",
  );
  await assert.rejects(
    reset(root, "backup-error", plan.confirmation),
    /existiert/,
  );
  assert.equal(instance(root).record.generation, i.record.generation);
  assert.equal(inspect(resolve(i.data, "game.sqlite")).schema, 26);
  await assert.rejects(
    reset(root, "backup-error", plan.confirmation),
    /unterbrochen/,
  );
});
test("Same package update and failed download preserve world and current version", async (t) => {
  const { root, i } = fixture(t),
    before = readFileSync(resolve(i.data, "game.sqlite"));
  assert.equal(
    (
      await update(root, {
        resolveCandidate: async () => ({
          ...i.current,
          sha256: i.current.sha256,
        }),
      })
    ).unchanged,
    true,
  );
  await assert.rejects(
    update(root, {
      resolveCandidate: async () => ({
        sequence: 11,
        size: 1,
        url: "test",
        sha256: "c".repeat(64),
      }),
      download: async () => {
        throw Error("network");
      },
    }),
    /network/,
  );
  assert.deepEqual(readFileSync(resolve(i.data, "game.sqlite")), before);
  assert.equal(instance(root).current.commit, i.current.commit);
});
test("Broken archive never replaces the active release", async (t) => {
  const { root, i } = fixture(t);
  await assert.rejects(
    update(root, {
      resolveCandidate: async () => ({
        sequence: 11,
        size: 1,
        url: "test",
        sha256: "c".repeat(64),
      }),
      download: async () => Buffer.from("corrupt"),
    }),
    /prüfsumme/,
  );
  assert.equal(instance(root).current.commit, i.current.commit);
  assert.throws(
    () =>
      unpack(gzipSync(Buffer.from("incomplete")), resolve(root, "staging/bad")),
    /unvollständig/,
  );
});
test("Rollback never crosses a reset generation or an accepted update", (t) => {
  const { i } = fixture(t);
  for (const j of [
    { phase: "ready", generation: i.record.generation },
    { phase: "pending-start", generation: "old", previous: i.current },
  ]) {
    atomic(resolve(i.state, "update.json"), j);
    assert.equal(rollbackBeforeReady(i), false);
  }
});

test("Missing configuration recovers only its recorded private bytes; missing database never creates a replacement", async (t) => {
  const { root, i } = fixture(t);
  const config = resolve(root, "shared/config/.env"),
    bytes = readFileSync(config);
  rmSync(config);
  assert.equal(instance(root).record.id, i.record.id);
  assert.deepEqual(readFileSync(config), bytes);
  rmSync(resolve(i.data, "game.sqlite"));
  await assert.rejects(
    update(root, { resolveCandidate: async () => ({ sequence: 11, size: 1 }) }),
    /Datenbank fehlt/,
  );
  assert.equal(existsSync(resolve(i.data, "game.sqlite")), false);
  rmSync(config);
  atomic(resolve(i.state, "config-recovery.json"), {
    instance: "foreign",
    text: "x",
    sha256: hash("x"),
  });
  assert.throws(() => instance(root), /belegte/);
  assert.equal(existsSync(config), false);
});

test("Schema migration is transactional and repeatable; only the immediate same-generation backup can restore it", async (t) => {
  const { i, app } = fixture(t),
    file = resolve(i.data, "game.sqlite");
  const db = new DatabaseSync(file);
  db.exec(
    "DROP TABLE game_operators; PRAGMA user_version=25; INSERT INTO users VALUES('kept','kept','hash','player',1);",
  );
  db.close();
  const saved = await snapshot(
    file,
    resolve(i.root, "shared/backups/migration/game.sqlite"),
  );
  mkdirSync(resolve(app, "config/migrations"));
  copyFileSync(
    "config/migrations/026.sql",
    resolve(app, "config/migrations/026.sql"),
  );
  const compatibility = { minimumDatabase: 25, database: 26 };
  assert.equal(migrate(file, app, compatibility).schema, 26);
  assert.equal(migrate(file, app, compatibility).accounts, 1);
  restoreBeforeAdmission(i, saved);
  assert.equal(inspect(file).schema, 25);
  assert.equal(inspect(file).accounts, 1);
  writeFileSync(
    resolve(app, "config/migrations/026.sql"),
    "CREATE TABLE broken(id); SELECT * FROM missing_table;",
  );
  assert.throws(() => migrate(file, app, compatibility), /missing_table/);
  const after = new DatabaseSync(file);
  assert.equal(
    after.prepare("SELECT name FROM sqlite_master WHERE name='broken'").get(),
    undefined,
  );
  after.close();
  assert.equal(inspect(file).schema, 25);
  await assert.rejects(
    async () =>
      restoreBeforeAdmission(
        { ...i, record: { ...i.record, generation: "foreign" } },
        saved,
      ),
    /Weltgeneration/,
  );
});

test("Operator enrollment is private, exact-generation and existing-account only, and reset removes the grant", async (t) => {
  const { root, i } = fixture(t),
    file = resolve(i.data, "game.sqlite"),
    request = resolve(root, "shared/config/operator-request.json");
  const db = new DatabaseSync(file);
  db.exec(
    "INSERT INTO users VALUES('operator','operator','private-hash','player',1);",
  );
  assert.equal(db.prepare("SELECT count(*) n FROM game_operators").get().n, 0);
  db.close();
  atomic(request, {
    instance: i.record.id,
    generation: "wrong",
    username: "operator",
    confirm: true,
  });
  await assert.rejects(grantOperator(root), /bestätigung/);
  atomic(request, {
    instance: i.record.id,
    generation: i.record.generation,
    username: "operator",
    confirm: true,
  });
  await grantOperator(root);
  await grantOperator(root);
  const check = new DatabaseSync(file);
  assert.equal(
    check.prepare("SELECT count(*) n FROM game_operators").get().n,
    1,
  );
  assert.equal(
    check.prepare("SELECT password FROM users").get().password,
    "private-hash",
  );
  check.close();
  const plan = preview(root, "operator-reset");
  await reset(root, plan.request, plan.confirmation);
  await assert.rejects(grantOperator(root), /bestätigung/);
  const next = new DatabaseSync(resolve(instance(root).data, "game.sqlite"));
  assert.equal(
    next.prepare("SELECT count(*) n FROM game_operators").get().n,
    0,
  );
  next.close();
});

test("Storage exhaustion and forged activated-reset paths are refused before touching another directory", async (t) => {
  const { root, i } = fixture(t);
  assert.throws(() => assertSpace(root, Number.MAX_SAFE_INTEGER), /Speicher/);
  const plan = preview(root, "forged-reset");
  atomic(resolve(i.state, "reset-forged-reset.json"), {
    ...plan,
    phase: "activated",
    next: i.record.generation,
    backupDir: resolve(root, "foreign"),
  });
  await assert.rejects(
    reset(root, plan.request, plan.confirmation),
    /Zielpfade/,
  );
  assert.equal(existsSync(i.data), true);
});

function archive(records) {
  const parts = [];
  for (const {
    path,
    type = "0",
    bytes = Buffer.alloc(0),
    link = "",
  } of records) {
    const h = Buffer.alloc(512);
    h.write(path, 0, 100);
    h.write("0000700\0", 100);
    h.write(bytes.length.toString(8).padStart(11, "0") + "\0", 124);
    h.fill(32, 148, 156);
    h[156] = type.charCodeAt(0);
    h.write(link, 157, 100);
    h.write(
      h
        .reduce((sum, b) => sum + b, 0)
        .toString(8)
        .padStart(6, "0") + "\0 ",
      148,
    );
    parts.push(h, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}
test("Archive rejects traversal, duplicate paths, escaping links, hardlinks and file parents before extraction", (t) => {
  const { root } = fixture(t);
  for (const records of [
    [{ path: "../escape" }],
    [{ path: "/absolute" }],
    [{ path: "same" }, { path: "same" }],
    [{ path: "node_modules/link", type: "2", link: "../../../escape" }],
    [
      {
        path: "././@LongLink",
        type: "K",
        bytes: Buffer.from("../../../escape\0"),
      },
      { path: "node_modules/link", type: "2", link: "safe-but-overridden" },
    ],
    [{ path: "hard", type: "1", link: "somewhere" }],
    [{ path: "parent" }, { path: "parent/child" }],
  ]) {
    const target = resolve(root, "staging/invalid");
    assert.throws(
      () => unpack(archive(records), target),
      /Archiv|Sonderdateien|Symlink/,
    );
    assert.equal(existsSync(target), false);
  }
});

test("Verified complete update keeps new-world accounts and receipts, isolates files and disallows rollback after admission", async (t) => {
  const { root, i, app } = fixture(t);
  writeFileSync(resolve(app, "removed-in-next.js"), "old program");
  const db = new DatabaseSync(resolve(i.data, "game.sqlite"));
  db.exec(
    "INSERT INTO users VALUES('new','new','hash','player',1); INSERT INTO actions VALUES('new','receipt','digest');",
  );
  db.close();
  const files = [
    { path: "config/baseline.sql", bytes: readFileSync("config/baseline.sql") },
    {
      path: "dist/server/index.js",
      bytes: Buffer.from("// complete test candidate"),
    },
  ];
  const manifest = {
    format: 2,
    product: "germany-1",
    node: "24.x",
    platform: "linux-x64",
    commit: "c".repeat(40),
    version: "2.26.1",
    compatibility: { database: 26, minimumDatabase: 25, geodata: 1 },
    files: files.map((f) => ({ path: f.path, sha256: hash(f.bytes) })),
  };
  const bytes = archive([
    ...files,
    { path: "release.json", bytes: Buffer.from(JSON.stringify(manifest)) },
  ]);
  const descriptor = {
    version: manifest.version,
    commit: manifest.commit,
    sequence: 11,
    size: bytes.length,
    sha256: hash(bytes),
    url: "fixture",
  };
  const oldRouter = process.env.GRAPHHOPPER_URL;
  process.env.GRAPHHOPPER_URL = "http://127.0.0.1:1";
  try {
    const options = {
      resolveCandidate: async () => descriptor,
      download: async () => bytes,
    };
    await update(root, options);
    const next = instance(root);
    assert.equal(next.record.generation, i.record.generation);
    assert.equal(next.current.commit, manifest.commit);
    assert.equal(
      existsSync(
        resolve(root, "releases", next.current.release, "removed-in-next.js"),
      ),
      false,
    );
    const check = new DatabaseSync(resolve(next.data, "game.sqlite"));
    assert.equal(check.prepare("SELECT count(*) n FROM actions").get().n, 1);
    check.close();
    acceptReady(next);
    assert.equal(rollbackBeforeReady(next), false);
    assert.equal((await update(root, options)).unchanged, true);
    assert.equal(inspect(resolve(next.data, "game.sqlite")).accounts, 1);
  } finally {
    if (oldRouter === undefined) delete process.env.GRAPHHOPPER_URL;
    else process.env.GRAPHHOPPER_URL = oldRouter;
  }
});
