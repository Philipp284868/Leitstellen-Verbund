import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
if (process.platform !== "linux")
  throw Error("Der echte SIGTERM-Pakettest benötigt Linux.");
const archive = resolve(process.argv[2] || "");
if (!archive.endsWith(".tar.gz"))
  throw Error("Geprüftes Runtime-Archiv erforderlich.");
const temporary = await mkdtemp(join(tmpdir(), "lv-runtime-smoke-"));
const appDir = join(temporary, "app"),
  dataDir = join(temporary, "persistent-data");
await mkdir(appDir);
await mkdir(".tools/runtime-fixture", { recursive: true });
await build({
  entryPoints: ["tests/fixtures/germany/runtime.ts"],
  outfile: ".tools/runtime-fixture/runtime.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const { createGermanyRuntime } = await import(
  pathToFileURL(resolve(".tools/runtime-fixture/runtime.mjs")).href
);
const runtime = await createGermanyRuntime();
await build({
  entryPoints: ["src/germany/projection.ts"],
  outfile: ".tools/runtime-fixture/projection.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
});
let child, stopped;
async function stop() {
  if (!child) return;
  child.kill("SIGTERM");
  const outcome = await Promise.race([
    stopped,
    delay(10000, undefined, { ref: false }).then(() => "timeout"),
  ]);
  if (outcome === "timeout") {
    child.kill("SIGKILL");
    throw Error("Runtime beendet sich nicht sauber.");
  }
  assert.equal(outcome, 0, "Sauberer SIGTERM-Stopp");
  child = undefined;
}
try {
  execFileSync("tar", ["-xzf", archive, "-C", appDir], { stdio: "inherit" });
  const listener = createServer();
  await new Promise((done) => listener.listen(0, "127.0.0.1", done));
  const port = listener.address().port;
  await new Promise((done) => listener.close(done));
  const origin = `http://127.0.0.1:${port}`;
  async function start() {
    let output = "";
    child = spawn(process.execPath, ["dist/server/index.js"], {
      cwd: appDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: String(port),
        PUBLIC_URL: origin,
        DATA_DIR: dataDir,
        TRUSTED_PROXIES: "",
        ALLOW_HTTP: "true",
        GEODATA_DIR: runtime.geodataDir,
        GRAPHHOPPER_URL: runtime.routerUrl,
      },
    });
    child.stdout.on("data", (b) => (output += b));
    child.stderr.on("data", (b) => (output += b));
    stopped = new Promise((done, reject) => {
      child.once("error", reject);
      child.once("exit", done);
    });
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null)
        throw Error("Paketstart fehlgeschlagen: " + output);
      try {
        const r = await fetch(origin + "/api/health");
        if (r.ok) return;
      } catch {
        /* startup */
      }
      await delay(100);
    }
    throw Error("Paketstart überschreitet 15 Sekunden: " + output);
  }
  await start();
  assert.match(await (await fetch(origin)).text(), /Leitstellen/);
  const response = await fetch(origin + "/api/register", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "releasecheck",
      password: randomBytes(24).toString("base64url"),
      name: "Paketprüfung",
      station: "Testleitstelle",
    }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  async function view() {
    const r = await fetch(origin + "/api/me", { headers: { Cookie: cookie } });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.mode, "multi");
    assert.equal(body.save.player.station, "Testleitstelle");
    return body;
  }
  const me = await view();
  const siteResponse = await fetch(
    origin + "/api/geo/search?q=" + encodeURIComponent("Straße des 17. Juni"),
    { headers: { Cookie: cookie } },
  );
  assert.equal(siteResponse.status, 200);
  const site = await siteResponse.json();
  assert.ok(JSON.stringify(site).includes("Straße des 17. Juni"));
  const lon = 13.324,
    lat = 52.5142;
  const { project } = await import(
    pathToFileURL(resolve(".tools/runtime-fixture/projection.mjs")).href
  );
  const pos = project({ lon, lat });
  const action = {
    id: crypto.randomUUID(),
    action: { type: "build", kind: "fire", pos },
  };
  for (let i = 0; i < 2; i++) {
    const r = await fetch(origin + "/api/action", {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
        "x-csrf-token": me.csrf,
      },
      body: JSON.stringify(action),
    });
    assert.equal(r.status, 200, await r.text());
  }
  const before = await view();
  assert.equal(before.save.buildings.length, 1);
  assert.equal(typeof before.save.money, "number");
  assert.ok(Array.isArray(before.save.buildings));
  await stop();
  await start();
  const after = await view();
  assert.equal(after.user.id, before.user.id);
  assert.equal(after.save.money, before.save.money);
  assert.deepEqual(after.save.buildings, before.save.buildings);
  await stop();
  console.log(
    "Runtime-Paket bestanden: echter Start, Website, Registrierung, Multiplayer-Spielstand, sauberer Stopp, persistenter Neustart.",
  );
} finally {
  if (child) {
    child.kill("SIGKILL");
    await stopped;
  }
  await runtime.close();
  await rm(temporary, { recursive: true, force: true });
}
