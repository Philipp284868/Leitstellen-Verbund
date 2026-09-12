import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { build } from "esbuild";
import { initialize, instance, program } from "../../ops/runtime/instance.mjs";
import { hash, atomic } from "../../ops/runtime/files.mjs";
import { io } from "socket.io-client";
import { update } from "../../ops/runtime/update.mjs";
import { preview, reset } from "../../ops/runtime/reset.mjs";
const archive = await readFile(process.argv[2]);
const manifest = JSON.parse(
  await readFile(".tools/releases/release.json", "utf8"),
);
const { createGermanyRuntime } = await import(
  pathToFileURL(resolve(".tools/runtime-fixture/runtime.mjs")).href
);
const runtime = await createGermanyRuntime();
const root = await mkdtemp(join(tmpdir(), "lv-managed-package-"));
execFileSync("tar", [
  "-xzf",
  resolve(".tools/releases/amp-bootstrap.tar.gz"),
  "-C",
  root,
]);
let child,
  exit,
  output = "",
  oldRouter = process.env.GRAPHHOPPER_URL;
process.env.GRAPHHOPPER_URL = runtime.routerUrl;
const listener = createServer();
await new Promise((r) => listener.listen(0, "127.0.0.1", r));
const port = listener.address().port;
await new Promise((r) => listener.close(r));
const origin = `http://127.0.0.1:${port}`;
async function stop() {
  if (!child) return;
  child.kill("SIGTERM");
  assert.equal(
    await Promise.race([exit, delay(45000, 99, { ref: false })]),
    0,
    output,
  );
  child = null;
}
async function start() {
  output = "";
  child = spawn(
    resolve(root, "node/bin/node"),
    [resolve(root, "launcher/runtime.mjs"), "start"],
    {
      env: { ...process.env, LV_INSTANCE_ROOT: root },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (b) => (output += b));
  child.stderr.on("data", (b) => (output += b));
  exit = new Promise((r, j) => {
    child.once("error", j);
    child.once("exit", r);
  });
  for (let n = 0; n < 200; n++) {
    if (child.exitCode !== null) throw Error(output);
    if (output.includes("Spiel bereit:")) {
      assert.equal((await fetch(origin + "/api/health")).status, 200);
      return;
    }
    await delay(100);
  }
  throw Error("Verwaltetes Paket nicht bereit: " + output);
}
async function register(username) {
  const response = await fetch(origin + "/api/register", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password: randomBytes(24).toString("base64url"),
      name: "Paketspieler",
      station: "Paketleitstelle",
    }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return {
    cookie: response.headers.get("set-cookie").split(";")[0],
    body: await response.json(),
  };
}
function maintenance(action) {
  return execFileSync(
    resolve(root, "node/bin/node"),
    [resolve(root, "launcher/runtime.mjs"), action],
    {
      env: { ...process.env, LV_INSTANCE_ROOT: root },
      encoding: "utf8",
      timeout: 20000,
    },
  );
}
try {
  initialize(
    root,
    { PORT: String(port), PUBLIC_URL: origin },
    { geodata: runtime.geodataDir },
  );
  const descriptor = {
    version: manifest.version,
    commit: manifest.commit,
    sha256: hash(archive),
    sequence: 100,
    size: archive.length,
    url: "fixture",
  };
  const install = () =>
    update(root, {
      resolveCandidate: async () => descriptor,
      download: async () => archive,
    });
  const before = performance.now();
  await install();
  const firstMs = performance.now() - before;
  await start();
  const response = await fetch(origin + "/api/register", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "managedplayer",
      password: randomBytes(24).toString("base64url"),
      name: "Paketspieler",
      station: "Paketleitstelle",
    }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const cookie = response.headers.get("set-cookie").split(";")[0];
  const generation = response.headers.get("x-world-generation");
  assert.equal(generation, instance(root).record.generation);
  await stop();
  const i = instance(root),
    plan = preview(root, "smoke-reset");
  atomic(resolve(root, "shared/config/reset-request.json"), {
    request: plan.request,
    confirmation: plan.confirmation,
  });
  assert.match(maintenance("reset-confirm"), /Reset abgeschlossen/);
  await start();
  assert.equal(
    (await fetch(origin + "/api/me", { headers: { Cookie: cookie } })).status,
    401,
  );
  const next = await register("afterreset");
  const get = async (path) => {
    const r = await fetch(origin + path, { headers: { Cookie: next.cookie } });
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  };
  let me = await get("/api/me");
  const socket = io(origin, {
    transports: ["websocket"],
    extraHeaders: { Origin: origin, Cookie: next.cookie },
    auth: {
      csrf: me.csrf,
      mode: "multi",
      generation: instance(root).record.generation,
    },
    reconnection: false,
  });
  await new Promise((done, reject) => {
    const timer = setTimeout(
      () => reject(Error("WebSocket nicht bereit")),
      5000,
    );
    socket.once("connect", () => {
      clearTimeout(timer);
      done();
    });
    socket.once("connect_error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
  socket.disconnect();
  assert.equal(
    (
      await fetch(origin + "/api/operator/status", {
        headers: { Cookie: next.cookie },
      })
    ).status,
    403,
  );
  const offers = await get("/api/facilities?kind=fire&status=available");
  const action = async (a, id = crypto.randomUUID()) => {
    const r = await fetch(origin + "/api/action", {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: next.cookie,
        "Content-Type": "application/json",
        "x-csrf-token": me.csrf,
      },
      body: JSON.stringify({ id, action: a }),
    });
    assert.equal(r.status, 200, await r.clone().text());
  };
  const buyId = crypto.randomUUID(),
    buy = { type: "purchase-facility", facility: offers.offers[0].facility.id };
  await action(buy, buyId);
  await action(buy, buyId);
  for (let n = 0; n < 35; n++) {
    me = await get("/api/me");
    if (me.save.buildings[0].ready <= me.save.time) break;
    await delay(1000);
  }
  await action({ type: "buy", kind: "tsf", home: me.save.buildings[0].id });
  const newProgress = await get("/api/me");
  assert.equal(newProgress.save.buildings.length, 1);
  assert.equal(newProgress.save.vehicles.length, 1);
  await stop();
  atomic(resolve(root, "shared/config/operator-request.json"), {
    instance: instance(root).record.id,
    generation: instance(root).record.generation,
    username: "afterreset",
    confirm: true,
  });
  assert.match(maintenance("grant-operator"), /Spieladministrator bestätigt/);
  assert.notEqual(i.record.generation, instance(root).record.generation);
  assert.equal(
    (await reset(root, "smoke-reset", plan.confirmation)).repeated,
    true,
  );
  const at = performance.now();
  assert.equal((await install()).unchanged, true);
  const repeatMs = performance.now() - at;
  await start();
  const persisted = await get("/api/me");
  assert.equal(persisted.save.money, newProgress.save.money);
  assert.equal(persisted.save.vehicles[0].id, newProgress.save.vehicles[0].id);
  assert.equal(
    persisted.save.buildings[0].id,
    newProgress.save.buildings[0].id,
  );
  assert.equal(
    (
      await fetch(origin + "/api/operator/status", {
        headers: { Cookie: next.cookie },
      })
    ).status,
    200,
  );
  await stop();
  await build({
    entryPoints: ["tests/helpers/packaged-transport.ts"],
    outfile: ".tools/runtime-fixture/packaged-transport.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
  });
  const { packagedTransport } = await import(
    pathToFileURL(resolve(".tools/runtime-fixture/packaged-transport.mjs")).href
  );
  const final = instance(root);
  await packagedTransport(
    resolve(program(final), "dist/server/index.js"),
    {
      host: "127.0.0.1",
      port,
      publicUrl: origin,
      secure: false,
      trustedProxies: [],
      dataDir: final.data,
      geodataDir: runtime.geodataDir,
      routerUrl: runtime.routerUrl,
    },
    final.record.generation,
  );
  console.log(
    JSON.stringify({
      managedPackage: "passed",
      archiveBytes: archive.length,
      firstInstallMs: Math.round(firstMs),
      sameUpdateMs: Math.round(repeatMs),
      checks: [
        "package without source",
        "readiness handshake",
        "registration",
        "post-reset registration, site and vehicle purchase",
        "packaged patient transport, reward, XP and archive across restart",
        "private operator enrollment",
        "WebSocket",
        "new progress preserved across restart and repeated update",
        "reset",
        "old session denied",
        "reset idempotence",
        "same update",
        "restart",
        "SIGTERM",
      ],
    }),
  );
} finally {
  if (child) {
    child.kill("SIGKILL");
    await exit;
  }
  if (oldRouter === undefined) delete process.env.GRAPHHOPPER_URL;
  else process.env.GRAPHHOPPER_URL = oldRouter;
  await runtime.close();
  await rm(root, { recursive: true, force: true });
}
