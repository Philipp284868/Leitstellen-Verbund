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
    "Leitstelle Falkenried",
  );
  const s = phaseFixture(owner);
  s.player.name = "Max Berger";
  s.player.station = "Leitstelle Falkenried";
  s.missionWait = 9999;
  const m = s.missions[0];
  m.control!.locationKnown = true;
  m.control!.reportedTemplate = m.template;
  m.control!.calls[0].state = "ended";
  m.pos = nodes[nearest({ x: 640, y: 320 })];
  alarm(s, m, [s.vehicles[0].id], owner, "NORMAL", "station");
  tick(s, s.vehicles[0].depart + 40, {}, false, false);
  app.db.save(owner, s);
});
test.afterAll(async () => {
  await app.close();
});
test("Menüziele, sichere Spielanlage, Szenarien, Moduswechsel und Beenden sind verbunden", async ({
  page,
}) => {
  await page.goto(origin);
  await page.getByLabel("Benutzername", { exact: true }).fill("reference");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill("Reference-password-123!");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  const before = [...app.db.all().values()][0].buildings.map((b) => b.id);
  await page.getByRole("button", { name: "Neues Spiel", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Bestehende Leitstelle fortsetzen",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Szenario", exact: true }).click();
  await page.getByLabel("Einsatzart suchen").fill("Flächenbrand");
  await expect(
    page.getByRole("navigation", { name: "Szenarien" }).getByRole("button"),
  ).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "Szenarien" })
    .getByRole("button")
    .click();
  await expect(page.locator(".scenario-layout article")).toContainText(
    "Brandbekämpfung",
  );
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page
    .getByRole("button", { name: "Einzelspieler", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Einzelspieler", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Neues Spiel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Erste Wache planen", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Mehrspieler", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Leitstellenverbund und Disponenten",
  );
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  expect([...app.db.all().values()][0].buildings.map((b) => b.id)).toEqual(
    before,
  );
  await page.getByRole("button", { name: "Beenden", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Abmelden und Spiel verlassen",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Abmelden und Spiel verlassen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Anmelden", exact: true }),
  ).toBeVisible();
});
for (const size of [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
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
      page.getByRole("button", { name: "Weiterspielen", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".menu-intel")).toContainText("Max Berger");
    for (const name of [
      "Neues Spiel",
      "Mehrspieler",
      "Szenario",
      "Einstellungen",
      "Beenden",
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
    const folder = resolve("docs/screenshots/2.13");
    await mkdir(folder, { recursive: true });
    if (info.project.name === "chromium")
      await page.screenshot({
        path: resolve(folder, `menu-${size.width}.png`),
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "Weiterspielen", exact: true })
      .click();
    await page.locator(".mission-card").first().click();
    const dock = page.getByRole("complementary", {
      name: "Einsatzdisposition",
      exact: true,
    });
    await expect(dock).toBeVisible();
    await expect(page.locator(".incident-desk")).toContainText("Flächenbrand");
    await expect(page.locator(".scrim")).toHaveCount(0);
    await expect(
      page.locator("svg.map polyline[vector-effect=non-scaling-stroke]"),
    ).not.toHaveCount(0);
    const box = await page.locator("svg.map").boundingBox();
    expect(box!.width).toBe(size.width);
    expect(box!.height).toBeGreaterThan(size.height * 0.7);
    const sidebar = await dock.boundingBox();
    expect(sidebar!.x).toBeGreaterThanOrEqual(0);
    expect(sidebar!.x + sidebar!.width).toBeLessThanOrEqual(size.width);
    expect(sidebar!.y + sidebar!.height).toBeLessThan(size.height - 60);
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
    await page.locator('svg.map [aria-label="Flächenbrand"]').click();
    await expect(dock).toBeVisible();
    await dock.getByRole("button", { name: "Schließen", exact: true }).click();
    const before = await page.locator("svg.map").getAttribute("viewBox");
    await page.getByRole("button", { name: "Vergrößern", exact: true }).click();
    await expect(page.locator("svg.map")).not.toHaveAttribute(
      "viewBox",
      before!,
    );
    await page.getByRole("button", { name: "Layer", exact: true }).click();
    await expect(page.getByLabel("Karte durchsuchen")).toBeVisible();
    await page.getByLabel("Karte durchsuchen").fill("Falkenried");
    await expect(page.locator(".map-search-results")).toBeVisible();
    await page.getByRole("button", { name: "Karte", exact: true }).click();
    await page
      .getByRole("button", { name: "Einstellungen", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Sicherungen", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Schließen", exact: true }).click();
    expect(errors).toEqual([]);
  });
