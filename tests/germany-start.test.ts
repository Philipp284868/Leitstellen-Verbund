import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  cp,
  rm,
  symlink,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

let base: string, app: string, data: string, geo: string, harness: string;
const owned = new Set<ChildProcess>();
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
function environment(extra: Record<string, string> = {}) {
  const env = { ...process.env };
  for (const key of [
    "DATA_DIR",
    "GEODATA_DIR",
    "GRAPHHOPPER_URL",
    "HOST",
    "PORT",
    "PUBLIC_URL",
    "ALLOW_HTTP",
    "TRUSTED_PROXIES",
  ])
    delete env[key];
  return {
    ...env,
    DATA_DIR: data,
    GEODATA_DIR: geo,
    LV_FIXTURE_ROOT: app,
    LV_FIXTURE_LOG: resolve(base, "events"),
    LV_FIXTURE_ENV: resolve(base, "game-environment.json"),
    ...extra,
  };
}
async function port() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Testport fehlt");
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}
async function events() {
  try {
    return await readFile(resolve(base, "events"), "utf8");
  } catch {
    return "";
  }
}
async function event(name: string) {
  const deadline = Date.now() + 6000;
  while (!(await events()).includes(name)) {
    if (Date.now() > deadline)
      throw Error(`Lifecycle-Testereignis fehlt: ${name}; ${await events()}`);
    await delay(20);
  }
}
function launch(extra: Record<string, string> = {}) {
  const child = spawn(process.execPath, [harness], {
    cwd: base,
    env: environment(extra),
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  owned.add(child);
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    output += String(chunk);
  });
  const ended = once(child, "exit").then(([code, signal]) => {
    owned.delete(child);
    return { code, signal, output };
  });
  return { child, ended };
}
async function configBinary() {
  const outfile = resolve(app, "dist/germany/server/config.mjs");
  await build({
    stdin: {
      contents:
        'import {config} from "./server/config"; try { console.log(JSON.stringify(config())); } catch(error) { console.error(error.message); process.exitCode=1; }',
      resolveDir: resolve("."),
    },
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    define: { __LV_WORLD__: JSON.stringify("germany-1") },
  });
  return (extra: Record<string, string> = {}) =>
    spawnSync(process.execPath, [outfile], {
      cwd: base,
      env: environment(extra),
      encoding: "utf8",
      windowsHide: true,
    });
}
beforeEach(async () => {
  base = await mkdtemp(resolve(tmpdir(), "lv-germany-start-"));
  app = resolve(base, "app");
  data = resolve(base, "data");
  geo = resolve(base, "geo");
  for (const directory of [
    resolve(app, "dist/germany/server"),
    resolve(app, "scripts/geodata"),
    data,
    geo,
  ])
    await mkdir(directory, { recursive: true });
  await writeFile(resolve(data, "existing-save"), "unmodified-existing-save");
  await writeFile(
    resolve(geo, "manifest.json"),
    JSON.stringify({
      schema: 1,
      status: "ready",
      worldId: "germany-1",
      dataset: "f".repeat(64),
    }),
  );
  await writeFile(resolve(app, "package.json"), '{"type":"module"}');
  await writeFile(
    resolve(app, "dist/germany/server/index.js"),
    `
    import {appendFileSync, writeFileSync} from 'node:fs';
    const log = (value) => appendFileSync(process.env.LV_FIXTURE_LOG, value+'\\n');
    writeFileSync(process.env.LV_FIXTURE_ENV, JSON.stringify({DATA_DIR:process.env.DATA_DIR,GEODATA_DIR:process.env.GEODATA_DIR,GRAPHHOPPER_URL:process.env.GRAPHHOPPER_URL}));
    log('game-started '+process.pid);
    if(process.env.LV_FIXTURE_EXIT) process.exit(Number(process.env.LV_FIXTURE_EXIT));
    setInterval(()=>{},1000);
    process.on('message', (message)=>{
      if(message?.type==='shutdown' && !process.env.LV_FIXTURE_IGNORE)
        setTimeout(()=>{log('game-stopped');process.exit(0);},100);
    });
  `,
  );
  await writeFile(
    resolve(app, "scripts/geodata/pipeline.mjs"),
    `
    import {createServer} from 'node:http';
    import {appendFileSync} from 'node:fs';
    const log = (value) => appendFileSync(process.env.LV_FIXTURE_LOG, value+'\\n');
    const server=createServer((req,res)=>{res.end('{"profiles":[{"name":"car"}]}');});
    log('router-started '+process.pid);
    let stopping=false;
    const timer=setTimeout(()=>{if(!stopping)server.listen(Number(new URL(process.env.LV_FIXTURE_ROUTER).port),'127.0.0.1');},Number(process.env.LV_FIXTURE_DELAY||0));
    const stop=()=>{if(stopping)return;stopping=true;clearTimeout(timer);server.close(()=>{log('router-stopped');process.exit(0);});};
    process.on('message',(message)=>{if(message?.type==='shutdown')stop();});
    process.on('disconnect',stop);
  `,
  );
  harness = resolve(base, "launcher.mjs");
  await writeFile(
    harness,
    `
    import {runGermany} from ${JSON.stringify(pathToFileURL(resolve("scripts/start-germany.mjs")).href)};
    process.exit(await runGermany({programRoot:process.env.LV_FIXTURE_ROOT,routerUrl:process.env.LV_FIXTURE_ROUTER||'http://127.0.0.1:8989',startupTimeoutMs:1000,shutdownTimeoutMs:500}));
  `,
  );
});
afterEach(async () => {
  for (const child of owned) {
    if (child.connected) child.send({ type: "shutdown" });
    else child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), delay(2000)]);
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
  owned.clear();
  const path = relative(resolve(tmpdir()), resolve(base));
  if (!path.startsWith(`lv-germany-start-`) || path.includes(sep))
    throw Error("Unsicherer Test-Aufräumpfad");
  await rm(base, { recursive: true, force: true });
});

