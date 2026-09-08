import { openPanel, showIncidents } from "./ui-navigation";
import { listenBrowserServer } from "./server-helper";
import { interviewUI } from "./desk-helpers";
import { test, expect, type Page } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import { established } from "./fixtures";
import { nodes } from "../../src/world";
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
    "Leitstelle Falkenried",
  );
  const s = established("Alex");
  s.player.id = id;
  s.player.station = "Leitstelle Falkenried";
  s.missionWait = 0;
  for (const o of [...s.buildings, ...s.vehicles]) o.owner = id;
  app.db.save(id, s);
  app.game.step(1);
  if (distantIncident) {
    // Keep the real routed journey visible throughout desktop/mobile checks.
    const prepared = app.db.all().get(id)!;
    const mission = prepared.missions[0];
    mission.pos = nodes.find((p) => p.x > 3000 && p.y > 2000)!;
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
  await page
    .getByRole("button", { name: "Weiterspielen", exact: true })
    .click();
  await expect(page.locator(".radio-bar")).toContainText(
    "Mit Spielserver verbunden",
  );
}
test("Modi trennen Guthaben und Wachen, mehrere Tabs und Reload behalten ihre eigene Welt", async ({
  page,
  context,
}) => {
  const { id } = await account(page),
    multi = app.db.all().get(id)!;
  await page
    .getByRole("button", { name: "Einzelspieler", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Einzelspieler", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await play(page);
  await expect(page.locator(".hud-budget")).toContainText("250.000");
  await expect(page.locator("svg.map [data-own-station]")).toHaveCount(0);
  await openPanel(page, "Wachen");
  await page.getByRole("button", { name: "Wache bauen", exact: true }).click();
  await page
    .locator(".shop-card")
    .filter({
      has: page.getByRole("heading", { name: "Feuerwache", exact: true }),
    })
    .getByRole("button", { name: "Platzieren" })
    .click();
  const mapBounds = await page.locator("svg.map").boundingBox();
  await page.locator("svg.map").click({
    position: { x: mapBounds!.width * 0.3, y: mapBounds!.height * 0.55 },
  });
  await page
    .getByRole("button", { name: "Bau bestätigen", exact: true })
    .click();
  await expect(page.locator(".hud-budget")).toContainText("195.000");
  expect(app.db.all().get(id)!.money).toBe(multi.money);
  const second = await context.newPage();
  await second.goto(origin);
  await play(second);
  await expect(second.locator(".hud-mode")).toHaveText("Multiplayer");
  await expect(second.locator("svg.map [data-own-station]")).toHaveCount(1);
  await page.reload();
  await play(page);
  await expect(page.locator(".hud-mode")).toHaveText("Einzelspieler");
  await expect(page.locator(".hud-budget")).toContainText("195.000");
  await page.getByRole("button", { name: "Hauptmenü", exact: true }).click();
  await page.getByRole("button", { name: "Multiplayer", exact: true }).click();
  await play(page);
  await expect(page.locator(".hud-mode")).toHaveText("Multiplayer");
  expect(app.db.all("single").get(id)!.money).toBe(195000);
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
  await expect(b.locator('svg.map [aria-label*="von Alex"]')).toHaveCount(0);
  expect(app.game.view(first.id, new Set()).network.friends).toEqual([]);
  await b.locator(".shared-inbox").click();
  await expect(b.getByLabel("Eigenes Fahrzeug anbieten")).toHaveCount(0);
  await expect(
    b.getByText("Neue Einsätze werden nicht automatisch", { exact: false }),
  ).toBeVisible();
  await b.getByRole("button", { name: "Schließen", exact: true }).click();
  await b.getByRole("button", { name: "Hauptmenü", exact: true }).click();
  await b.getByRole("button", { name: "Einzelspieler", exact: true }).click();
  await play(b);
  await expect(b.locator(".shared-inbox")).toHaveCount(0);
  await expect(b.locator('svg.map [aria-label*="von Alex"]')).toHaveCount(0);
  await ca.close();
  await cb.close();
});
test("HUD und Karte bleiben mobil, im hellen Modus und per Tastatur bedienbar", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await account(page);
  await play(page);
  const mapArea = await page.locator("svg.map").boundingBox();
  await page.getByRole("button", { name: "Layer", exact: true }).click();
  const toolsArea = await page.locator(".map-layers").boundingBox();
  const legendArea = await page.locator(".map-legend").boundingBox();
  expect(toolsArea!.y).toBeGreaterThanOrEqual(mapArea!.y);
  expect(legendArea!.y + legendArea!.height).toBeLessThanOrEqual(
    mapArea!.y + mapArea!.height,
  );
  await page.getByRole("button", { name: "Vergrößern", exact: true }).click();
  await expect(page.locator(".map-legend")).toContainText("125 %");
  await page
    .getByRole("button", { name: "Karte zentrieren", exact: true })
    .click();
  await expect(page.locator(".map-legend")).toContainText("100 %");
  await page.getByLabel("Stadtviertel anzeigen").selectOption("ALTSTADT");
  await expect(page.locator(".map-legend")).toContainText("200 %");
  await page.screenshot({
    path: info.outputPath("karte-altstadt.png"),
    fullPage: true,
  });
  await page.locator("svg.map").focus();
  await page.keyboard.press("Home");
  await expect(page.locator(".map-legend")).toContainText("100 %");
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
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  // A delayed confirmation must not undo a just-clicked controlled checkbox.
  await page.route("**/api/action", async (route) => {
    await new Promise((done) => setTimeout(done, 350));
    await route.continue();
  });
  await page.getByLabel("Heller Modus", { exact: true }).check();
  await expect(page.getByLabel("Heller Modus", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Heller Modus", { exact: true })).toBeEnabled();
  await page.unroute("**/api/action");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(page.locator(".app")).toHaveClass(/light/);
  await page.screenshot({
    path: info.outputPath("hud-hell.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("hud-mobil.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await showIncidents(page);
  await expect(page.locator(".mission-sidebar")).toBeVisible();
  await page.getByRole("button", { name: "Karte", exact: true }).click();
  await expect(page.locator("svg.map")).toBeVisible();
});

test("große Region, echte Fahrzeiten und Fahrtenübersicht funktionieren auf Desktop und Mobil", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { id } = await account(page, true);
  await play(page);
  await expect(page.getByLabel("Spielgeschwindigkeit")).toHaveCount(0);
  await expect(page.locator(".hud-time-mode")).toContainText("Echtzeit");
  await page.getByRole("button", { name: "Layer", exact: true }).click();
  await page
    .getByRole("button", { name: "Gesamte Region", exact: true })
    .click();
  await expect(page.locator("svg.map")).toHaveAttribute(
    "viewBox",
    `0 0 ${100000 / 12} ${100000 / 12}`,
  );
  await page.screenshot({
    path: info.outputPath("region-2.6-gesamt.png"),
    fullPage: true,
  });
  await page.getByLabel("Stadtviertel anzeigen").selectOption("STEINFURT");
  const box = (await page.locator("svg.map").getAttribute("viewBox"))!
    .split(" ")
    .map(Number);
  expect(box[0]).toBeGreaterThan(3000);
  expect(box[1]).toBeGreaterThan(2000);
  await page.screenshot({
    path: info.outputPath("region-2.6-steinfurt.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Meine Wachen", exact: true }).click();
  await page.locator(".mission-card").first().click();
  await interviewUI(page, app);
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
  await expect(page.locator(".operations")).toContainText("bis Ziel");
  await expect(page.locator(".operations")).toContainText("Gesamtstrecke");
  const desktopOps = await page.locator(".operations").boundingBox();
  const desktopWrap = await page.locator(".map-wrap").boundingBox();
  expect(desktopOps!.y + desktopOps!.height).toBeLessThanOrEqual(
    desktopWrap!.y + desktopWrap!.height + 1,
  );
  await page.screenshot({
    path: info.outputPath("region-2.6-fahrten.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".operations")).toBeVisible();
  const operationsBox = await page.locator(".operations").boundingBox();
  const wrapBox = await page.locator(".map-wrap").boundingBox();
  expect(operationsBox!.y + operationsBox!.height).toBeLessThanOrEqual(
    wrapBox!.y + wrapBox!.height + 1,
  );
  await page.screenshot({
    path: info.outputPath("region-2.6-mobil.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
