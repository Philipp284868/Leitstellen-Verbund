import assert from "node:assert/strict";
import { build } from "esbuild";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { request as httpsRequest } from "node:https";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { io } from "socket.io-client";
import { caddyBinary } from "../tests/helpers/caddy.mjs";

const repo = resolve("."),
  temporary = await mkdtemp(join(tmpdir(), "lv-amp-acceptance-"));
const app = join(temporary, "app"),
  results = [];
const owned = new Set();
let runtime;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const cleanEnv = { ...process.env };
for (const key of [
  "HOST",
  "PORT",
  "PUBLIC_URL",
  "ALLOW_HTTP",
  "TRUSTED_PROXIES",
  "DATA_DIR",
  "GEODATA_DIR",
  "GRAPHHOPPER_URL",
  "GERMANY_DATA_DIR",
  "GERMANY_GEODATA_DIR",
  "NODE_OPTIONS",
])
  delete cleanEnv[key];
async function freePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
function child(executable, args, options = {}) {
  const processChild = spawn(executable, args, {
    cwd: temporary,
    env: cleanEnv,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
    ...options,
  });
  owned.add(processChild);
  let output = "";
  processChild.stdout?.on("data", (b) => {
    output += b;
  });
  processChild.stderr?.on("data", (b) => {
    output += b;
  });
  const ended = new Promise((done, reject) => {
    processChild.once("error", reject);
    processChild.once("exit", (code) => {
      owned.delete(processChild);
      done(code);
    });
  });
  return { processChild, ended, output: () => output };
}
async function run(args, env = cleanEnv) {
  const c = child(process.execPath, args, { env });
  const timer = setTimeout(() => c.processChild.kill("SIGTERM"), 240000);
  try {
    const code = await c.ended;
    assert.equal(code, 0, c.output());
    return c.output();
  } finally {
    clearTimeout(timer);
  }
}
async function stop(c) {
  if (c.processChild.exitCode !== null) return;
  if (process.platform === "win32") c.processChild.send({ type: "shutdown" });
  else c.processChild.kill("SIGTERM");
  const outcome = await Promise.race([
    c.ended,
    delay(15000, "timeout", { ref: false }),
  ]);
  assert.equal(outcome, 0, c.output());
}
async function waitFor(check, message) {
  for (let i = 0; i < 150; i++) {
    if (await check()) return;
    await delay(100);
  }
  throw Error(message);
}
try {
  await mkdir(app);
  await mkdir(resolve(".tools/amp-acceptance"), { recursive: true });
  execFileSync(
    "git",
    ["archive", "--format=tar", "HEAD", "-o", join(temporary, "source.tar")],
    { cwd: repo, windowsHide: true },
  );
  execFileSync("tar", ["-xf", join(temporary, "source.tar"), "-C", app], {
    windowsHide: true,
  });
  await build({
    entryPoints: ["tests/fixtures/germany/runtime.ts"],
    outfile: ".tools/amp-acceptance/runtime.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
  });
  const { createGermanyRuntime } = await import(
    pathToFileURL(resolve(".tools/amp-acceptance/runtime.mjs")).href
  );
  runtime = await createGermanyRuntime();
  const catalog = {
    schema: 1,
    worldId: "germany-1",
    dataset: JSON.parse(
      await readFile(join(runtime.geodataDir, "manifest.json"), "utf8"),
    ).dataset,
    releaseTag: "germany-data-2026-09-07-v1",
    baseUrl:
      "https://github.com/Philipp284868/Leitstellen-Verbund/releases/download/germany-data-2026-09-07-v1",
    compression: "gzip",
    chunkBytes: 268435456,
    files: [],
  };
  const transfers = {};
  for (const name of await readdir(runtime.geodataDir)) {
    const bytes = await readFile(join(runtime.geodataDir, name)),
      compressed = gzipSync(bytes),
      asset = name + ".gz",
      file = join(temporary, asset);
    await writeFile(file, compressed);
    transfers[catalog.baseUrl + "/" + asset] = file;
    catalog.files.push({
      path: name,
      bytes: bytes.length,
      sha256: hash(bytes),
      parts: [
        {
          asset,
          bytes: compressed.length,
          rawBytes: bytes.length,
          sha256: hash(compressed),
        },
      ],
    });
  }
  await writeFile(
    join(app, "scripts/geodata/download-manifest.json"),
    JSON.stringify(catalog),
  );
  await writeFile(join(temporary, "transfers.json"), JSON.stringify(transfers));
  const port = await freePort(),
    tlsPort = await freePort(),
    httpPort = await freePort(),
    publicUrl = `https://localhost:${tlsPort}`;
  const initial = {
    ...cleanEnv,
    NODE_ENV: "production",
    PORT: String(port),
    PUBLIC_URL: publicUrl,
    TRUSTED_PROXIES: "127.0.0.1,::ffff:127.0.0.1",
    GRAPHHOPPER_URL: runtime.routerUrl,
    LV_TEST_TRANSFERS: join(temporary, "transfers.json"),
  };
  const setup = [
    "--import",
    pathToFileURL(resolve("tests/helpers/amp-download-preload.mjs")).href,
    join(app, "scripts/install-germany.mjs"),
  ];
  assert.equal(existsSync(join(app, "node_modules")), false);
  assert.equal(existsSync(join(app, "dist")), false);
  console.log(
    "AMP acceptance: fresh checkout, actual documented setup, bounded checked package",
  );
  await run(setup, initial);
  results.push("fresh-setup");
  const envFile = join(app, ".env"),
    saved = await readFile(envFile),
    settings = parseEnv(saved.toString());
  assert.ok(settings.DATA_DIR);
  assert.ok(settings.GEODATA_DIR);
  assert.equal(existsSync(join(app, ".env.germany")), false);
  const repeat = await run(setup, {
    ...cleanEnv,
    LV_TEST_TRANSFERS: join(temporary, "transfers.json"),
  });
  assert.match(repeat, /kein erneuter Download/);
  assert.deepEqual(await readFile(envFile), saved);
  results.push("repeat-setup");
  const caddy = await caddyBinary();
  const template = await readFile("Caddyfile.example", "utf8");
  execFileSync(
    caddy,
    [
      "validate",
      "--config",
      resolve("Caddyfile.example"),
      "--adapter",
      "caddyfile",
    ],
    {
      windowsHide: true,
      env: {
        ...cleanEnv,
        XDG_DATA_HOME: join(temporary, "caddy-data"),
        XDG_CONFIG_HOME: join(temporary, "caddy-config"),
      },
      stdio: "pipe",
    },
  );
  results.push("production-caddyfile-validate");
  const testConfig = template
    .replaceAll("gaminglive.mooo.com", "localhost")
    .replace("http_port 18080", `http_port ${httpPort}`)
    .replace("https_port 18443", `https_port ${tlsPort}`)
    .replace("admin 127.0.0.1:2019", "admin off\n\tskip_install_trust")
    .replace("127.0.0.1:7777", `127.0.0.1:${port}`)
    .replace("https://localhost {", "https://localhost {\n\ttls internal");
  await writeFile(join(temporary, "Caddyfile"), testConfig);
  const proxy = child(
    caddy,
    ["run", "--config", join(temporary, "Caddyfile"), "--adapter", "caddyfile"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...cleanEnv,
        XDG_DATA_HOME: join(temporary, "caddy-data"),
        XDG_CONFIG_HOME: join(temporary, "caddy-config"),
      },
    },
  );
  const caFile = join(
    temporary,
    "caddy-data/caddy/pki/authorities/local/root.crt",
  );
  await waitFor(
    () => existsSync(caFile),
    "Test certificate missing: " + proxy.output(),
  );
  const ca = await readFile(caFile);
  function request(path, body, headers = {}) {
    return new Promise((done, reject) => {
      const req = httpsRequest(
        publicUrl + path,
        {
          ca,
          rejectUnauthorized: true,
          method: body === undefined ? "GET" : "POST",
          headers: {
            Origin: publicUrl,
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
            ...headers,
          },
        },
        (res) => {
          let text = "";
          res.on("data", (b) => (text += b));
          res.on("end", () =>
            done({
              status: res.statusCode,
              headers: res.headers,
              text,
              json: () => JSON.parse(text),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  let beforeStart;
  await waitFor(async () => {
    try {
      beforeStart = await request("/api/health");
      return true;
    } catch (error) {
      if (error.code !== "ECONNREFUSED") throw error;
      return false;
    }
  }, "Caddy did not listen: " + proxy.output());
  assert.equal(beforeStart.status, 502);
  results.push("no-false-readiness");
  async function start() {
    const c = child(process.execPath, [join(app, "scripts/start-germany.mjs")]);
    await waitFor(() => {
      if (c.processChild.exitCode !== null) throw Error(c.output());
      return c.output().includes("Spiel bereit:");
    }, "Game startup deadline");
    return c;
  }
  let game = await start();
  assert.equal((await request("/api/health")).status, 200);
  assert.match((await request("/")).text, /Leitstellen/);
  const password = randomBytes(24).toString("base64url");
  const registration = await request("/api/register", {
    username: "ampcheck",
    password,
    name: "Test",
    station: "AMP Test",
  });
  assert.equal(registration.status, 200, registration.text);
  const login = await request("/api/login", { username: "ampcheck", password });
  assert.equal(login.status, 200, login.text);
  const setCookie = login.headers["set-cookie"][0];
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(";")[0];
  const me = await request("/api/me", undefined, { Cookie: cookie });
  assert.equal(me.status, 200);
  assert.equal(me.headers["cache-control"], "no-store");
  const unauthorized = await request(
    "/api/login",
    { username: "ampcheck", password },
    { Origin: "https://foreign.example" },
  );
  assert.equal(unauthorized.status, 403);
  for (const transport of ["websocket", "polling"]) {
    const socket = io(publicUrl, {
      transports: [transport],
      ca,
      rejectUnauthorized: true,
      extraHeaders: { Cookie: cookie, Origin: publicUrl },
      auth: { csrf: me.json().csrf },
      reconnection: false,
    });
    try {
      await new Promise((done, reject) => {
        const timer = setTimeout(
          () => reject(Error("Socket timeout " + transport)),
          10000,
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
    } finally {
      socket.close();
    }
  }
  results.push("tls-login-secure-cookie-origin-websocket-polling");
  for (const path of [
    "/.env",
    "/.env.germany",
    "/.env.backup",
    "/game.sqlite",
    "/server.lock",
    "/installation.json",
    "/root.key",
    "/scripts/configuration.mjs",
  ])
    assert.equal((await request(path)).status, 404, path);
  assert.equal((await request("/geo/manifest")).status, 200);
  results.push("geo-and-private-file-isolation");
  const redirect = await fetch(`http://127.0.0.1:${httpPort}/api/health`, {
    headers: { Host: "localhost" },
    redirect: "manual",
  });
  assert.equal(redirect.status, 308);
  assert.equal(
    redirect.headers.get("location"),
    "https://localhost/api/health",
  );
  results.push("public-port-redirect");
  const original = me.json();
  await stop(game);
  const dataBytes = await readFile(join(settings.DATA_DIR, "game.sqlite"));
  await unlink(envFile);
  await run(setup, {
    ...cleanEnv,
    LV_TEST_TRANSFERS: join(temporary, "transfers.json"),
  });
  assert.deepEqual(await readFile(envFile), saved);
  assert.deepEqual(
    await readFile(join(settings.DATA_DIR, "game.sqlite")),
    dataBytes,
  );
  results.push("lost-config-recovery");
  game = await start();
  const restored = await request("/api/me", undefined, { Cookie: cookie });
  assert.equal(restored.status, 200);
  assert.equal(restored.json().user.id, original.user.id);
  assert.equal(restored.json().save.money, original.save.money);
  await stop(game);
  results.push("clean-stop-persistent-restart");
  proxy.processChild.kill("SIGTERM");
  await proxy.ended;
  const report = {
    platform: process.platform,
    node: process.version,
    os: existsSync("/etc/os-release")
      ? readFileSync("/etc/os-release", "utf8")
      : process.platform,
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    status: "success",
    checks: results,
    fixture:
      "small checked Germany dataset and external routing contract; actual clean setup/build/server/Caddy/TLS, no public ACME",
  };
  await writeFile(
    ".tools/amp-acceptance/result.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  for (const c of owned) c.kill("SIGKILL");
  if (runtime) await runtime.close();
  await rm(temporary, { recursive: true, force: true });
}
