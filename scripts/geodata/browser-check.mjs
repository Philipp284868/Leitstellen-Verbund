/** Opt-in acceptance against the complete local Germany package. Never opens production saves. */
import { build } from "esbuild";
import { chromium, firefox, expect } from "@playwright/test";
import { access, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setImmediate as yieldNode } from "node:timers/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const geodataDir = resolve(
  root,
  process.env.GEODATA_DIR || "../leitstellen-deutschland-geodata",
);
const output = resolve(
  root,
  process.env.LV_ACCEPTANCE_OUTPUT || ".tools/screenshots/deutschland",
);
await mkdir(output, { recursive: true });
const fixture = resolve(
  root,
  `.tools/germany-browser-fixture-${process.pid}.mjs`,
);
await build({
  entryPoints: [resolve(root, "tests/germany-simulation-fixture.ts")],
  outfile: fixture,
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
});
const f = await import(pathToFileURL(fixture).href);
const c = {
  host: "127.0.0.1",
  port: 0,
  publicUrl: "http://127.0.0.1:0",
  dataDir: await mkdtemp(resolve(tmpdir(), "lv-germany-acceptance-")),
  secure: false,
  trustedProxies: [],
  geodataDir,
  routerUrl: process.env.GRAPHHOPPER_URL || "http://127.0.0.1:8989",
};
let app, browser, page;
const report = {
  at: new Date().toISOString(),
  browser: process.env.LV_BROWSER || "chromium",
  dataDir: c.dataDir,
  checks: [],
  screenshots: [],
  pageErrors: [],
  failedRequests: [],
  tiles: { vector: 0, dem: 0 },
  note: "Neue isolierte Testleitstelle; Spielzeit wird im Prüflauf gezielt über die echte Serverlogik fortgeschaltet. Dies ist keine Echtzeit-Leistungsmessung.",
};
async function start() {
  await access(resolve(root, "dist/client/index.html"));
  const geography = await f.prepareGeography(c);
  let candidate;
  try {
    candidate = f.startServer(c, resolve(root, "dist/client"), geography);
    await candidate.listen();
  } catch (error) {
    if (candidate) await candidate.close();
    else await geography?.close();
    throw error;
  }
  app = candidate;
  c.port = app.http.address().port;
  c.publicUrl = `http://127.0.0.1:${c.port}`;
  return geography;
}
async function advance(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 14400)
    throw Error(`Ungültiger Prüfschritt: ${seconds} Sekunden.`);
  for (let remaining = seconds; remaining > 0; remaining -= 60) {
    app.game.step(Math.min(60, remaining));
    await yieldNode();
  }
}
const password = "Germany-isolated-browser-test!";
try {
  const geo = await start();
  report.dataset = geo.maps.manifest.dataset;
  if (!geo.maps.publicManifest().dem)
    throw Error(
      "Die Kartenabnahme benötigt das vollständig vorbereitete Höhenmodell.",
    );
  report.dem = geo.maps.publicManifest().dem;
  const owner = await app.auth.create(
    "germany-browser",
    password,
    "Abnahme Berlin",
    "Testleitstelle Berlin",
  );
  const s = f.fresh(
    "Abnahme Berlin",
    "Testleitstelle Berlin",
    Date.now() / 1000,
  );
  s.player.id = owner;
  s.seed = 124;
  s.xp = f.xpForLevel(30);
  f.fundTestBudget(s, 10000000);
  s.tutorial = 6;
  s.missionWait = 100000;
  const facility = geo.provider.facilities.query({
    kind: "fire",
    usable: true,
    search: "Berlin",
    limit: 100,
  })[0];
  if (!facility) throw Error("Kein realer Berliner Teststandort im Katalog.");
  f.apply(s, { type: "purchase-facility", facility: facility.id });
  f.tick(s, s.buildings[0].ready + 1, {}, false, false);
  const home = s.buildings[0].id;
  s.buildings[0].organization = {
    kind: "bf",
    turnout: 30,
    crew: "normal",
    reserve: 0,
  };
  for (const kind of ["hlf", "tlf"]) {
    f.apply(s, { type: "buy", kind, home });
  }
  const b = geo.provider.nearest(f.project({ lon: 13.43, lat: 52.51 }));
  const mission = f.fixtureMission(s, "field", { x: b.x, y: b.y });
  s.missions = [mission];
  s.seed = 124;
  f.attachIncident(s, mission);
  s.missionWait = 100000;
  app.db.save(owner, s);
  const firstId = s.vehicles[0].id,
    secondId = s.vehicles[1].id;
  report.fixture = {
    note: "Isolierte Testleitstelle mit zwei ausgebildeten Fahrzeugbesatzungen; echte Deutschlandgeodaten.",
    mission: mission.id,
    home: s.buildings[0].pos,
    destination: mission.pos,
  };
  const kind = process.env.LV_BROWSER === "firefox" ? firefox : chromium;
  browser = await kind.launch({
    headless: true,
    ...(process.env.PW_EDGE && kind === chromium ? { channel: "msedge" } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    reducedMotion: "reduce",
  });
  page = await context.newPage();
  page.on("pageerror", (e) => report.pageErrors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && /\/geo\//.test(r.url()))
      report.failedRequests.push({ url: r.url(), status: r.status() });
    if (r.status() === 200) {
      const pathname = new URL(r.url()).pathname;
      if (/^\/geo\/tiles\/\d+\/\d+\/\d+\.pbf$/.test(pathname))
        report.tiles.vector++;
      if (/^\/geo\/dem\/\d+\/\d+\/\d+\.png$/.test(pathname)) report.tiles.dem++;
    }
  });
  page.setDefaultTimeout(20000);
  const capture = async (name) => {
    if (await page.getByTestId("germany-map-viewport").isVisible())
      await expect(page.getByTestId("germany-map-viewport")).toHaveAttribute(
        "data-camera-moving",
        "false",
      );
    await expect(page.locator("body")).not.toContainText("Illegal invocation");
    await expect(
      page.locator(".germany-map-message[role=alert], .germany-scene-error"),
    ).toHaveCount(0);
    await page.screenshot({
      path: resolve(output, name + ".png"),
      fullPage: true,
    });
    report.screenshots.push(name + ".png");
    console.log(`Deutschland-Abnahme: ${name}`);
  };
  const snap = () => app.db.all().get(owner);
  const vehicle = (id) => snap().vehicles.find((v) => v.id === id);
  const incident = () => snap().missions.find((m) => m.id === mission.id);
  const button = (name) => page.getByRole("button", { name, exact: true });
  async function showIncidents(target = page) {
    const toggle = target.getByRole("button", {
      name: /^Einsatzliste (aus|ein)klappen$/,
    });
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click();
  }
  async function mapTools(open) {
    const toggle = button("Karte");
    if ((await toggle.getAttribute("aria-expanded")) !== String(open))
      await toggle.click();
  }
  async function mapButton(name) {
    await mapTools(true);
    await button(name).click();
    await mapTools(false);
  }
  async function search(name) {
    await mapTools(true);
    await page.getByLabel("Karte durchsuchen").fill(name);
    await page
      .locator(".map-search-results button")
      .filter({ hasText: name })
      .first()
      .click();
    await mapTools(false);
    await expect(page.getByTestId("germany-map-viewport")).toHaveAttribute(
      "data-camera-moving",
      "false",
    );
  }
  await page.goto(c.publicUrl);
  await page
    .getByLabel("Benutzername", { exact: true })
    .fill("germany-browser");
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await button("Anmelden").click();
  await expect(button("Spielen")).toBeVisible();
  await expect(page.getByTestId("germany-menu-map")).toHaveCount(2);
  for (const scene of await page.getByTestId("germany-menu-map").all())
    await expect(scene).toHaveAttribute("data-ready", "true", {
      timeout: 60000,
    });
  await capture("01-hauptmenue");
  await expect(page.locator(".germany-scene-error")).toHaveCount(0);
  await button("Spielen").click();
  await showIncidents();
  await expect(page.locator(".germany-map-message")).toHaveCount(0, {
    timeout: 60000,
  });
  await mapButton("Ganz Deutschland");
  await expect
    .poll(() => report.tiles.vector, { timeout: 60000 })
    .toBeGreaterThan(0);
  await expect
    .poll(() => report.tiles.dem, { timeout: 60000 })
    .toBeGreaterThan(0);
  await capture("02-deutschland-uebersicht");
  async function assertWholeGermany() {
    await expect
      .poll(async () => {
        const bounds = JSON.parse(
          (await page
            .getByTestId("germany-map-viewport")
            .getAttribute("data-bounds")) || "null",
        );
        return (
          bounds &&
          bounds[0][0] <= 5.5 &&
          bounds[0][1] <= 47.1 &&
          bounds[1][0] >= 15.6 &&
          bounds[1][1] >= 55.2
        );
      })
      .toBe(true);
  }
  await assertWholeGermany();
  report.checks.push("Echte Deutschlandkarte und HUD bereit; Gesamtübersicht");
  await search("Berlin");
  await capture("03-berlin-region");
  await search("Schierke");
  await capture("04-dorf-und-harz");
  await search("Berlin");
  await mapButton("Meine Wachen");
  await mapTools(true);
  await page.getByLabel("Vergrößern", { exact: true }).click();
  await page.getByLabel("Vergrößern", { exact: true }).click();
  await mapTools(false);
  await capture("05-strassendetail");
  const canvas = page.getByLabel("Interaktive Karte von Deutschland");
  await canvas.focus();
  await page.keyboard.press("Home");
  await expect
    .poll(
      async () =>
        JSON.parse(
          await page
            .getByTestId("germany-map-viewport")
            .getAttribute("data-camera"),
        ).zoom,
    )
    .toBeLessThan(7);
  await mapTools(true);
  await page.getByLabel("Karte durchsuchen").fill("Hamburg");
  await page.getByLabel("Karte durchsuchen").press("Home");
  await expect(page.getByLabel("Karte durchsuchen")).toHaveValue("Hamburg");
  await button("Suche löschen").click();
  await mapButton("Meine Wachen");
  await showIncidents();
  await page.locator(".mission-card").first().click();
  await button("Notruf annehmen").click();
  await expect.poll(() => incident().control.calls[0].state).toBe("active");
  await button("Wo genau ist der Notfall?").click();
  await expect.poll(() => incident().control.locationKnown).toBe(true);
  await advance(5);
  await button("Was ist passiert?").click();
  await expect.poll(() => incident().control.reportedTemplate).not.toBe("");
  await button("Gespräch beenden").click();
  await expect.poll(() => incident().control.calls[0].state).toBe("ended");
  await page
    .locator(".dispatch-list label")
    .filter({ hasText: s.vehicles[0].name })
    .locator("input")
    .check();
  await button("Alarmieren (1)").click();
  await expect.poll(() => vehicle(firstId).status).toBe("alarmed");
  let state = snap();
  report.trip = {
    points: state.vehicles[0].path.length,
    journey: state.vehicles[0].journey,
    depart: state.vehicles[0].depart,
    arrive: state.vehicles[0].arrive,
  };
  expect(report.trip.points).toBeGreaterThan(2);
  expect(
    state.vehicles[0].journey.motion.some((p) =>
      p.edge.startsWith(`gh:${report.dataset}:`),
    ),
  ).toBe(true);
  await advance(Math.max(0, state.vehicles[0].depart - state.time) + 1);
  expect(snap().desk.fleet[firstId].code).toBe(3);
  await expect(page.locator(".incident-desk")).toContainText("FMS 3");
  await expect(
    page
      .locator(".dispatch-list label")
      .filter({ hasText: s.vehicles[1].name }),
  ).toContainText(/\d.*(?:km|min)/);
  await capture("06-einsatz-und-anfahrt");
  const colleague = await context.newPage();
  colleague.on("pageerror", (e) => report.pageErrors.push(e.message));
  await colleague.goto(c.publicUrl);
  await colleague.getByRole("button", { name: "Spielen", exact: true }).click();
  await showIncidents(colleague);
  await expect(colleague.locator(".germany-map-message")).toHaveCount(0, {
    timeout: 60000,
  });
  await colleague.locator(".mission-card").first().click();
  await expect(colleague.locator(".incident-desk")).toContainText("FMS 3");
  const cameraBefore = await colleague
    .getByTestId("germany-map-viewport")
    .getAttribute("data-camera");
  await page.bringToFront();
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect(colleague.getByTestId("germany-map-viewport")).toHaveAttribute(
    "data-camera",
    cameraBefore,
  );
  await colleague.close();
  report.checks.push(
    "Zwei reale Browseransichten derselben Leitstelle sehen denselben Einsatz/FMS-Stand; Kamerabewegung bleibt lokal",
  );
  state = snap();
  const pathBefore = JSON.stringify(state.vehicles[0].path);
  const stopping = app;
  app = undefined;
  await stopping.close();
  await start();
  expect(JSON.stringify(snap().vehicles[0].path)).toBe(pathBefore);
  await page.reload();
  await button("Spielen").click();
  await showIncidents();
  await page.locator(".mission-card").first().click();
  state = snap();
  await advance(Math.max(0, state.vehicles[0].arrive - state.time) + 1);
  expect(vehicle(firstId).status).toBe("scene");
  await button("Lagemeldung aufnehmen").click();
  await expect.poll(() => incident().control.briefed).toBe(true);
  await advance(1);
  await button("Nachforderung bearbeiten").click();
  await expect
    .poll(() =>
      incident().control.events.some(
        (e) => e.type === "REINFORCEMENT_REQUESTED",
      ),
    )
    .toBe(true);
  await page
    .locator(".dispatch-list label")
    .filter({ hasText: s.vehicles[1].name })
    .locator("input")
    .check();
  await button("Alarmieren (1)").click();
  await expect.poll(() => vehicle(secondId).status).toBe("alarmed");
  state = snap();
  await advance(Math.max(0, state.vehicles[1].arrive - state.time) + 1000);
  await expect(
    page.getByText("Dieser Einsatz ist abgeschlossen.", { exact: false }),
  ).toBeVisible();
  expect(snap().archive.some((m) => m.id === mission.id)).toBe(true);
  await capture("07-einsatzabschluss");
  await button("Schließen").click();
  await button("Archiv").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Einsatzberichte", exact: true })
    .click();
  await button("Verlauf ansehen").first().click();
  await expect(page.locator(".incident-history")).toContainText(
    "Erste Erkundung",
  );
  await capture("08-historie");
  report.checks.push(
    "Notruf, freie Alarmierung, reale Fahrt/FMS3, Serverneustart mit gleichem Fahrweg, Lagemeldung, Nachforderung, Abschluss und persistente Historie",
  );
  await button("Schließen").click();
  if (await button("Schließen").isVisible()) await button("Schließen").click();
  await button("Wachen").click();
  await button("Wache bauen").click();
  await page
    .locator(".shop-card")
    .filter({
      has: page.getByRole("heading", { name: "Feuerwache", exact: true }),
    })
    .getByRole("button", { name: "Platzieren" })
    .click();
  await search("Berlin");
  const count = snap().buildings.length;
  // Convert unobscured canvas pixels using its public north-up Mercator camera.
  // The authenticated server chooses the real nearby road node and validates it.
  const pixels = await canvas.evaluate((element) => {
    const box = element.getBoundingClientRect(),
      camera = JSON.parse(element.closest(".germany-viewport").dataset.camera),
      worldSize = 512 * 2 ** camera.zoom,
      radians = Math.PI / 180,
      centerX = (camera.lon + 180) / 360,
      centerY =
        (1 -
          Math.log(Math.tan(Math.PI / 4 + (camera.lat * radians) / 2)) /
            Math.PI) /
        2,
      candidates = [];
    for (const fx of [0.6, 0.5, 0.7, 0.4, 0.8])
      for (const fy of [0.55, 0.65, 0.45, 0.75, 0.35]) {
        const x = box.width * fx,
          y = box.height * fy;
        if (document.elementFromPoint(box.left + x, box.top + y) !== element)
          continue;
        const mx = centerX + (x - box.width / 2) / worldSize,
          my = centerY + (y - box.height / 2) / worldSize;
        candidates.push({
          x,
          y,
          lon: mx * 360 - 180,
          lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) / radians,
        });
      }
    return candidates;
  });
  let chosen;
  for (const pixel of pixels) {
    const p = f.project(pixel);
    const response = await context.request.get(`${c.publicUrl}/api/geo/site`, {
      params: { x: p.x, y: p.y, type: "fire" },
      headers: { "x-game-mode": "multi" },
    });
    expect(response.ok()).toBe(true);
    const site = await response.json();
    if (!site.reason) {
      chosen = { pixel, site };
      break;
    }
  }
  if (!chosen)
    throw Error(
      "Kein legaler freier Bauplatz im aktuellen Berliner Kartenausschnitt.",
    );
  await canvas.click({ position: { x: chosen.pixel.x, y: chosen.pixel.y } });
  await expect(button("Bau bestätigen")).toBeEnabled();
  await button("Bau bestätigen").click();
  await expect.poll(() => snap().buildings.length).toBe(count + 1);
  const built = snap().buildings.at(-1);
  expect(
    Math.hypot(
      built.pos.x - chosen.site.point.x,
      built.pos.y - chosen.site.point.y,
    ),
  ).toBeLessThan(1);
  report.placement = {
    clicked: chosen.pixel,
    nodeId: chosen.site.nodeId,
    built: built.pos,
  };
  report.checks.push("Realer Bauplatz über Karte geprüft und gekauft");
  for (const [width, height] of [
    [1366, 768],
    [2560, 1440],
    [3440, 1440],
  ]) {
    await page.setViewportSize({ width, height });
    await mapButton("Ganz Deutschland");
    await capture(`09-hud-${width}x${height}`);
    await assertWholeGermany();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(report.pageErrors).toEqual([]);
  expect(report.failedRequests).toEqual([]);
  report.status = "passed";
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
      report.screenshots.push("failure.png");
    } catch {
      /* Preserve the original failure when the browser has died. */
    }
  }
} finally {
  for (const close of [() => browser?.close(), () => app?.close()]) {
    try {
      await close();
    } catch (error) {
      (report.cleanupErrors ||= []).push(String(error));
      report.status = "failed";
      process.exitCode = 1;
    }
  }
  await writeFile(
    resolve(output, "acceptance.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      status: report.status,
      checks: report.checks,
      report: resolve(output, "acceptance.json"),
    }),
  );
}
