import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  symlinkSync,
  linkSync,
  statSync,
  readdirSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { hardReset, OBSOLETE_FILES } from "../scripts/hard-reset.mjs";
import { germanyRuntime } from "./helpers/germany-runtime.mjs";

function fixture(t) {
  const base = mkdtempSync(resolve(tmpdir(), "lv-reset-test-"));
  const app = resolve(base, "app"),
    data = resolve(base, "leitstellen-data");
  mkdirSync(app);
  mkdirSync(data);
  mkdirSync(resolve(data, "backups"));
  writeFileSync(
    resolve(app, "package.json"),
    '{"name":"leitstellen-verbund","type":"module"}',
  );
  writeFileSync(resolve(app, ".env"), "HOST=127.0.0.1\nPORT=7777\nDATA_DIR=\n");
  const id = "11111111-2222-4333-a444-555555555555";
  const files = [
    "game.sqlite",
    "game.sqlite-wal",
    "game.sqlite-shm",
    "game.sqlite-journal",
    "pre-migration-1700000000000.sqlite",
    `pre-migration-v2-1700000000000-${id}.sqlite`,
    `restore-${id}.sqlite`,
    `backups/game-1700000000000-${id}.sqlite`,
  ];
  for (const name of files) writeFileSync(resolve(data, name), `old:${name}`);
  for (const name of OBSOLETE_FILES)
    writeFileSync(resolve(app, name), `private:${name}`);
  writeFileSync(resolve(data, "other.sqlite"), "unrelated data");
  writeFileSync(resolve(data, "backups/notes.txt"), "keep");
  mkdirSync(resolve(app, "node_modules"));
  writeFileSync(resolve(app, "node_modules/keep"), "dependency");
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const run = (extra = {}) =>
    hardReset({
      programDir: app,
      dataDir: data,
      requestId: "reset-test-once",
      confirmed: true,
      ...extra,
    });
  return { base, app, data, files, run };
}

