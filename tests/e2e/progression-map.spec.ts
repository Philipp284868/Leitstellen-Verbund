import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Config } from "../../server/config";
import type { startServer } from "../../server/index";
import { beginTrip } from "../../src/engine";
import { phaseFixture } from "../dispatch-fixture";
import { sites as nodes } from "../fixtures/germany/locations";
import { listenBrowserServer } from "./server-helper";
import { expect, test } from "./test";
import { showMapTools } from "./ui-navigation";

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
  beginTrip(s, v, nodes[110], "return");
  vehicleName = v.name;
  s.buildings[0].pos = nodes[110];
  app.db.save(owner, s);
});

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
  await page.getByRole("button", { name: "Karte", exact: true }).click();
  await expect(
    page.getByText("Deutschland · reale Geografie", { exact: true }),
  ).toBeVisible();
  if (
    (await page
      .getByRole("button", { name: "Karte", exact: true })
      .getAttribute("aria-expanded")) !== "true"
  )
    await page.getByRole("button", { name: "Karte", exact: true }).click();
  await page
    .getByRole("button", { name: "Ganz Deutschland", exact: true })
    .click();
  await expect
    .poll(async () => {
      const b = JSON.parse(
        (await page
          .getByTestId("germany-map-viewport")
          .getAttribute("data-bounds")) || "null",
      );
      return (
        !!b &&
        b[0][0] <= 5.5 &&
        b[0][1] <= 47.1 &&
        b[1][0] >= 15.6 &&
        b[1][1] >= 55.2
      );
    })
    .toBe(true);
  await page.screenshot({
    path: info.outputPath("region-overview-1600.png"),
    fullPage: true,
  });
  await page.getByLabel("Karte durchsuchen", { exact: true }).fill("Berlin");
  await page
    .locator(".map-search-results")
    .getByRole("button", { name: "Berlin city", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("region-new-town.png"),
    fullPage: true,
  });
  await page.getByLabel("Karte durchsuchen", { exact: true }).fill(vehicleName);
  await page
    .locator(".map-search-results")
    .getByRole("button", {
      name: `${vehicleName} Meine Leitstelle`,
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Ausgewähltes Fahrzeug")).toContainText(
    "km/h aktuell",
  );
  await showMapTools(page);
  await expect(page.getByLabel("Ausgewähltes Fahrzeug")).toContainText(
    vehicleName,
  );
  await page
    .getByRole("button", { name: "Fahrzeug folgen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Fahrzeug folgen", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByLabel("Interaktive Karte von Deutschland", { exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Fahrzeug folgen", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByLabel("Organisation auf Karte").selectOption("Polizei");
  await expect(
    page
      .locator("[data-testid=germany-map-viewport]")
      .getByRole("button", { name: vehicleName, exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Organisation auf Karte").selectOption("Alle");
  await expect(
    page
      .locator("[data-testid=germany-map-viewport]")
      .getByRole("button", { name: vehicleName, exact: true }),
  ).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("region-vehicle-details.png"),
    fullPage: true,
  });
  await context.setOffline(true);
  await expect(
    page.getByText("Verbindung fehlt · letzter bestätigter Spielstand", {
      exact: true,
    }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(
    page.getByText("Verbindung fehlt · letzter bestätigter Spielstand", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page
      .locator("[data-testid=germany-map-viewport]")
      .getByRole("button", { name: vehicleName, exact: true }),
  ).toHaveCount(1);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.screenshot({
    path: info.outputPath("region-1100.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await showMapTools(page);
  const beforeZoom = await page
    .locator("[data-testid=germany-map-viewport]")
    .getAttribute("data-bounds");
  await page.getByRole("button", { name: "Vergrößern", exact: true }).click();
  await expect(
    page.locator("[data-testid=germany-map-viewport]"),
  ).not.toHaveAttribute("data-bounds", beforeZoom!);
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
