/** Real-data load harness. Only the dedicated temporary benchmark save is opened. */
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { cpus, tmpdir, totalmem } from "node:os";
import { resolve } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { setImmediate as yieldNode } from "node:timers/promises";
import { Auth } from "../../server/auth";
import type { Config } from "../../server/config";
import { Database } from "../../server/database";
import { Game } from "../../server/game";
import { prepareGeography } from "../../server/germany/runtime";
import { RouteSnapshotEncoder } from "../../server/germany/snapshots";
import { startServer } from "../../server/index";
import { apply, generate, tick } from "../../src/engine";
import { meters, project, unproject } from "../../src/germany/projection";
import type {
  RouteSnapshotFrame,
  SnapshotDocument,
} from "../../src/germany/snapshot";
import { fresh, validate } from "../../src/model";
import { xpForLevel } from "../../src/progression";
import { attachIncident, callAction } from "../../src/simulation/calls";
import { alarm } from "../../src/simulation/dispatch";
import { personDuty } from "../../src/simulation/staffing";
import { vehiclePosition } from "../../src/vehicle-position";
import { fundTestBudget } from "../money-fixture";

const projectRoot = resolve(process.env.LV_BENCH_PROJECT || ".");
const output = resolve(process.env.LV_BENCH_OUTPUT!);
const fixtureTime = Date.UTC(2026, 8, 9, 12) / 1000;
const dataDir = await mkdtemp(resolve(tmpdir(), "lv-germany-load-save-"));
const c: Config = {
  host: "127.0.0.1",
  port: 0,
  publicUrl: "http://127.0.0.1:0",
  dataDir,
  secure: false,
  trustedProxies: [],
  geodataDir: resolve(
    process.env.GEODATA_DIR || "../leitstellen-deutschland-geodata",
  ),
  routerUrl: process.env.GRAPHHOPPER_URL || "http://127.0.0.1:8989",
};
type Series = {
  step: number[];
  view: number[];
  encode: number[];
};
let phase = "bootstrap";
const timings: Record<string, Series> = {};
const series = () => (timings[phase] ??= { step: [], view: [], encode: [] });
const measure = (kind: keyof Series, started: number) => {
  const list = series()[kind];
  if (list.length < 2000) list.push(performance.now() - started);
};
const originalStep = Game.prototype.step;
Game.prototype.step = function (...args: Parameters<Game["step"]>) {
  const started = performance.now();
  try {
    return originalStep.apply(this, args);
  } finally {
    measure("step", started);
  }
};
const originalView = Game.prototype.view;
Game.prototype.view = function (...args: Parameters<Game["view"]>) {
  const started = performance.now();
  try {
    return originalView.apply(this, args);
  } finally {
    measure("view", started);
  }
};
const originalEncode = RouteSnapshotEncoder.prototype.encode;
RouteSnapshotEncoder.prototype.encode = function <T extends SnapshotDocument>(
  input: T,
): RouteSnapshotFrame<T> {
  const started = performance.now();
  const result = originalEncode.call(this, input) as RouteSnapshotFrame<T>;
  measure("encode", started);
  return result;
};

let app: ReturnType<typeof startServer> | undefined;
let setupDb: Database | undefined;
let geography: Awaited<ReturnType<typeof prepareGeography>>;
let owner = "",
  stopping = false;
