/** Opt-in real Germany benchmark. Never starts an importer or opens production saves. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, firefox, expect } from "@playwright/test";
import { fork } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const geo = resolve(
  process.env.GEODATA_DIR ||
    resolve(root, "../leitstellen-deutschland-geodata"),
);
const output = resolve(
  root,
  `.tools/screenshots/deutschland-last-${Date.now()}`,
);
const router = process.env.GRAPHHOPPER_URL || "http://127.0.0.1:8989";
const sampleSeconds = Number(process.env.LV_BENCH_SECONDS || 8);
assert.ok(
  Number.isFinite(sampleSeconds) && sampleSeconds >= 5 && sampleSeconds <= 15,
  "Messphase muss5–15s dauern.",
);
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(router).hostname),
  "Nur eigener lokaler Routingdienst.",
);
const manifest = JSON.parse(
  await readFile(resolve(geo, "manifest.json"), "utf8"),
);
const dem = JSON.parse(
  await readFile(resolve(geo, "dem-manifest.json"), "utf8"),
);
assert.equal(manifest.status, "ready");
assert.equal(manifest.worldId, "germany-1");
assert.equal(dem.status, "ready");
const info = await fetch(router + "/info", {
  signal: AbortSignal.timeout(3000),
});
assert.ok(
  info.ok,
  "GraphHopper muss bereits laufen; kein automatischer Import/Start.",
);
await readFile(resolve(root, "dist/client/index.html"));
await mkdir(output, { recursive: true });
const outfile = resolve(root, `.tools/germany-load-server-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(root, "tests/helpers/germany-load-server.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
});
const child = fork(outfile, {
  cwd: root,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe", "ipc"],
  env: {
    ...process.env,
    GEODATA_DIR: geo,
    GRAPHHOPPER_URL: router,
    LV_BENCH_PROJECT: root,
    LV_BENCH_OUTPUT: output,
  },
});
let exited = false,
  browser,
  page,
  pendingId = 0,
  log = "";
const pending = new Map();
const exit = new Promise((done) => {
  child.once("error", (error) => {
    exited = true;
    done({ code: 1, error: error.message });
  });
  child.once("exit", (code, signal) => {
    exited = true;
    done({ code, signal });
  });
});
child.stdout.on("data", (chunk) => {
  log = (log + chunk).slice(-200000);
});
child.stderr.on("data", (chunk) => {
  log = (log + chunk).slice(-200000);
});
const ready = new Promise((done, reject) => {
  let prepared = false;
  const timeout = setTimeout(
    () =>
      reject(
        Error(
          "Vorbereitung des realen Lastservers dauerte länger als 5 Minuten.",
        ),
      ),
    300000,
  );
  child.once("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  child.on("message", (message) => {
    if (message.type === "progress") console.log(message.message);
    if (message.type === "ready") {
      prepared = true;
      clearTimeout(timeout);
      done(message);
    }
    if (message.type === "failed") {
      clearTimeout(timeout);
      reject(Error(message.error));
    }
    if (message.type === "reply") {
      const entry = pending.get(message.id);
      if (entry) {
        clearTimeout(entry.timer);
        pending.delete(message.id);
        entry.done(message.data);
      }
    }
  });
  child.once("exit", (code) => {
    clearTimeout(timeout);
    if (!prepared)
      reject(Error(`Lastserver vor Bereitschaft beendet (${code}): ${log}`));
  });
});
function request(type, values = {}) {
  return new Promise((done, reject) => {
    const id = ++pendingId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error(`Benchmark-IPC-Timeout: ${type}`));
    }, 15000);
    pending.set(id, { done, timer });
    child.send({ id, type, ...values });
  });
}
const stats = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = (p) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ??
    null;
  return {
    count: sorted.length,
    mean: sorted.length
      ? sorted.reduce((a, b) => a + b, 0) / sorted.length
      : null,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted.at(-1) ?? null,
  };
};
const report = {
  startedAt: new Date().toISOString(),
  viewport: { width: 1920, height: 1080 },
  dataset: manifest.dataset,
  dem: dem.sha256,
  status: "preparing",
  phases: [],
  snapshots: [],
  errors: [],
  requests: [],
  findings: [],
  methodology: {
    frameTime:
      "Abstand realer requestAnimationFrame-Callbacks im sichtbaren 1920×1080-Tab; Browsercompositor, keine garantierte physische Display-Latenz.",
    inputLatency:
      "Vertrauenswürdiges Maus-/Tastatur-/Rad-Ereignis bis zur nächsten rAF mit tatsächlich geänderter Kartenkamera; nur Eingaben auf der Karte.",
    websocketBytes:
      "Tatsächlich empfangene Socket.IO-WebSocket-Anwendungsframes nach WebSocket-Dekomprimierung; keine Behauptung über komprimierte TCP-/TLS-Leitungsbytes.",
    server:
      "Eigener Node-Prozess; echte Game.step/Game.view/RouteSnapshotEncoder-Aufrufe. Keine künstlichen tick-Schleifen während der Browsermessung.",
    fixture:
      "500 regulär gekaufte HLF mit automatischen Besatzungen; 100 reguläre Alarmierungen zu 12 vorbereiteten Einsätzen. Vorgegebener Testfortschritt, echte OSM-/GraphHopper-Geometrie und persistente isolierte SQLite. Generatorwahl ist eine separate Prüfung.",
  },
};
try {
  const server = await ready;
  report.fixture = server.fixture;
  report.dataDir = server.dataDir;
  const kind = process.env.LV_BROWSER === "firefox" ? firefox : chromium;
  browser = await kind.launch({
    headless: true,
    ...(process.env.PW_EDGE && kind === chromium ? { channel: "msedge" } : {}),
  });
  report.browser = {
    engine: process.env.LV_BROWSER || "chromium",
    version: browser.version(),
    channel: process.env.PW_EDGE ? "msedge" : "bundled",
  };
  const context = await browser.newContext({ viewport: report.viewport });
  report.profiling = process.env.LV_BENCH_PROFILE === "1";
  await context.addInitScript(() => {
    const data = {
      phase: "",
      frames: {},
      inputs: {},
      longTasks: {},
      pending: [],
      previous: 0,
    };
    Object.defineProperty(window, "__lvLoad", { value: data });
    const camera = () =>
      document
        .querySelector('[data-testid="germany-map-viewport"]')
        ?.getAttribute("data-camera");
    const recordInput = (event) => {
      const target = event.target;
      if (
        !data.phase ||
        !event.isTrusted ||
        !(target instanceof Element) ||
        !target.closest('[data-testid="germany-map-viewport"]')
      )
        return;
      if (
        event.type === "keydown" &&
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "+",
          "-",
          "=",
        ].includes(event.key)
      )
        return;
      data.pending.push({
        at: performance.now(),
        camera: camera(),
        phase: data.phase,
      });
      if (data.pending.length > 30) data.pending.shift();
    };
    for (const name of ["keydown", "wheel", "pointerdown"])
      document.addEventListener(name, recordInput, true);
    const frame = (time) => {
      if (data.phase && data.previous && !document.hidden)
        (data.frames[data.phase] ??= []).push(time - data.previous);
      data.previous = time;
      const current = camera();
      data.pending = data.pending.filter((entry) => {
        if (current && current !== entry.camera) {
          (data.inputs[entry.phase] ??= []).push(time - entry.at);
          return false;
        }
        return time - entry.at < 2000;
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    try {
      new PerformanceObserver((list) => {
        if (data.phase)
          (data.longTasks[data.phase] ??= []).push(
            ...list.getEntries().map((entry) => entry.duration),
          );
      }).observe({ type: "longtask", buffered: false });
    } catch {
      /* not exposed by every engine */
    }
  });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("response", (response) => {
    if (/\/geo\//.test(response.url()))
      report.requests.push({ url: response.url(), status: response.status() });
  });
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      const text =
        typeof payload === "string" ? payload : payload.toString("utf8");
      report.transport ??= { count: 0, prefixes: {} };
      report.transport.count++;
      const prefix = text.startsWith("42[")
        ? text.slice(0, text.indexOf(",")).slice(0, 40)
        : text.slice(0, 2);
      report.transport.prefixes[prefix] =
        (report.transport.prefixes[prefix] || 0) + 1;
      if (!text.startsWith("42")) return;
      try {
        const [event, frame] = JSON.parse(text.slice(2));
        if (event !== "snapshot" || frame.protocol !== "lv-routes-1") return;
        report.snapshots.push({
          at: Date.now(),
          sequence: frame.sequence,
          reset: frame.reset,
          payloadBytes: Buffer.byteLength(text),
          routeBytes: Buffer.byteLength(JSON.stringify(frame.routes)),
          routePayloads: Object.keys(frame.routes).length,
          retained: frame.retain.length,
          vehicles: frame.snapshot.save.vehicles.length,
        });
      } catch (error) {
        report.errors.push(`WebSocket-Messdecoder: ${error.message}`);
      }
    }),
  );
  await page.goto(server.origin);
  await page.getByLabel("Benutzername", { exact: true }).fill(server.username);
  await page.getByLabel("Passwort", { exact: true }).fill(server.password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  const viewport = page.getByTestId("germany-map-viewport"),
    canvas = page.getByLabel("Interaktive Karte von Deutschland");
  async function mapTools(open) {
    const toggle = page.getByRole("button", { name: "Karte", exact: true });
    if ((await toggle.getAttribute("aria-expanded")) !== String(open))
      await toggle.click();
  }
  // The 500-vehicle initial snapshot must finish before measuring camera work.
  await expect(viewport).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".germany-map-message")).toHaveCount(0, {
    timeout: 60000,
  });
  await expect
    .poll(
      () =>
        report.requests.filter(
          (r) => /\/geo\/tiles\//.test(r.url) && r.status === 200,
        ).length,
      { timeout: 60000 },
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        report.requests.filter(
          (r) => /\/geo\/dem\//.test(r.url) && r.status === 200,
        ).length,
      { timeout: 60000 },
    )
    .toBeGreaterThan(0);
  report.graphics = await page.evaluate(() => {
    const canvas = document.querySelector(".maplibregl-canvas");
    const gl = canvas?.getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      hardwareConcurrency: navigator.hardwareConcurrency,
      devicePixelRatio,
      renderer: extension
        ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : gl?.getParameter(gl.RENDERER),
      vendor: extension
        ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)
        : gl?.getParameter(gl.VENDOR),
    };
  });
  async function phase(name, action) {
    await request("phase", { phase: name });
    await page.evaluate((name) => {
      window.__lvLoad.phase = name;
      window.__lvLoad.previous = 0;
      window.__lvLoad.pending = [];
    }, name);
    const start = Date.now();
    await action();
    const elapsed = Date.now() - start;
    if (elapsed < sampleSeconds * 1000)
      await page.waitForTimeout(sampleSeconds * 1000 - elapsed);
    const browserData = await page.evaluate((name) => {
      const store = window.__lvLoad;
      store.phase = "";
      const markers = [...document.querySelectorAll(".germany-marker")];
      const visible = markers.filter((marker) => {
        const r = marker.getBoundingClientRect();
        return (
          r.right > 0 &&
          r.bottom > 0 &&
          r.left < innerWidth &&
          r.top < innerHeight
        );
      });
      return {
        frames: store.frames[name] || [],
        inputs: store.inputs[name] || [],
        longTasks: store.longTasks[name] || [],
        markers: {
          dom: markers.length,
          visible: visible.length,
          vehicles: visible.filter(
            (m) => m.getAttribute("data-testid") === "map-vehicle",
          ).length,
        },
        camera: JSON.parse(
          document
            .querySelector('[data-testid="germany-map-viewport"]')
            .getAttribute("data-camera"),
        ),
        bounds: JSON.parse(
          document
            .querySelector('[data-testid="germany-map-viewport"]')
            .getAttribute("data-bounds"),
        ),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    }, name);
    const live = await request("sample");
    assert.equal(live.live.vehicles, 500);
    assert.equal(
      live.live.moving,
      100,
      "Messphase muss100 aktive Fahrzeuge enthalten.",
    );
    assert.ok(
      browserData.frames.length > 30,
      "Zu wenige tatsächliche Frames für Messung.",
    );
    assert.ok(!browserData.overflow, "HUD läuft über den1920px-Viewport.");
    await page.screenshot({ path: resolve(output, `${name}.png`) });
    report.phases.push({
      name,
      seconds: (Date.now() - start) / 1000,
      framesMs: stats(browserData.frames),
      framePauses: {
        over50ms: browserData.frames.filter((ms) => ms > 50).length,
        over100ms: browserData.frames.filter((ms) => ms > 100).length,
        timeOver50ms: browserData.frames
          .filter((ms) => ms > 50)
          .reduce((sum, ms) => sum + ms, 0),
      },
      inputMs: stats(browserData.inputs),
      longTasksMs: stats(browserData.longTasks),
      markers: browserData.markers,
      camera: browserData.camera,
      bounds: browserData.bounds,
      server: live.live,
    });
    console.log(
      `${name}: rAF p95=${stats(browserData.frames).p95?.toFixed(1)}ms, Eingabe p95=${stats(browserData.inputs).p95?.toFixed(1) ?? "n/a"}ms, Marker=${browserData.markers.visible}, Fahrzeuge aktiv=${live.live.moving}`,
    );
  }
  await phase("01-deutschland", async () => {
    await mapTools(true);
    await page
      .getByRole("button", { name: "Ganz Deutschland", exact: true })
      .click();
    await mapTools(false);
    await expect
      .poll(async () => {
        const bounds = JSON.parse(await viewport.getAttribute("data-bounds"));
        return (
          bounds[0][0] <= 5.5 &&
          bounds[0][1] <= 47.1 &&
          bounds[1][0] >= 15.6 &&
          bounds[1][1] >= 55.2
        );
      })
      .toBe(true);
  });
  const profiler =
    report.profiling && kind === chromium
      ? await context.newCDPSession(page)
      : null;
  if (profiler) {
    await profiler.send("Profiler.enable");
    await profiler.send("Profiler.setSamplingInterval", { interval: 1000 });
    await profiler.send("Profiler.start");
  }
  await phase("02-stadt-und-routen", async () => {
    await mapTools(true);
    await page.getByLabel("Karte durchsuchen").fill("Berlin");
    await page
      .locator(".map-search-results button")
      .filter({ hasText: "Berlin" })
      .filter({ has: page.locator("small").filter({ hasText: /^city$/ }) })
      .first()
      .click();
    await mapTools(false);
    await expect
      .poll(async () => {
        const camera = JSON.parse(await viewport.getAttribute("data-camera"));
        return (
          camera.lon > 13.2 &&
          camera.lon < 13.7 &&
          camera.lat > 52.3 &&
          camera.lat < 52.7 &&
          Math.abs(camera.zoom - 11) < 0.01
        );
      })
      .toBe(true);
    await expect(page.getByTestId("map-vehicle").first()).toBeVisible();
    const incidents = page.getByRole("button", {
      name: /^Einsatzliste (aus|ein)klappen$/,
    });
    if ((await incidents.getAttribute("aria-expanded")) !== "true")
      await incidents.click();
    await page.locator(".mission-card").first().click();
  });
  await phase("03-schwenken", async () => {
    const box = await canvas.boundingBox();
    const x = box.x + box.width * 0.55,
      y = box.y + box.height * 0.5;
    for (let i = 0; i < 5; i++) {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + (i % 2 ? -180 : 180), y + 70, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(350);
    }
  });
  if (profiler) {
    const { profile } = await profiler.send("Profiler.stop");
    await writeFile(
      resolve(output, "city-and-pan.cpuprofile"),
      JSON.stringify(profile),
    );
    await profiler.detach();
    report.profileFile = "city-and-pan.cpuprofile";
  }
  await phase("04-strassendetail", async () => {
    await mapTools(true);
    await page
      .getByRole("button", { name: "Meine Wachen", exact: true })
      .click();
    await mapTools(false);
    await expect
      .poll(
        async () => JSON.parse(await viewport.getAttribute("data-camera")).zoom,
      )
      .toBeCloseTo(13, 1);
    await mapTools(true);
    for (let i = 0; i < 3; i++) {
      await page.getByLabel("Vergrößern", { exact: true }).click();
      await expect
        .poll(
          async () =>
            JSON.parse(await viewport.getAttribute("data-camera")).zoom,
        )
        .toBeCloseTo(14 + i, 1);
    }
    await mapTools(false);
    await canvas.focus();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press(i % 2 ? "ArrowLeft" : "ArrowRight");
      await page.waitForTimeout(150);
    }
  });
  await phase("05-zoom-und-eingaben", async () => {
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, i % 2 ? -150 : 150);
      await page.waitForTimeout(250);
    }
    await canvas.focus();
    await page.keyboard.press("Home");
  });
  report.server = await request("sample");
  report.serverCosts = Object.fromEntries(
    Object.entries(report.server.timings).map(([name, series]) => [
      name,
      Object.fromEntries(
        Object.entries(series).map(([kind, values]) => [kind, stats(values)]),
      ),
    ]),
  );
  report.routeDelta = {
    frames: report.snapshots.length,
    first: report.snapshots.find((f) => f.reset),
    unchangedFrames: report.snapshots.filter(
      (f) => !f.reset && f.routePayloads === 0,
    ).length,
    followupPayloadBytes: stats(
      report.snapshots.filter((f) => !f.reset).map((f) => f.payloadBytes),
    ),
    followupRouteBytes: stats(
      report.snapshots.filter((f) => !f.reset).map((f) => f.routeBytes),
    ),
  };
  assert.ok(
    report.routeDelta.first?.vehicles === 500 &&
      report.routeDelta.first.routePayloads === 500,
    "Erstes reales Snapshot muss alle500 Fahrzeuge enthalten.",
  );
  assert.ok(
    report.routeDelta.unchangedFrames > 0,
    "Keine tatsächliche Folgesynchronisation ohne wiederholte Routengeometrie beobachtet.",
  );
  assert.equal(report.errors.length, 0, report.errors.join("\n"));
  assert.equal(
    report.requests.filter((r) => r.status >= 400).length,
    0,
    "Fehlgeschlagene echte Geodatenanfragen.",
  );
  for (const phase of report.phases) {
    if (phase.framePauses.over100ms)
      report.findings.push(
        `${phase.name}: ${phase.framePauses.over100ms} Framepausen über 100 ms; Maximum ${phase.framesMs.max.toFixed(1)} ms.`,
      );
    if (phase.framesMs.p95 > 34)
      report.findings.push(
        `${phase.name}: p95 Frameabstand${phase.framesMs.p95.toFixed(1)}ms >34ms.`,
      );
    if (phase.inputMs.p95 > 100)
      report.findings.push(
        `${phase.name}: p95 Eingabe/Kamera${phase.inputMs.p95.toFixed(1)}ms >100ms.`,
      );
  }
  for (const [phase, costs] of Object.entries(report.serverCosts))
    if (costs.step.p95 > 1000)
      report.findings.push(
        `${phase}: p95 Simulationsschritt${costs.step.p95.toFixed(1)}ms überschreitet das1s-Intervall.`,
      );
  report.status = report.findings.length
    ? "measured-with-findings"
    : "measured";
} catch (error) {
  report.status = "failed";
  report.error = error.stack || String(error);
  process.exitCode = 1;
  if (page && !page.isClosed()) {
    try {
      await page.screenshot({
        path: resolve(output, "failure.png"),
        fullPage: true,
      });
      report.failureText = (await page.locator("body").innerText()).slice(
        0,
        8000,
      );
    } catch {
      /* Keep the original failure if the browser is unavailable. */
    }
  }
} finally {
  try {
    await browser?.close();
  } catch (error) {
    report.errors.push(`Browser-Shutdown: ${error.message}`);
  }
  if (!exited && child.connected) child.send({ type: "shutdown" });
  await Promise.race([exit, pause(15000)]);
  if (!exited) {
    child.kill("SIGKILL");
    await exit;
    report.errors.push(
      "Eigener Benchmarkserver musste erzwungen beendet werden.",
    );
    process.exitCode = 1;
  }
  for (const entry of pending.values()) clearTimeout(entry.timer);
  report.finishedAt = new Date().toISOString();
  await writeFile(
    resolve(output, "browser-load.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await writeFile(resolve(output, "server.log"), log);
  console.log(
    JSON.stringify({
      status: report.status,
      findings: report.findings,
      report: resolve(output, "browser-load.json"),
    }),
  );
}
