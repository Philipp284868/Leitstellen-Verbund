/** Actual AMP launcher acceptance. Requires a prepared dataset and free routing ports. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createConnection, createServer } from "node:net";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const geo = resolve(
  process.env.GEODATA_DIR ||
    resolve(repo, "../leitstellen-deutschland-geodata"),
);
const manifest = JSON.parse(
  readFileSync(resolve(geo, "manifest.json"), "utf8"),
);
assert.equal(manifest.status, "ready");
assert.equal(manifest.worldId, "germany-1");
assert.match(manifest.dataset, /^[a-f0-9]{64}$/);

async function occupied(port) {
  return new Promise((done) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (value) => {
      socket.destroy();
      done(value);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(1000, () => finish(true));
  });
}
async function freePort() {
  const socket = createServer();
  await new Promise((done, fail) => {
    socket.once("error", fail);
    socket.listen(0, "127.0.0.1", done);
  });
  const port = socket.address().port;
  await new Promise((done, fail) =>
    socket.close((error) => (error ? fail(error) : done())),
  );
  return port;
}
for (const port of [8989, 8990]) {
  assert.equal(
    await occupied(port),
    false,
    `Port ${port} is occupied. This test never stops an existing service.`,
  );
}
const port = await freePort();
const dataDir = mkdtempSync(
  resolve(dirname(repo), "leitstellen-germany-start-test-"),
);
const origin = `http://127.0.0.1:${port}`;
const reportDir = resolve(repo, ".tools");
mkdirSync(reportDir, { recursive: true });
const reportFile = resolve(reportDir, "germany-launcher-metrics.json");
const logFile = resolve(reportDir, "germany-launcher.log");
const report = {
  checkedAt: new Date().toISOString(),
  dataDir,
  geo,
  port,
  dataset: manifest.dataset,
  status: "running",
};
let output = "",
  exited = false,
  exitCode,
  serverPid;
const started = performance.now();
const child = spawn(process.execPath, ["scripts/start-germany.mjs"], {
  cwd: repo,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe", "ipc"],
  env: {
    ...process.env,
    DATA_DIR: dataDir,
    GEODATA_DIR: geo,
    HOST: "127.0.0.1",
    PORT: String(port),
    PUBLIC_URL: origin,
    // An empty inherited value also prevents a repository .env from selecting an external router.
    GRAPHHOPPER_URL: "",
  },
});
const recordOutput = (data) => {
  output = (output + data).slice(-500000);
};
child.stdout.on("data", recordOutput);
child.stderr.on("data", recordOutput);
child.once("error", (error) => {
  output += error.stack;
  exited = true;
});
child.once("exit", (code) => {
  exited = true;
  exitCode = code;
});
async function stop() {
  if (!exited && child.connected) child.send({ type: "shutdown" });
  const deadline = Date.now() + 40000;
  while (!exited && Date.now() < deadline) await pause(100);
  assert.ok(
    exited,
    `Owned launcher did not exit after IPC shutdown:\n${output}`,
  );
}
async function json(path) {
  const response = await fetch(origin + path, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200, path);
  return response.json();
}
try {
  const deadline = Date.now() + 120000;
  while (true) {
    assert.ok(!exited, `Launcher exited before readiness:\n${output}`);
    try {
      const response = await fetch(origin + "/api/health", {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).ok) break;
    } catch {
      /* bounded readiness */
    }
    assert.ok(Date.now() < deadline, `Launcher startup timed out:\n${output}`);
    await pause(200);
  }
  report.startupMs = Math.round(performance.now() - started);
  report.health = await json("/api/health");
  report.publicManifest = await json("/geo/manifest");
  assert.equal(report.publicManifest.world, manifest.worldId);
  assert.equal(report.publicManifest.dataset, manifest.dataset);
  assert.ok(
    !JSON.stringify(report.publicManifest).includes(geo),
    "Public manifest must not expose host paths.",
  );
  assert.match(
    output,
    /routing-server gestartet/,
    "The launcher must start its own real routing sidecar.",
  );
  const live = await fetch("http://127.0.0.1:8989/info", {
    signal: AbortSignal.timeout(5000),
  }).then((r) => r.json());
  assert.equal(live.version, manifest.graphRuntimeIdentity.version);
  assert.equal(live.import_date, manifest.graphRuntimeIdentity.import_date);
  assert.equal(live.data_date, manifest.graphRuntimeIdentity.data_date);
  report.router = {
    version: live.version,
    import_date: live.import_date,
    data_date: live.data_date,
  };
  serverPid = JSON.parse(
    readFileSync(resolve(dataDir, "server.lock"), "utf8"),
  ).pid;
  assert.ok(Number.isInteger(serverPid) && serverPid > 0);
  const database = new DatabaseSync(resolve(dataDir, "game.sqlite"), {
    readOnly: true,
  });
  try {
    report.worldIdentity = JSON.parse(
      database
        .prepare("SELECT value FROM meta WHERE key='world-identity-v1'")
        .get().value,
    );
    report.savedDataset = database
      .prepare("SELECT value FROM meta WHERE key='geodata-dataset-v1'")
      .get().value;
    report.databaseVersion = database
      .prepare("PRAGMA user_version")
      .get().user_version;
    assert.equal(report.worldIdentity.world, "germany-1");
    assert.equal(report.savedDataset, manifest.dataset);
    assert.equal(
      database.prepare("SELECT count(*) AS n FROM users").get().n,
      0,
    );
  } finally {
    database.close();
  }
  const stopping = performance.now();
  await stop();
  report.shutdownMs = Math.round(performance.now() - stopping);
  assert.equal(exitCode, 0, output);
  assert.equal(
    existsSync(resolve(dataDir, "server.lock")),
    false,
    "Game save lock was not released.",
  );
  for (const checkPort of [port, 8989, 8990])
    assert.equal(
      await occupied(checkPort),
      false,
      `Port ${checkPort} remains occupied.`,
    );
  const javaPid = Number(output.match(/Java-Prozess (\d+)/)?.[1]);
  assert.ok(javaPid > 0, "The owned Java shutdown PID must be reported.");
  for (const pid of [child.pid, serverPid, javaPid]) {
    assert.throws(
      () => process.kill(pid, 0),
      { code: "ESRCH" },
      `Owned process ${pid} remained alive.`,
    );
  }
  const finalDatabase = new DatabaseSync(resolve(dataDir, "game.sqlite"), {
    readOnly: true,
  });
  try {
    assert.equal(
      finalDatabase.prepare("PRAGMA quick_check").get().quick_check,
      "ok",
    );
    assert.equal(
      finalDatabase
        .prepare("SELECT value FROM meta WHERE key='geodata-dataset-v1'")
        .get().value,
      manifest.dataset,
    );
  } finally {
    finalDatabase.close();
  }
  Object.assign(report, {
    status: "passed",
    launcherPid: child.pid,
    serverPid,
    javaPid,
    exitCode,
    lockReleased: true,
    portsReleased: [port, 8989, 8990],
    noOrphanProcesses: true,
  });
  console.log(
    `Full Germany launcher passed: real owned Java + application, health, manifest, SQLite identity, IPC shutdown, released lock and ports (${report.startupMs} ms start / ${report.shutdownMs} ms stop).`,
  );
} catch (error) {
  report.status = "failed";
  report.error = error.stack;
  throw error;
} finally {
  try {
    await stop();
  } finally {
    writeFileSync(logFile, output);
    writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
    writeFileSync(
      resolve(dataDir, "launcher-test.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      `Evidence: ${reportFile}\nIsolated test data retained: ${dataDir}`,
    );
  }
}