const histogram = monitorEventLoopDelay({ resolution: 10 });
let eventLoopStart = performance.eventLoopUtilization();
const send = (message: unknown) => {
  if (process.connected) process.send?.(message);
};
const status = (message: string) => send({ type: "progress", message });
const report: Record<string, unknown> = {
  dataDir,
  fixtureTime,
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  totalMemoryBytes: totalmem(),
  node: process.version,
  note: "500 regulär gekaufte und besetzte HLF; 100 reguläre Alarmierungen auf echten lokalen Deutschland-Straßen. Künstliche Testleitstelle, keine Produktionsdaten.",
};
function summary() {
  const save = app?.db.all().get(owner);
  return {
    ...report,
    timings,
    memory: process.memoryUsage(),
    eventLoop: {
      utilization: performance.eventLoopUtilization(eventLoopStart),
      meanMs: histogram.mean / 1e6,
      p95Ms: histogram.percentile(95) / 1e6,
      maxMs: histogram.max / 1e6,
    },
    live: save
      ? {
          time: save.time,
          vehicles: save.vehicles.length,
          moving: save.vehicles.filter(
            (v) =>
              ["travel", "return", "transport"].includes(v.status) &&
              !v.journey?.blockedUntil,
          ).length,
          positions: save.vehicles
            .filter((v) => v.status === "travel")
            .slice(0, 8)
            .map((v) => ({
              id: v.id,
              ...unproject(vehiclePosition(v, save.time)),
            })),
        }
      : undefined,
  };
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  histogram.disable();
  await writeFile(
    resolve(output, "server-load.json"),
    JSON.stringify(summary(), null, 2) + "\n",
  );
  setupDb?.close();
  if (app) await app.close();
  else await geography?.close();
  process.exit(code);
}
process.on(
  "message",
  (message: { type?: string; phase?: string; id?: number }) => {
    if (message.type === "phase") {
      phase = String(message.phase).slice(0, 60);
      send({ type: "reply", id: message.id, data: summary() });
    }
    if (message.type === "sample")
      send({ type: "reply", id: message.id, data: summary() });
    if (message.type === "shutdown") void stop();
  },
);
process.once("disconnect", () => void stop());
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());

