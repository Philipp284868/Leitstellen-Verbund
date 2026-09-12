import { resolve } from "node:path";
import { createServer, type ViteDevServer } from "vite";
import { project } from "../../src/germany/projection";
import { expect, test } from "./test";
let server: ViteDevServer, origin: string;
const requests: string[] = [];
test.use({ actionTimeout: 15000 });
test.setTimeout(60000);
test.beforeAll(async () => {
  server = await createServer({
    appType: "custom",
    configFile: false,
    root: resolve(),
    logLevel: "error",
    resolve: {
      alias: [
        {
          find: /^(.*[\\/])?world$/,
          replacement: resolve("src/germany/world.ts"),
        },
        {
          find: /^(.*[\\/])?Map$/,
          replacement: resolve("src/germany/GermanyMap.tsx"),
        },
        {
          find: /^(.*[\\/])?RegionScene$/,
          replacement: resolve("src/germany/GermanyScene.tsx"),
        },
      ],
    },
    server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
  });
  server.middlewares.use((req, res, next) => {
    const url = new URL(req.url || "/", "http://localhost");
    const json = (data: unknown) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/__controls") {
      res.setHeader("Content-Type", "text/html");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; worker-src 'self'; connect-src 'self'",
      );
      res.end(
        '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#122532;color:white;font:14px system-ui}header{padding:12px;display:flex;gap:20px}.germany-map{height:850px!important}.map-toolbar,.map-search,.map-layers{position:relative;z-index:6;margin-left:20px;max-width:420px}.map-layers{display:flex;flex-wrap:wrap}.map-tool-panel{position:absolute;z-index:6;top:12px;left:12px;width:380px;max-height:calc(100% - 24px);overflow:auto;background:#142c37}.map-tool-panel .map-zoom{position:static;display:flex;gap:10px}.map-tool-panel .map-control-help{position:static;max-width:100%}.map-tool-panel .map-search,.map-tool-panel .map-toolbar,.map-tool-panel .map-layers{margin:0;position:relative}.operations{display:none}</style></head><body><div id="root"></div><script type="module" src="/tests/fixtures/germany-map-controls.tsx"></script></body></html>',
      );
      return;
    }
    if (url.pathname === "/api/facilities")
      return json({ snapshot: "fixture", clusters: [] });
    if (url.pathname === "/geo/manifest")
      return json({ bounds: [5.5, 47.1, 15.6, 55.2], minzoom: 0, maxzoom: 14 });
    if (url.pathname.startsWith("/geo/pois/")) {
      requests.push(url.pathname);
      return json({
        dataset: "",
        snapshot: "fixture",
        points: [
          {
            id: "index:fixture-hospital",
            category: "education",
            name: "Schule aus POI-Testdaten",
            lon: 13.407,
            lat: 52.52,
            count: 1,
            source: "index",
            kind: "school",
          },
        ],
      });
    }
    if (url.pathname.startsWith("/geo/tiles/")) {
      requests.push(url.pathname);
      res.statusCode = 204;
      res.end();
      return;
    }
    if (url.pathname === "/geo/search")
      return json([
        {
          id: "api-fixture",
          name: "Suchantwort aus Test-API",
          kind: "town",
          lon: 13.5,
          lat: 52.55,
        },
      ]);
    if (url.pathname === "/api/geo/site") {
      requests.push(`mode:${req.headers["x-game-mode"]}`);
      return json({
        point: project({ lon: 13.405, lat: 52.52 }),
        reason: null,
        nodeId: 123,
      });
    }
    next();
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw Error("Testserver ohne Port");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => server?.close());

test("Deutschland-Renderer: CSP-Worker, PC-Steuerung, Such-API und unabhängige Kameras (leere Testtiles)", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1080 });
  await page.goto(`${origin}/__controls`);
  const map = page.getByLabel("Interaktive Karte von Deutschland", {
    exact: true,
  });
  await expect(map).toBeVisible();
  await expect(page.getByText("Deutschlandkarte wird geladen …")).toHaveCount(
    0,
  );
  const camera = () =>
    page.evaluate(() =>
      localStorage.getItem("lv-germany-camera-v1:germany-1:controls-fixture"),
    );
  await map.focus();
  await page.keyboard.press("Home");
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
  await page.keyboard.press("ArrowRight");
  await expect.poll(camera).not.toBeNull();
  const before = await camera();
  await page.mouse.move(1000, 430);
  await page.mouse.down();
  await page.mouse.move(1004, 430);
  await expect(page.getByTestId("germany-map-viewport")).not.toHaveClass(
    /dragging/,
  );
  await page.mouse.up();
  expect(await camera()).toBe(before);
  await page.mouse.move(1000, 430);
  await page.mouse.down();
  await page.mouse.move(1110, 470, { steps: 10 });
  await expect(page.getByTestId("germany-map-viewport")).toHaveClass(
    /dragging/,
  );
  await page.mouse.up();
  await expect(page.getByTestId("germany-map-viewport")).not.toHaveClass(
    /dragging/,
  );
  expect(await camera()).not.toBe(before);
  expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
  const dragged = await camera();
  await page.mouse.wheel(0, -120);
  await expect.poll(camera).not.toBe(dragged);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.getByLabel("Karte durchsuchen").fill("Test");
  await page.getByRole("button", { name: "Suchantwort aus Test-API" }).click();
  await expect(page.getByLabel("Karte durchsuchen")).toHaveValue("");
  const second = await context.newPage();
  await second.goto(`${origin}/__controls`);
  await expect(
    second.getByLabel("Interaktive Karte von Deutschland", { exact: true }),
  ).toBeVisible();
  await page.bringToFront();
  await map.focus();
  await page.keyboard.press("ArrowLeft");
  const centerBefore = await second
    .getByTestId("germany-map-viewport")
    .getAttribute("data-camera");
  await map.focus();
  await page.keyboard.press("ArrowRight");
  await expect(second.getByTestId("germany-map-viewport")).toHaveAttribute(
    "data-camera",
    centerBefore!,
  );
  await second.close();
  await page
    .getByLabel("Normales Texteingabefeld")
    .fill("Text bleibt bedienbar");
  await expect(page.getByLabel("Normales Texteingabefeld")).toHaveValue(
    "Text bleibt bedienbar",
  );
  expect(requests.some((path) => path.startsWith("/geo/tiles/"))).toBe(true);
  expect(errors).toEqual([]);
});