test("löscht nur eigene Spielstände, generierte Backups und drei alte Admin-Hilfsdateien", (t) => {
  const f = fixture(t),
    env = readFileSync(resolve(f.app, ".env"));
  const result = f.run();
  assert.equal(result.deletedFiles, f.files.length + OBSOLETE_FILES.length);
  for (const name of f.files)
    assert.equal(existsSync(resolve(f.data, name)), false);
  for (const name of OBSOLETE_FILES)
    assert.equal(existsSync(resolve(f.app, name)), false);
  assert.deepEqual(readFileSync(resolve(f.app, ".env")), env);
  assert.equal(
    readFileSync(resolve(f.data, "other.sqlite"), "utf8"),
    "unrelated data",
  );
  assert.equal(
    readFileSync(resolve(f.data, "backups/notes.txt"), "utf8"),
    "keep",
  );
  assert.equal(
    readFileSync(resolve(f.app, "node_modules/keep"), "utf8"),
    "dependency",
  );
  assert.equal(existsSync(resolve(f.data, "server.lock")), false);
  const receipt = resolve(f.data, "hard-reset-reset-test-once.json");
  assert.equal(JSON.parse(readFileSync(receipt)).state, "completed");
  assert.equal(readFileSync(receipt, "utf8").includes("private:"), false);
  if (process.platform !== "win32")
    assert.equal(statSync(receipt).mode & 0o777, 0o600);
});
test("derselbe Auftrag löscht nach Wiederholung keine neue Spielwelt", (t) => {
  const f = fixture(t);
  f.run();
  writeFileSync(resolve(f.data, "game.sqlite"), "new players");
  assert.equal(f.run().repeated, true);
  assert.equal(
    readFileSync(resolve(f.data, "game.sqlite"), "utf8"),
    "new players",
  );
});
test("ohne Bestätigung und mit Pfadtraversal-Kennung unverändert", (t) => {
  const f = fixture(t);
  assert.throws(() => f.run({ confirmed: false }), /Bestätigung/);
  assert.throws(() => f.run({ requestId: "../escape" }), /Kennung/);
  assert.equal(
    readFileSync(resolve(f.data, "game.sqlite"), "utf8"),
    "old:game.sqlite",
  );
  assert.equal(existsSync(resolve(f.data, "server.lock")), false);
});
test("lebender Prozess wird nicht beendet, seine Sperre und Daten bleiben", (t) => {
  const f = fixture(t),
    lock = resolve(f.data, "server.lock");
  writeFileSync(lock, JSON.stringify({ pid: process.pid }));
  const before = readFileSync(lock);
  assert.throws(() => f.run(), /Prozess existiert/);
  assert.deepEqual(readFileSync(lock), before);
  assert.equal(
    readFileSync(resolve(f.data, "game.sqlite"), "utf8"),
    "old:game.sqlite",
  );
});
test("nachweislich beendeter Prozess erlaubt einmalige verwaiste Sperrfreigabe", (t) => {
  const f = fixture(t),
    child = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
  assert.equal(child.status, 0);
  writeFileSync(
    resolve(f.data, "server.lock"),
    JSON.stringify({ pid: child.pid }),
  );
  assert.equal(f.run().repeated, false);
  assert.equal(existsSync(resolve(f.data, "server.lock")), false);
});
test("beschädigte und ungültige PID-Sperren werden nicht blind entfernt", (t) => {
  const f = fixture(t),
    path = resolve(f.data, "server.lock");
  for (const text of ["{", '{"pid":-1}', '{"pid":0}', '{"pid":"15"}']) {
    writeFileSync(path, text);
    assert.throws(() => f.run());
    assert.equal(readFileSync(path, "utf8"), text);
    assert.ok(existsSync(resolve(f.data, "game.sqlite")));
  }
});
test("Symlink-Datenbank und fremdes Ziel bleiben unberührt", (t) => {
  const f = fixture(t),
    foreign = resolve(f.base, "foreign");
  writeFileSync(foreign, "keep");
  rmSync(resolve(f.data, "game.sqlite"));
  symlinkSync(foreign, resolve(f.data, "game.sqlite"));
  assert.throws(() => f.run(), /Unsicherer Dateityp/);
  assert.equal(readFileSync(foreign, "utf8"), "keep");
  assert.ok(existsSync(resolve(f.data, "game.sqlite-wal")));
});
test("Symlink-Sicherungsordner und darin liegende Dateien bleiben unberührt", (t) => {
  const f = fixture(t),
    foreign = resolve(f.base, "foreign-backups");
  mkdirSync(foreign);
  rmSync(resolve(f.data, "backups"), { recursive: true });
  symlinkSync(foreign, resolve(f.data, "backups"), "junction");
  assert.throws(() => f.run(), /Verzeichnis/);
  assert.ok(existsSync(resolve(f.data, "game.sqlite")));
});
test("Symlink-Admin-Datei bricht vor jeder Datenlöschung ab", (t) => {
  const f = fixture(t),
    foreign = resolve(f.base, "foreign");
  writeFileSync(foreign, "keep");
  rmSync(resolve(f.app, "admin-konto.json"));
  symlinkSync(foreign, resolve(f.app, "admin-konto.json"));
  assert.throws(() => f.run(), /Unsicherer Dateityp/);
  assert.ok(existsSync(resolve(f.data, "game.sqlite")));
  assert.equal(readFileSync(foreign, "utf8"), "keep");
});
test("Hardlinks und ungewöhnliche Objekttypen werden nicht bereinigt", (t) => {
  const f = fixture(t);
  linkSync(resolve(f.data, "game.sqlite"), resolve(f.base, "link"));
  assert.throws(() => f.run(), /Unsicherer Dateityp/);
  assert.ok(existsSync(resolve(f.data, "game.sqlite")));
});
test("Programmordner, Vorfahren und Symlink-Datenordner sind gesperrt", (t) => {
  const f = fixture(t);
  assert.throws(() => f.run({ dataDir: f.app }), /getrennt/);
  assert.throws(() => f.run({ dataDir: f.base }), /getrennt/);
  const inside = resolve(f.app, "data");
  mkdirSync(inside);
  assert.throws(() => f.run({ dataDir: inside }), /getrennt/);
  const link = resolve(f.base, "data-link");
  symlinkSync(f.data, link, "junction");
  assert.throws(() => f.run({ dataDir: link }), /Verzeichnis/);
  assert.ok(existsSync(resolve(f.data, "game.sqlite")));
});
test("unvollständiger oder gefälschter Reset-Beleg führt nicht zur Wiederholung", (t) => {
  const f = fixture(t),
    path = resolve(f.data, "hard-reset-reset-test-once.json");
  writeFileSync(
    path,
    JSON.stringify({
      format: "leitstellen-hard-reset-v1",
      request: "reset-test-once",
      state: "pending",
    }),
  );
  assert.throws(() => f.run(), /unterbrochen/);
  writeFileSync(path, JSON.stringify({ state: "completed" }));
  assert.throws(() => f.run(), /ungültig/);
  assert.ok(existsSync(resolve(f.data, "game.sqlite")));
});
test("falsches Projekt wird nicht angefasst", (t) => {
  const f = fixture(t);
  writeFileSync(resolve(f.app, "package.json"), '{"name":"other-server"}');
  assert.throws(() => f.run(), /Leitstellen-Verbund/);
  assert.ok(existsSync(resolve(f.data, "game.sqlite")));
});
test("fehlerhafter Abschluss behält Wartungssperre statt Teilreset als Erfolg auszugeben", (t) => {
  const f = fixture(t);
  writeFileSync(
    resolve(f.data, "hard-reset-reset-test-once.json.tmp"),
    "reserved",
  );
  assert.throws(() => f.run(), /nicht vollständig/);
  assert.ok(existsSync(resolve(f.data, "server.lock")));
  assert.equal(
    JSON.parse(readFileSync(resolve(f.data, "hard-reset-reset-test-once.json")))
      .state,
    "pending",
  );
  assert.throws(() => f.run(), /unterbrochen/);
});
test("leerer generierter Sicherungsordner wird entfernt", (t) => {
  const f = fixture(t);
  rmSync(resolve(f.data, "backups/notes.txt"));
  f.run();
  assert.equal(existsSync(resolve(f.data, "backups")), false);
});

