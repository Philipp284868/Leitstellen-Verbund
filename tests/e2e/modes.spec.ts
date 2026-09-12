import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import { sites as nodes } from "../fixtures/germany/locations";
import { interviewUI } from "./desk-helpers";
import { established } from "./fixtures";
import { listenBrowserServer } from "./server-helper";
import { expect, test, type Page } from "./test";
import {
  toggleMapTools,
  openPanel,
  showIncidents,
  showMapTools,
} from "./ui-navigation";

import { generate } from "../../src/engine";
import { attachIncident } from "../../src/simulation/calls";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
test.setTimeout(45000);
let app: ReturnType<typeof startServer>;
let origin: string;
const password = "World-separation-browser-123!";
test.beforeAll(async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-mode-browser-"));
  const port = 0;
  origin = `http://127.0.0.1:${port}`;
  const config = {
    host: "127.0.0.1",
    port,
    publicUrl: origin,
    dataDir: dir,
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  origin = config.publicUrl;
});
test.afterAll(async () => {
  await app.close();
});
async function account(page: Page, distantIncident = false) {
  const username = "mode-" + crypto.randomUUID().slice(0, 8);
  const id = await app.auth.create(
    username,
    password,
    "Alex",
    "Leitstelle Berlin",
  );
  const s = established("Alex");
  s.player.id = id;
  s.player.station = "Leitstelle Berlin";
  s.missionWait = 0;
  for (const o of [...s.buildings, ...s.vehicles]) o.owner = id;
  generate(s);
  for (const m of s.missions) attachIncident(s, m);
  app.db.save(id, s);
  app.game.step(1);
  if (distantIncident) {
    // Keep the real routed journey visible throughout desktop window checks.
    const prepared = app.db.all().get(id)!;
    const mission = prepared.missions[0];
    mission.pos = nodes[110];
    delete mission.control;
    attachIncident(prepared, mission);
    app.db.save(id, prepared);
  }
  await login(page, username);
  return { id, username };
}
async function login(page: Page, username: string) {
  await page.goto(origin);
  await page.getByLabel("Benutzername", { exact: true }).fill(username);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.locator(".command-menu").waitFor();
}
async function play(page: Page) {
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Leitstellenmenü", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Serververbindung verloren. Bitte die Seite neu laden oder den Support kontaktieren.",
      { exact: true },
    ),
  ).toHaveCount(0);
}
test("Mehrere Tabs und alte Browserpräferenzen öffnen ausschließlich dieselbe Serverwelt", async ({
  page,
  context,
}) => {
  // Three real app boots took 36 seconds on software-rendered CI Firefox,
  // before login, tab checks and browser setup. Keep their assertions intact
  // with a bounded budget for this multi-boot workflow, not the whole suite.
  test.setTimeout(90000);
  await page.addInitScript(() => sessionStorage.setItem("lv-mode", "single"));
  const { id } = await account(page);
  const before = app.db.all().get(id)!;
  await expect(
    page.getByRole("button", { name: "Einzelspieler", exact: true }),
  ).toHaveCount(0);
  await play(page);
  const second = await context.newPage();
  await second.goto(origin);
  await play(second);
  for (const p of [page, second]) {
    await expect(p.locator(".hud-identity")).toContainText("Leitstelle Berlin");
    await expect(
      p.getByRole("button", { name: "Einzelspieler", exact: true }),
    ).toHaveCount(0);
    await expect(
      p.locator(
        "[data-testid=germany-map-viewport] [data-testid=map-station]:not(.friend)",
      ),
    ).toHaveCount(before.buildings.length);
  }
  await page.bringToFront();
  await page.reload();
  await play(page);
  expect(app.db.all("single").size).toBe(0);
  expect(app.db.all().get(id)!.money).toBe(before.money);
  await second.close();
});
test("Multiplayer hält unabhängige Leitstellen und ihre neuen Einsätze privat", async ({
  browser,
}) => {
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  const first = await account(a);
  await account(b);
  await play(b);
  await expect(
    b.locator('[data-testid=germany-map-viewport] [aria-label*="von Alex"]'),
  ).toHaveCount(0);
  expect(app.game.view(first.id, new Set()).network.friends).toEqual([]);
  await openPanel(b, "Freunde");
  await expect(b.getByLabel("Eigenes Fahrzeug anbieten")).toHaveCount(0);
  await expect(
    b.getByText("Neue Einsätze werden nicht automatisch", { exact: false }),
  ).toBeVisible();
  await b.getByRole("button", { name: "Schließen", exact: true }).click();
  await openPanel(b, "Zurück zum Hauptmenü");
  await ca.close();
  await cb.close();
});
test("HUD und Karte bleiben in kleinen Desktopfenstern, im hellen Modus und per Tastatur bedienbar", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await account(page);
  await play(page);
  const mapArea = await page
    .locator("[data-testid=germany-map-viewport]")
    .boundingBox();
  await toggleMapTools(page);
  const toolsArea = await page.locator(".map-layers").boundingBox();
  const scale = page.locator(".maplibregl-ctrl-scale");
  const legendArea = await scale.boundingBox();
  expect(toolsArea!.y).toBeGreaterThanOrEqual(mapArea!.y);
  expect(legendArea!.y + legendArea!.height).toBeLessThanOrEqual(
    mapArea!.y + mapArea!.height,
  );
  await expect(scale).toContainText(/m|km/);
  const viewport = page.getByTestId("germany-map-viewport");
  const zoom = async () =>
    JSON.parse((await viewport.getAttribute("data-camera"))!).zoom;
  const initialZoom = await zoom();
  await page.getByRole("button", { name: "Vergrößern", exact: true }).click();
  await expect.poll(zoom).toBeGreaterThan(initialZoom);
  await page
    .getByRole("button", { name: "Karte zentrieren", exact: true })
    .click();
  await page.getByLabel("Karte durchsuchen").fill("Straße des 17. Juni");
  await page
    .locator(".map-search-results")
    .getByRole("button", { name: "Straße des 17. Juni street", exact: true })
    .click();
  await expect.poll(zoom).toBe(14);
  await page.screenshot({
    path: info.outputPath("karte-berlin.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Interaktive Karte von Deutschland", { exact: true })
    .focus();
  await page.keyboard.press("Home");
  await expect.poll(zoom).toBeLessThan(7);
  await expect(
    page.getByRole("button", { name: "Fahrwege", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Fahrwege", exact: true }).click();
  await page.getByRole("button", { name: "Fahrwege", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Fahrwege", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: info.outputPath("hud-desktop.png"),
    fullPage: true,
  });
  await openPanel(page, "Einstellungen");
  // Display preferences are now a local, explicit draft. Closing must preserve
  // the preview until the user decides, and Apply persists it on this device.
  await page.getByRole("tab", { name: "Anzeige & Karte", exact: true }).click();
  await page.getByLabel("Helle Oberfläche", { exact: true }).check();
  await expect(
    page.getByLabel("Helle Oberfläche", { exact: true }),
  ).toBeChecked();
  await expect(page.locator(".app")).toHaveClass(/light/);
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Weiter bearbeiten", exact: true })
    .click();
  await expect(
    page.getByLabel("Helle Oberfläche", { exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Alle Änderungen gespeichert." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(page.locator(".app")).toHaveClass(/light/);
  await page.screenshot({
    path: info.outputPath("hud-hell.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({
    path: info.outputPath("hud-desktop-compact.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await showIncidents(page);
  await expect(page.locator(".mission-sidebar")).toBeVisible();
  await toggleMapTools(page);
  await expect(
    page.locator("[data-testid=germany-map-viewport]"),
  ).toBeVisible();
});

test("große Region, echte Fahrzeiten und Fahrtenübersicht funktionieren in großen und kleinen Desktopfenstern", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { id } = await account(page, true);
  await play(page);
  await expect(page.getByLabel("Spielgeschwindigkeit")).toHaveCount(0);
  await expect(page.locator(".time-tile time")).toBeVisible();
  await toggleMapTools(page);
  await page
    .getByRole("button", { name: "Ganz Deutschland", exact: true })
    .click();
  const viewport = page.getByTestId("germany-map-viewport");
  await expect
    .poll(async () => {
      const bounds = JSON.parse((await viewport.getAttribute("data-bounds"))!);
      return (
        bounds[0][0] <= 5.5 &&
        bounds[0][1] <= 47.1 &&
        bounds[1][0] >= 15.6 &&
        bounds[1][1] >= 55.2
      );
    })
    .toBe(true);
  await page.screenshot({
    path: info.outputPath("deutschland-gesamt.png"),
    fullPage: true,
  });
  await page.getByLabel("Karte durchsuchen").fill("Straße des 17. Juni");
  await page
    .locator(".map-search-results")
    .getByRole("button", { name: "Straße des 17. Juni street", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        JSON.parse((await viewport.getAttribute("data-camera"))!).zoom,
    )
    .toBe(14);
  await page
    .getByRole("button", { name: "Karte zentrieren", exact: true })
    .click();
  await showIncidents(page);
  await page.locator(".mission-card").first().click();
  await interviewUI(page, app);
  await page.locator(".dispatch-list").scrollIntoViewIfNeeded();
  await expect(page.locator(".dispatch-list")).toContainText("km · ca.");
  await page.locator(".dispatch-list input").first().check();
  await page
    .getByRole("button", { name: "Alarmieren (1)", exact: true })
    .click();
  await expect
    .poll(() => app.db.all().get(id)!.vehicles[0].status)
    .toBe("alarmed");
  const alarmed = app.db.all().get(id)!;
  app.game.step(alarmed.vehicles[0].depart - alarmed.time + 1);
  expect(app.db.all().get(id)!.vehicles[0].status).toBe("travel");
  const initial = app.db.all().get(id)!;
  const eta = initial.vehicles[0].arrive - initial.time;
  expect(eta).toBeGreaterThan(120);
  app.game.step(2);
  expect(
    app.db.all().get(id)!.vehicles[0].arrive - app.db.all().get(id)!.time,
  ).toBeCloseTo(eta - 2, 0);
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await showMapTools(page);
  await expect(page.locator(".operations")).toContainText("bis Ziel");
  await expect(page.locator(".operations")).toContainText("Gesamtstrecke");
  await page.locator(".operations").scrollIntoViewIfNeeded();
  const desktopOps = await page.locator(".operations").boundingBox();
  const desktopWrap = await page.locator(".map-wrap").boundingBox();
  expect(desktopOps!.y + desktopOps!.height).toBeLessThanOrEqual(
    desktopWrap!.y + desktopWrap!.height + 1,
  );
  await page.screenshot({
    path: info.outputPath("region-2.6-fahrten.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(page.locator(".operations")).toBeVisible();
  await page.locator(".operations").scrollIntoViewIfNeeded();
  const operationsBox = await page.locator(".operations").boundingBox();
  const wrapBox = await page.locator(".map-wrap").boundingBox();
  expect(operationsBox!.y + operationsBox!.height).toBeLessThanOrEqual(
    wrapBox!.y + wrapBox!.height + 1,
  );
  await page.screenshot({
    path: info.outputPath("region-desktop-1366.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
