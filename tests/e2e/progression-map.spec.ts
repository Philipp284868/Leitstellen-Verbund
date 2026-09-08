import { test, expect } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import type { Config } from "../../server/config";
import { listenBrowserServer } from "./server-helper";
import { phaseFixture } from "../phase-fixture";
import { beginTrip } from "../../src/engine";
import { nodes, nearest } from "../../src/world";
import { regionTowns } from "../../src/region-extension";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, config: Config, vehicleName: string;
test.beforeEach(async () => {
  config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    secure: false,
    trustedProxies: [],
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-map-v3-")),
  };
  app = await listenBrowserServer(compiled.startServer, config);
  const owner = await app.auth.create(
    "maptest",
    "Map-browser-password-123!",
    "Karte",
    "Karte",
  );
  const s = phaseFixture(owner);
  s.missions = [];
  s.environment = undefined;
  const v = s.vehicles[0];
  beginTrip(s, v, nodes[200], "return");
  vehicleName = v.name;
  s.buildings[0].pos = nodes[200];
  app.db.save(owner, s);
});
test(
  "großer Browserbestand mit 100 Wachen, 500 Fahrzeugen und 40 Einsätzen bleibt bedienbar",
  { tag: "@load" },
  async ({ page }, info) => {
    const [owner, s] = [...app.db.all()][0];
    const building = structuredClone(s.buildings[0]),
      unit = structuredClone(s.vehicles[1]);
    s.missions = [];
    s.buildings = [];
    s.vehicles = [];
    s.people = [];
    s.desk.fleet = {};
    for (let i = 0; i < 100; i++) {
      const pos = nodes[nearest(regionTowns[i % regionTowns.length])];
      s.buildings.push({
        ...building,
        id: `load-home-${i}`,
        name: `Lastwache ${i}`,
        pos,
        level: 2,
      });
      for (let j = 0; j < 5; j++) {
        const v = {
          ...structuredClone(unit),
          id: `load-unit-${i}-${j}`,
          name: `Lastfahrzeug ${i}-${j}`,
          home: `load-home-${i}`,
          path: [pos],
          status: "ready" as const,
        };
        if (j === 0) {
          v.path = [nodes[nearest(regionTowns[(i + 5) % regionTowns.length])]];
          beginTrip(s, v, pos, "return");
        }
        s.vehicles.push(v);
      }
    }
    for (let i = 0; i < 40; i++)
      s.missions.push({
        id: `load-mission-${i}`,
        template: "bin",
        pos: nodes[nearest(regionTowns[i % regionTowns.length])],
        progress: 0,
        phase: "offered",
        created: s.time,
        completed: 0,
        shared: false,
        round: `load-round-${i}`,
        contributors: [],
        transports: [],
      });
    app.db.save(owner, s);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1600, height: 1000 });
    const started = Date.now();
    await page.goto(config.publicUrl);
    await page.getByLabel("Benutzername", { exact: true }).fill("maptest");
    await page
      .getByLabel("Passwort", { exact: true })
      .fill("Map-browser-password-123!");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await page.getByRole("button", { name: "Spielen", exact: true }).click();
    await page.getByRole("button", { name: "Layer", exact: true }).click();
    await expect(
      page.getByText("Region Falkenried · 100 × 100 km", { exact: true }),
    ).toBeVisible();
    const readyMs = Date.now() - started;
    const before = Date.now();
    if (
      (await page
        .getByRole("button", { name: "Layer", exact: true })
        .getAttribute("aria-pressed")) !== "true"
    )
      await page.getByRole("button", { name: "Layer", exact: true }).click();
    await page
      .getByRole("button", { name: "Gesamte Region", exact: true })
      .click();
    await page
      .getByLabel("Karte durchsuchen", { exact: true })
      .fill("Lastfahrzeug 99-4");
    await page
      .locator(".map-search-results")
      .getByRole("button", { name: "Lastfahrzeug 99-4", exact: true })
      .click();
    await expect(page.getByLabel("Ausgewähltes Fahrzeug")).toContainText(
      "Lastfahrzeug 99-4",
    );
    const metrics = {
      browser: info.project.name,
      buildings: 100,
      vehicles: 500,
      activeTrips: 100,
      missions: 40,
      loginAndOpenMs: readyMs,
      overviewSearchSelectMs: Date.now() - before,
      svgElements: await page.locator("svg.map *").count(),
    };
    await writeFile(
      info.outputPath("large-map-performance.json"),
      JSON.stringify(metrics, null, 2),
    );
    await page.screenshot({
      path: info.outputPath("region-large-fleet.png"),
      fullPage: true,
    });
    expect(metrics.overviewSearchSelectMs).toBeLessThan(10000);
    expect(errors).toEqual([]);
  },
);
test.afterEach(async () => {
  await app.close();
});
test("reale Karte: Übersicht, Suche, Filter, ausgewählte Fahrtdaten, Folgen, kleine Desktopansicht und Wiederverbindung", async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(config.publicUrl);
  await page.getByLabel("Benutzername", { exact: true }).fill("maptest");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill("Map-browser-password-123!");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await page.getByRole("button", { name: "Layer", exact: true }).click();
  await expect(
    page.getByText("Region Falkenried · 100 × 100 km", { exact: true }),
  ).toBeVisible();
  if (
    (await page
      .getByRole("button", { name: "Layer", exact: true })
      .getAttribute("aria-pressed")) !== "true"
  )
    await page.getByRole("button", { name: "Layer", exact: true }).click();
  await page
    .getByRole("button", { name: "Gesamte Region", exact: true })
    .click();
  expect(
    (await page.locator("svg.map").getAttribute("viewBox"))!
      .split(" ")
      .slice(2)
      .map(Number),
  ).toEqual([100000 / 12, 100000 / 12]);
  await page.screenshot({
    path: info.outputPath("region-overview-1600.png"),
    fullPage: true,
  });
  await page.getByLabel("Karte durchsuchen", { exact: true }).fill("SÜDBRUCK");
  await page
    .locator(".map-search-results")
    .getByRole("button", { name: "SÜDBRUCK", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("region-new-town.png"),
    fullPage: true,
  });
  await page.getByLabel("Karte durchsuchen", { exact: true }).fill(vehicleName);
  await page
    .locator(".map-search-results")
    .getByRole("button", { name: vehicleName, exact: true })
    .click();
  await expect(page.getByLabel("Ausgewähltes Fahrzeug")).toContainText(
    "km/h aktuell",
  );
  await page
    .getByRole("button", { name: "Fahrzeug folgen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Folgen aktiv", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator("svg.map").focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Fahrzeug folgen", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByLabel("Organisation auf Karte").selectOption("Polizei");
  await expect(
    page
      .locator("svg.map")
      .getByRole("button", { name: vehicleName, exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".map-search")
    .getByRole("button", { name: /Filter zurücksetzen/ })
    .click();
  await expect(
    page
      .locator("svg.map")
      .getByRole("button", { name: vehicleName, exact: true }),
  ).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("region-vehicle-details.png"),
    fullPage: true,
  });
  await context.setOffline(true);
  await expect(
    page.getByText("Verbindung fehlt · letzter bestätigter Stand", {
      exact: true,
    }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(
    page.getByText("Verbindung fehlt · letzter bestätigter Stand", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page
      .locator("svg.map")
      .getByRole("button", { name: vehicleName, exact: true }),
  ).toHaveCount(1);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.screenshot({
    path: info.outputPath("region-1100.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole("button", { name: "Karte", exact: true }).click();
  const beforeZoom = await page.locator("svg.map").getAttribute("viewBox");
  await page.getByRole("button", { name: "Vergrößern", exact: true }).click();
  await expect(page.locator("svg.map")).not.toHaveAttribute(
    "viewBox",
    beforeZoom!,
  );
  await page.getByRole("button", { name: "Verkleinern", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("region-desktop-1366.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