test("Freie Kartenfläche erlaubt weder nach Ziehen noch nach Klick einen Gebäudekauf", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1080 });
  await page.goto(`${origin}/__controls`);
  const map = page.getByLabel("Interaktive Karte von Deutschland", {
    exact: true,
  });
  await expect(map).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Testbau starten" }),
  ).toHaveCount(0);
  await page.mouse.move(1000, 450);
  await page.mouse.down();
  await page.mouse.move(1100, 480, { steps: 8 });
  await page.mouse.up();
  await page.mouse.click(1000, 450);
  await expect(
    page.getByRole("button", { name: "Bau bestätigen" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Kauf verbindlich bestätigen" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("selection")).not.toHaveText("placed");
  await expect(page.getByText("Standortfilter", { exact: true })).toHaveCount(
    0,
  );
});

test("Entfernte POI- und Spieler-Pins kehren auch mit Altdaten nicht zurück; keine POI-Abfragen", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/geo/pois/")) calls.push(r.url());
  });
  await page.goto(`${origin}/__controls?presence=1`);
  await expect(page.getByTestId("germany-map-viewport")).toBeVisible();
  await page.evaluate(
    (point) =>
      window.dispatchEvent(
        new CustomEvent("lv:map-focus", { detail: { point, zoom: 15 } }),
      ),
    project({ lon: 13.407, lat: 52.52 }),
  );
  await expect
    .poll(
      async () =>
        JSON.parse(
          (await page
            .getByTestId("germany-map-viewport")
            .getAttribute("data-camera"))!,
        ).zoom,
    )
    .toBeCloseTo(15, 1);
  await expect(page.getByTestId("map-presence")).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Geografische Einrichtung" }),
  ).toHaveCount(0);
  await expect(page.getByText("Standortfilter", { exact: true })).toHaveCount(
    0,
  );
  expect(calls).toEqual([]);
});

test("Fahrzeuge mit identischen Koordinaten bleiben am Detailzoom einzeln erreichbar und verdecken die Wache nicht", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1080 });
  await page.goto(`${origin}/__controls?fleet=1`);
  await expect(page.getByTestId("map-vehicle")).toHaveCount(1);
  await page.evaluate(
    (point) =>
      window.dispatchEvent(
        new CustomEvent("lv:map-focus", { detail: { point, zoom: 18 } }),
      ),
    project({ lon: 13.405, lat: 52.52 }),
  );
  await expect
    .poll(
      async () =>
        JSON.parse(
          (await page
            .getByTestId("germany-map-viewport")
            .getAttribute("data-camera"))!,
        ).zoom,
    )
    .toBeCloseTo(18, 1);
  const group = page.getByTestId("map-vehicle");
  await expect(group).toHaveAttribute("aria-label", /3 Fahrzeuge/);
  await page.getByTestId("map-station").click();
  await expect(page.getByTestId("selection")).toHaveText("station-fixture");
  await group.click();
  const details = page.getByRole("complementary", {
    name: "Objekte am Kartenstandort",
  });
  await expect(page.getByTestId("inspection-count")).toHaveText("1");
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  await group.click();
  await expect(details.locator('[data-map-glyph="engine"]')).toHaveCount(1);
  await expect(details.locator('[data-map-glyph="ladder"]')).toHaveCount(1);
  await expect(details.locator('[data-map-glyph="ambulance"]')).toHaveCount(1);
  await details.getByRole("button", { name: /Funkrufname DLK/ }).click();
  await expect(page.getByTestId("selection")).toHaveText("vehicle-1");
  await expect(
    page.locator('.map-vehicle-detail [data-map-glyph="ladder"]'),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Testarbeitsansicht umschalten" })
    .click();
  await expect(
    page.getByLabel("Ausgewähltes Fahrzeug", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Testarbeitsansicht umschalten" })
    .click();
  await expect(
    page.getByLabel("Ausgewähltes Fahrzeug", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Fahrzeugdetails schließen", { exact: true }).click();
  await expect(
    page.getByLabel("Ausgewähltes Fahrzeug", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("selection")).toHaveText("");
  expect(errors).toEqual([]);
});
