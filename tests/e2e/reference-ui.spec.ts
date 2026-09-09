import { showIncidents, showMapTools } from "./ui-navigation";
import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import { listenBrowserServer } from "./server-helper";
import { nodes, nearest } from "../../src/world";
import { alarm } from "../../src/simulation/dispatch";
import { tick } from "../../src/engine";
import { phaseFixture } from "../phase-fixture";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, origin: string;
test.beforeAll(async () => {
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-reference-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  origin = config.publicUrl;
  const owner = await app.auth.create(
    "reference",
    "Reference-password-123!",
    "Max Berger",
    "Leitstelle Rivermere",
  );
  const s = phaseFixture(owner);
  s.player.name = "Max Berger";
  s.player.station = "Leitstelle Rivermere";
  s.missionWait = 9999;
  const m = s.missions[0];
  m.control!.locationKnown = true;
  m.control!.reportedTemplate = m.template;
  m.control!.calls[0].state = "ended";
  m.pos = nodes[nearest({ x: 4300, y: 3700 })];
  alarm(s, m, [s.vehicles[0].id], owner, "NORMAL", "station");
  tick(s, s.vehicles[0].depart + 40, {}, false, false);
  app.db.save(owner, s);
});
test.afterAll(async () => {
  await app.close();
});
test("PC-Multiplayer-Menü verbindet Leitstellen, Hilfe, Nachrichten und Abmelden", async ({
  page,
}) => {
  await page.goto(origin);
  await page.getByLabel("Benutzername", { exact: true }).fill("reference");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill("Reference-password-123!");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  for (const old of ["Einzelspieler", "Neues Spiel", "Mehrspieler", "Szenario"])
    await expect(
      page.getByRole("button", { name: old, exact: true }),
    ).toHaveCount(0);
  for (const entry of [
    "Leitstellen",
    "Hilfe / Wiki",
    "Neuigkeiten",
    "Einstellungen",
  ]) {
    await page.getByRole("button", { name: entry, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Schließen", exact: true }).click();
  }
  await page.setViewportSize({ width: 900, height: 600 });
  await expect(page.locator(".desktop-required")).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.locator(".desktop-required")).toBeHidden();
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await page
    .getByRole("button", { name: "Abmelden und Spiel verlassen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Anmelden", exact: true }),
  ).toBeVisible();
});
test("Ausfall der Projektmeldungen blockiert weder Menü noch Spielbeitritt", async ({
  page,
}) => {
  await page.route("**/project-news.json", (route) => route.abort("failed"));
  await page.goto(origin);
  await page.getByLabel("Benutzername", { exact: true }).fill("reference");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill("Reference-password-123!");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Neuigkeiten", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Original auf GitHub" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/Philipp284868/Leitstellen-Verbund/discussions/23",
  );
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect(page.locator("svg.map")).toBeVisible();
  await expect(page.locator(".mission-sidebar")).not.toBeVisible();
  await showIncidents(page);
  await expect(page.locator(".mission-card").first()).toBeVisible();
});
for (const size of [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1366, height: 768 },
  { width: 3440, height: 1440 },
])
  test(`Referenzkomposition und bedienbares HUD ${size.width}x${size.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(size);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await page.getByLabel("Benutzername", { exact: true }).fill("reference");
    await page
      .getByLabel("Passwort", { exact: true })
      .fill("Reference-password-123!");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Spielen", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".menu-intel")).toContainText("Max Berger");
    for (const name of [
      "Leitstellen",
      "Hilfe / Wiki",
      "Neuigkeiten",
      "Einstellungen",
      "Abmelden",
    ])
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    if (size.width >= 1000)
      expect(
        await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        })),
      ).toEqual({ width: size.width, height: size.height });
    const folder = resolve(
      process.env.UPDATE_SCREENSHOTS === "1"
        ? "docs/screenshots/2.14"
        : ".tools/screenshots/2.14",
    );
    await mkdir(folder, { recursive: true });
    if (info.project.name === "chromium")
      await page.screenshot({
        path: resolve(folder, `menu-${size.width}.png`),
        fullPage: true,
      });
    await page.getByRole("button", { name: "Spielen", exact: true }).click();
    await showIncidents(page);
    await page.locator(".mission-card").first().click();
    const dock = page.getByRole("complementary", {
      name: "Einsatzdisposition",
      exact: true,
    });
    await expect(dock).toBeVisible();
    await expect(dock.locator(".dock-heading strong")).toHaveText(
      "Brandverdacht gemeldet",
    );
    await expect(page.locator(".scrim")).toHaveCount(0);
    await expect(
      page.locator("svg.map polyline[vector-effect=non-scaling-stroke]"),
    ).not.toHaveCount(0);
    const box = await page.locator("svg.map").boundingBox();
    expect(box!.width).toBe(size.width);
    expect(box!.height).toBeGreaterThan(size.height * 0.7);
    expect(box!.y).toBeCloseTo(62, 0);
    expect(box!.y + box!.height).toBeCloseTo(size.height, 0);
    await expect(page.locator(".bottom-toolbar, .radio-bar")).toHaveCount(0);
    const sidebar = await dock.boundingBox();
    expect(sidebar!.x).toBeGreaterThanOrEqual(0);
    expect(sidebar!.x + sidebar!.width).toBeLessThanOrEqual(size.width);
    expect(sidebar!.y + sidebar!.height).toBeLessThanOrEqual(size.height);
    if (info.project.name === "chromium")
      await page.screenshot({ path: resolve(folder, `hud-${size.width}.png`) });
    await dock.getByRole("button", { name: "Fahrzeuge", exact: true }).click();
    await expect(
      dock.getByRole("button", { name: "Fahrzeuge", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".dispatch-list")).toBeVisible();
    await dock.getByRole("button", { name: "Schließen", exact: true }).click();
    await expect(dock).toHaveCount(0);
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await page.locator('svg.map [aria-label="Brandverdacht gemeldet"]').click();
    await expect(dock).toBeVisible();
    await dock.getByRole("button", { name: "Schließen", exact: true }).click();
    await showMapTools(page);
    const before = await page.locator("svg.map").getAttribute("viewBox");
    await page.getByRole("button", { name: "Vergrößern", exact: true }).click();
    await expect(page.locator("svg.map")).not.toHaveAttribute(
      "viewBox",
      before!,
    );
    await showMapTools(page);
    await expect(page.getByLabel("Karte durchsuchen")).toBeVisible();
    await page.getByLabel("Karte durchsuchen").fill("Rivermere");
    await expect(page.locator(".map-search-results")).toBeVisible();
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await page
      .getByRole("button", { name: "Einstellungen", exact: true })
      .click();
    await page
      .getByRole("tab", { name: "Hinweise & Hilfe", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Sicherungen", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Schließen", exact: true }).click();
    expect(errors).toEqual([]);
  });