test(
  "Node 24: echter Spielserver, zwei Konten, Reset-CLI, Neustart und erneute Registrierung",
  {
    skip: Number(process.versions.node.split(".")[0]) !== 24,
    timeout: 30000,
  },
  async (t) => {
    const f = fixture(t);
    const geography = await germanyRuntime();
    t.after(() => geography.close());
    for (const name of f.files) rmSync(resolve(f.data, name));
    for (const name of OBSOLETE_FILES) rmSync(resolve(f.app, name));
    cpSync(resolve("dist"), resolve(f.app, "dist"), { recursive: true });
    rmSync(resolve(f.app, "node_modules"), { recursive: true });
    symlinkSync(
      resolve("node_modules"),
      resolve(f.app, "node_modules"),
      "junction",
    );
    mkdirSync(resolve(f.app, "scripts"));
    cpSync(
      resolve("scripts/hard-reset.mjs"),
      resolve(f.app, "scripts/hard-reset.mjs"),
    );
    const listener = createServer();
    listener.listen(0, "127.0.0.1");
    await once(listener, "listening");
    const port = listener.address().port;
    await new Promise((done) => listener.close(done));
    const origin = `http://127.0.0.1:${port}`;
    writeFileSync(
      resolve(f.app, ".env"),
      `HOST=127.0.0.1\nPORT=${port}\nPUBLIC_URL=${origin}\nDATA_DIR=${f.data.replaceAll("\\", "/")}\n`,
    );
    const env = {
      ...process.env,
      GEODATA_DIR: geography.geodataDir,
      GRAPHHOPPER_URL: geography.routerUrl,
    };
    for (const key of [
      "HOST",
      "PORT",
      "PUBLIC_URL",
      "DATA_DIR",
      "ALLOW_HTTP",
      "TRUSTED_PROXIES",
    ])
      delete env[key];
    const pass = "Reset-test-only-password-278";
    let child;
    const stop = async () => {
      if (!child) return;
      const p = child;
      child = undefined;
      if (p.exitCode !== null || p.signalCode !== null) return;
      const done = once(p, "exit");
      if (process.platform === "win32") p.send({ type: "shutdown" });
      else p.kill("SIGTERM");
      const [code] = await done;
      assert.equal(code, 0);
    };
    t.after(stop);
    const start = async () => {
      let output = "";
      child = spawn(process.execPath, ["dist/server/index.js"], {
        cwd: f.app,
        env,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      child.stdout.on("data", (b) => {
        output = (output + b).slice(-8000);
      });
      child.stderr.on("data", (b) => {
        output = (output + b).slice(-8000);
      });
      for (let i = 0; i < 150; i++) {
        if (child.exitCode !== null)
          throw Error("Spielprozess vorzeitig beendet: " + output);
        try {
          if ((await fetch(origin + "/api/health")).ok) return;
        } catch {
          /* starting */
        }
        await new Promise((r) => setTimeout(r, 40));
      }
      throw Error("Spielserver nicht bereit.");
    };
    const request = (path, body) =>
      fetch(origin + "/api/" + path, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    try {
      await start();
      for (const username of ["old-player", "second-player"]) {
        const r = await request("register", {
          username,
          password: pass,
          name: username,
          station: "Test",
        });
        assert.equal(r.status, 200);
      }
      await stop();
      for (const name of OBSOLETE_FILES)
        writeFileSync(resolve(f.app, name), "obsolete");
      const before = readFileSync(resolve(f.app, ".env"));
      const reset = () =>
        spawnSync(
          process.execPath,
          [
            "scripts/hard-reset.mjs",
            "--confirm-delete-all-player-data",
            "--request",
            "integration-once",
          ],
          { cwd: f.app, env, encoding: "utf8" },
        );
      let result = reset();
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /HARDRESET ERFOLGREICH/);
      assert.deepEqual(readFileSync(resolve(f.app, ".env")), before);
      assert.equal(existsSync(resolve(f.data, "game.sqlite")), false);
      assert.equal(
        readdirSync(f.data).some((name) => name.startsWith("pre-migration-")),
        false,
      );
      await start();
      assert.equal(
        (await request("login", { username: "old-player", password: pass }))
          .status,
        401,
      );
      assert.equal(
        (await request("login", { username: "second-player", password: pass }))
          .status,
        401,
      );
      assert.equal(
        (
          await request("register", {
            username: "old-player",
            password: pass,
            name: "Neu",
            station: "Neu",
          })
        ).status,
        200,
      );
      await stop();
      result = reset();
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /bereits erledigt/);
      await start();
      assert.equal(
        (await request("login", { username: "old-player", password: pass }))
          .status,
        200,
      );
      await stop();
    } finally {
      await stop();
    }
  },
);