try {
  status("Prüfe vollständiges Geodatenpaket und lokalen GraphHopper.");
  geography = await prepareGeography(c);
  if (!geography?.maps.dem)
    throw Error(
      "Die Lastprüfung benötigt das vollständig vorbereitete echte Höhenmodell.",
    );
  const geo = geography;
  report.dataset = geo.maps.manifest.dataset;
  report.dem = geo.maps.publicManifest().dem;
  setupDb = new Database(dataDir);
  const password = "Load-" + randomUUID();
  owner = await new Auth(setupDb).create(
    "germany-load",
    password,
    "Lastprüfung",
    "Testleitstelle Berlin",
  );
  const s = fresh("Lastprüfung", "Testleitstelle Berlin", fixtureTime - 10000);
  s.player.id = owner;
  s.seed = 124;
  fundTestBudget(s, 10000000000);
  s.xp = xpForLevel(30);
  s.tutorial = 6;
  s.missionWait = 100000;
  status(
    "Baue 20 Testwachen auf echten Berliner Straßenstandorten und erweitere regulär auf Stufe 8.",
  );
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    const center = project({
      lon: 13.405 + Math.cos(angle) * 0.115,
      lat: 52.52 + Math.sin(angle) * 0.065,
    });
    const candidates = geo.provider.querySites(center, 100, 64);
    const site = candidates.find(
      (p) =>
        geo.provider.isLandSite(p) &&
        s.buildings.every((b) => meters(b.pos, p) > 500),
    );
    if (!site)
      throw Error(
        `Kein realer geeigneter Straßenstandort für Testwache${i + 1}.`,
      );
    apply(s, { type: "build", kind: "fire", pos: { x: site.x, y: site.y } });
    const home = s.buildings.at(-1)!;
    tick(s, home.ready + 1, {}, false, false);
    for (let level = 1; level < 8; level++) {
      apply(s, { type: "upgrade", id: home.id });
      tick(s, home.ready + 1, {}, false, false);
    }
    await yieldNode();
    if (stopping) throw Error("Lastvorbereitung angehalten.");
  }
  tick(s, fixtureTime - 60, {}, false, false);
  status("Kaufe 500 HLF; die Wachen stellen ihre Besatzungen automatisch.");
  for (const home of s.buildings) {
    for (let i = 0; i < 25; i++) {
      apply(s, { type: "buy", kind: "hlf", home: home.id });
    }
    await yieldNode();
    if (stopping) throw Error("Lastvorbereitung angehalten.");
  }
  for (const person of s.people) person.duty = personDuty(s, person);
  for (let i = 0; i < 12; i++) {
    generate(s);
    const mission = s.missions.at(-1)!;
    const site = geo.provider.nearest(
      project({ lon: 13.395 + i * 0.02, lat: 52.522 - i * 0.004 }),
    );
    mission.pos = { x: site.x, y: site.y };
    attachIncident(s, mission);
    const call = mission.control!.calls[0].id;
    callAction(s, mission, call, "accept", owner);
    callAction(s, mission, call, "ask", owner, "address");
    tick(s, s.time + 5, {}, false, false);
    callAction(s, mission, call, "ask", owner, "report");
    callAction(s, mission, call, "end", owner);
  }
  status(
    "Alarmiere 100 Fahrzeuge mit echten lokalen GraphHopper-Fahrtrouten; keine Geometrie wird ersetzt.",
  );
  const active = s.vehicles.filter((_, index) => index % 5 === 0);
  for (let i = 0; i < active.length; i++) {
    alarm(
      s,
      s.missions[i % s.missions.length],
      [active[i].id],
      owner,
      "NORMAL",
      "station",
    );
    tick(s, s.time + 0.3, {}, false, false);
    if (i % 20 === 19) {
      status(`Echte Alarmierungen ${i + 1}/100 vorbereitet.`);
      await yieldNode();
      if (stopping) throw Error("Lastvorbereitung angehalten.");
    }
  }
  tick(s, Math.max(...active.map((v) => v.depart)) + 1, {}, false, false);
  if (
    s.vehicles.length !== 500 ||
    active.length !== 100 ||
    active.some(
      (v) =>
        v.status !== "travel" ||
        v.path.length < 3 ||
        v.journey?.blockedUntil ||
        !v.journey?.motion?.some((p) =>
          p.edge.startsWith(`gh:${geo.maps.manifest.dataset}:`),
        ),
    )
  )
    throw Error(
      "Lastfixture hat keine500 Fahrzeuge mit100 tatsächlich aktiven Deutschland-Straßenfahrten.",
    );
  const minimumRemainingSeconds = Math.min(
    ...active.map((v) => v.arrive - s.time),
  );
  if (minimumRemainingSeconds < 150)
    throw Error(
      `Stadtfahrten für den Messzeitraum zu kurz: ${minimumRemainingSeconds.toFixed(1)}s.`,
    );
  const routeSeed = {
    vehicles: 500,
    moving: 100,
    people: s.people.length,
    stations: s.buildings.length,
    incidents: s.missions.length,
    minimumRemainingSeconds,
    pathPoints: active.map((v) => v.path.length),
    motionPhases: active.map((v) => v.journey!.motion!.length),
    routeSamples: active
      .filter((_, i) => i % 10 === 0)
      .map((v) => ({
        id: v.id,
        start: unproject(v.path[0]),
        end: unproject(v.path.at(-1)!),
        seconds: v.arrive - v.depart,
        distanceMeters: v.journey!.motion!.reduce(
          (sum, p) =>
            sum +
            p.velocity * p.duration +
            (p.acceleration * p.duration * p.duration) / 2,
          0,
        ),
      })),
  };
  report.fixture = routeSeed;
  setupDb.save(owner, validate(s));
  setupDb.close();
  setupDb = undefined;
  app = startServer(c, resolve(projectRoot, "dist/client"), geo);
  await app.listen();
  const address = app.http.address();
  if (!address || typeof address === "string")
    throw Error("Testserver-Port fehlt.");
  c.port = address.port;
  c.publicUrl = `http://127.0.0.1:${address.port}`;
  histogram.enable();
  eventLoopStart = performance.eventLoopUtilization();
  send({
    type: "ready",
    origin: c.publicUrl,
    username: "germany-load",
    password,
    fixture: routeSeed,
    dataDir,
  });
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error);
  send({ type: "failed", error: report.error });
  await stop(1);
}
