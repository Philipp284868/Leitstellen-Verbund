import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { initialize, instance } from "../../ops/runtime/instance.mjs";
import { hash } from "../../ops/runtime/files.mjs";
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
  await reset(root, "smoke-reset", plan.confirmation);
  await start();
  assert.equal(
    (await fetch(origin + "/api/me", { headers: { Cookie: cookie } })).status,
    401,
  );
  await stop();
  assert.notEqual(i.record.generation, instance(root).record.generation);
  assert.equal(
    (await reset(root, "smoke-reset", plan.confirmation)).repeated,
    true,
  );
  const at = performance.now();
  assert.equal((await install()).unchanged, true);
  const repeatMs = performance.now() - at;
  await start();
  await stop();
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