describe("Deutschland-Start und Bestandsschutz", () => {
  it("verwendet die eigenen Deutschland-Daten und den eigenen Router aus .env.germany", async () => {
    const legacy = resolve(base, "legacy");
    await mkdir(legacy);
    await writeFile(
      resolve(legacy, "save.sqlite"),
      "bestehender Rivermere-Spielstand",
    );
    const oldConfig = `DATA_DIR="${legacy}"\nGEODATA_DIR="${legacy}"\nGRAPHHOPPER_URL=http://127.0.0.1:1\n`;
    await writeFile(resolve(app, ".env"), oldConfig);
    const germanyConfig = `DATA_DIR="${data}"\nGEODATA_DIR="${geo}"\nGRAPHHOPPER_URL=http://127.0.0.1:8989\n`;
    await writeFile(resolve(app, ".env.germany"), germanyConfig);
    const run = launch({
      DATA_DIR: legacy,
      GEODATA_DIR: legacy,
      GRAPHHOPPER_URL: "http://127.0.0.1:2",
    });
    await event("game-started");
    run.child.send({ type: "shutdown" });
    const result = await run.ended;
    expect(result.code, result.output).toBe(0);
    expect(
      JSON.parse(
        await readFile(resolve(base, "game-environment.json"), "utf8"),
      ),
    ).toEqual({
      DATA_DIR: data,
      GEODATA_DIR: geo,
      GRAPHHOPPER_URL: "http://127.0.0.1:8989",
    });
    expect(await events()).not.toContain("router-started");
    expect(await readFile(resolve(app, ".env"), "utf8")).toBe(oldConfig);
    expect(await readFile(resolve(app, ".env.germany"), "utf8")).toBe(
      germanyConfig,
    );
    expect(await readFile(resolve(legacy, "save.sqlite"), "utf8")).toBe(
      "bestehender Rivermere-Spielstand",
    );
  });

  it("übernimmt keinen alten GRAPHHOPPER_URL-Wert, wenn .env.germany den verwalteten Router nutzt", async () => {
    const router = `http://127.0.0.1:${await port()}`;
    await writeFile(
      resolve(app, ".env.germany"),
      `DATA_DIR="${data}"\nGEODATA_DIR="${geo}"\n`,
    );
    await writeFile(
      resolve(app, ".env"),
      "GRAPHHOPPER_URL=http://127.0.0.1:1\n",
    );
    const run = launch({
      LV_FIXTURE_ROUTER: router,
      GRAPHHOPPER_URL: "http://127.0.0.1:2",
    });
    await event("game-started");
    run.child.send({ type: "shutdown" });
    const result = await run.ended;
    expect(result.code, result.output).toBe(0);
    expect(await events()).toContain("router-started");
    expect(await events()).toContain("router-stopped");
    expect(
      JSON.parse(
        await readFile(resolve(base, "game-environment.json"), "utf8"),
      ),
    ).toEqual({ DATA_DIR: data, GEODATA_DIR: geo, GRAPHHOPPER_URL: router });
  });

  it("startet bei unvollständigen Daten oder fehlendem Spielbuild keinen schweren Routingprozess", async () => {
    await writeFile(
      resolve(geo, "manifest.json"),
      JSON.stringify({
        schema: 1,
        status: "building",
        worldId: "germany-1",
        dataset: "f".repeat(64),
      }),
    );
    let run = launch();
    expect((await run.ended).code).toBe(1);
    expect(await events()).toBe("");
    await writeFile(
      resolve(geo, "manifest.json"),
      JSON.stringify({
        schema: 1,
        status: "ready",
        worldId: "germany-1",
        dataset: "f".repeat(64),
      }),
    );
    await rm(resolve(app, "dist/germany/server/index.js"));
    run = launch();
    const result = await run.ended;
    expect(result.code).toBe(1);
    expect(result.output).toContain("Serverbuild fehlt");
    expect(await events()).toBe("");
  });
  it("beendet Spiel und eigenen Routing-Child vollständig per IPC", async () => {
    const router = `http://127.0.0.1:${await port()}`;
    const run = launch({ LV_FIXTURE_ROUTER: router });
    await event("game-started");
    run.child.send({ type: "shutdown" });
    const result = await run.ended;
    expect(result.code, result.output).toBe(0);
    expect(await events()).toContain("game-stopped");
    expect(await events()).toContain("router-stopped");
    for (const pid of (await events()).matchAll(
      /(?:game|router)-started (\d+)/g,
    ))
      expect(() => process.kill(Number(pid[1]), 0)).toThrow();
    expect(await readFile(resolve(data, "existing-save"), "utf8")).toBe(
      "unmodified-existing-save",
    );
  });
  it("startet während eines Shutdowns in der Routing-Wartephase kein Spiel mehr", async () => {
    const run = launch({
      LV_FIXTURE_ROUTER: `http://127.0.0.1:${await port()}`,
      LV_FIXTURE_DELAY: "900",
    });
    await event("router-started");
    run.child.send({ type: "shutdown" });
    expect((await run.ended).code).toBe(0);
    expect(await events()).toContain("router-stopped");
    expect(await events()).not.toContain("game-started");
  });
  it("schließt nach verlorenem Eltern-IPC und beendet einen hängenden eigenen Child begrenzt", async () => {
    const run = launch({
      GRAPHHOPPER_URL: "http://127.0.0.1:8989",
      LV_FIXTURE_IGNORE: "1",
    });
    await event("game-started");
    run.child.disconnect();
    const result = await run.ended;
    expect(result.code, result.output).toBe(1);
    const pid = Number((await events()).match(/game-started (\d+)/)![1]);
    expect(() => process.kill(pid, 0)).toThrow();
    expect(result.output).toContain("erzwinge deren Stopp");
  });
  it("meldet einen vorzeitigen Spielabbruch als Fehler", async () => {
    const run = launch({
      GRAPHHOPPER_URL: "http://127.0.0.1:8989",
      LV_FIXTURE_EXIT: "9",
    });
    const result = await run.ended;
    expect(result.code, result.output).toBe(9);
    expect(await events()).not.toContain("router-started");
  });
  it("lässt einen fremden TCP-Listener unverändert und startet keinen eigenen Dienst", async () => {
    const server = createServer((socket) => socket.end());
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw Error("Listener fehlt");
    try {
      const run = launch({
        LV_FIXTURE_ROUTER: `http://127.0.0.1:${address.port}`,
      });
      const result = await run.ended;
      expect(result.code).toBe(1);
      expect(result.output).toContain("bereits belegt");
      expect(server.listening).toBe(true);
      expect(await events()).toBe("");
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
  it("lehnt fehlendes DATA_DIR auch beim direkten Deutschland-Binary ab", async () => {
    const run = await configBinary();
    const result = run({ DATA_DIR: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ausdrücklich gesetztes eigenes DATA_DIR");
    await expect(access(resolve(base, "leitstellen-data"))).rejects.toThrow();
  });
  it("verhindert beide Verschachtelungsrichtungen von Spiel- und Geodaten", async () => {
    const run = await configBinary();
    const nestedGeo = resolve(data, "geo");
    await mkdir(nestedGeo);
    const variants: Record<string, string>[] = [
      { DATA_DIR: resolve(geo, "game") },
      { GEODATA_DIR: nestedGeo },
    ];
    for (const extra of variants) {
      const result = run(extra);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("getrennte Verzeichnisse");
    }
    expect(await readFile(resolve(data, "existing-save"), "utf8")).toBe(
      "unmodified-existing-save",
    );
  });
  it("löst relative Datenpfade gegen das Programm und nicht den Start-CWD auf", async () => {
    const run = await configBinary();
    const result = run({ DATA_DIR: "../data", GEODATA_DIR: "../geo" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      dataDir: data,
      geodataDir: geo,
    });
  });
  it("löscht bei einem umgeleiteten Buildverzeichnis keine vorhandenen Daten", async () => {
    const buildApp = resolve(base, "build-app");
    await mkdir(resolve(buildApp, "scripts"), { recursive: true });
    await mkdir(resolve(data, "worlds"));
    await writeFile(resolve(data, "worlds/save"), "persistent-world");
    await symlink(
      data,
      resolve(buildApp, "dist"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await cp(
      resolve("scripts/build.mjs"),
      resolve(buildApp, "scripts/build.mjs"),
    );
    const result = spawnSync(process.execPath, ["scripts/build.mjs"], {
      cwd: buildApp,
      encoding: "utf8",
      windowsHide: true,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Buildverzeichnis darf nicht");
    expect(await readFile(resolve(data, "worlds/save"), "utf8")).toBe(
      "persistent-world",
    );
  });
});
