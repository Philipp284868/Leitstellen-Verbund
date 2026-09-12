import { openPanel } from "./ui-navigation";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import { phaseFixture } from "../dispatch-fixture";
import { sites } from "../fixtures/germany/locations";
import { fixturePurchase } from "../fixtures/germany/facilities";
import { apply } from "../../src/engine";
import { listenBrowserServer } from "./server-helper";
import { expect, test, type Page } from "./test";
import { showIncidents, showMapTools } from "./ui-navigation";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, origin: string, dir: string;
test.use({ viewport: { width: 1920, height: 1080 }, actionTimeout: 15000 });
test.beforeEach(async () => {
  const c = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: (dir = await mkdtemp(resolve(tmpdir(), "lv-map-input-"))),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, c);
  origin = c.publicUrl;
  const owner = await app.auth.create(
    "mapinput",
    "Map-input-password-123!",
    "Kartenprüfung",
    "Berlin",
  );
  const s = phaseFixture(owner);
  s.missionWait = 99999;
  s.nextMission = s.time + 99999;
  apply(s, fixturePurchase("fire", sites[3]));
  s.buildings.at(-1)!.name = "Testwache ohne Fahrzeuge";
  app.db.save(owner, s);
});
test.afterEach(async () => {
  await app?.close();
  await rm(dir, { recursive: true, force: true });
});
async function enter(page: Page) {
  await page.goto(origin);
  await page.getByLabel("Benutzername", { exact: true }).fill("mapinput");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill("Map-input-password-123!");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect(page.getByTestId("germany-map-viewport")).toHaveAttribute(
    "data-camera",
    /zoom/,
  );
}
const map = (page: Page) => page.getByTestId("germany-map-viewport");
const focus = (page: Page) =>
  page.getByLabel("Interaktive Karte von Deutschland", { exact: true }).focus();
async function geoAt(page: Page, x: number, y: number) {
  return map(page).evaluate(
    (e, { x, y }) => {
      const b = JSON.parse((e as HTMLElement).dataset.bounds!),
        r = e.getBoundingClientRect();
      const merc = (lat: number) =>
        Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
      const north = merc(b[1][1]),
        south = merc(b[0][1]);
      return {
        lon: b[0][0] + ((b[1][0] - b[0][0]) * (x - r.x)) / r.width,
        lat:
          ((2 *
            Math.atan(
              Math.exp(north + ((south - north) * (y - r.y)) / r.height),
            ) -
            Math.PI / 2) *
            180) /
          Math.PI,
      };
    },
    { x, y },
  );
}
test("Kartenbeschriftung bleibt beim Ziehen unmarkiert; Markerdrag löst keinen Objektklick aus", async ({
  page,
}) => {
  await enter(page);
  const marker = page.getByRole("button", {
    name: "Testwache ohne Fahrzeuge",
    exact: true,
  });
  const b = (await marker.boundingBox())!,
    before = await map(page).getAttribute("data-camera");
  expect(b).not.toBeNull();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 120, b.y + b.height / 2 + 65, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(map(page)).not.toHaveAttribute("data-camera", before!);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
  await marker.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
});
test("Mausrad erhält geografischen Anker; Texteingabe und HUD-Scroll verändern die Kamera nicht", async ({
  page,
}) => {
  await enter(page);
  await showMapTools(page);
  const search = page.getByLabel("Karte durchsuchen");
  const before = await map(page).getAttribute("data-camera");
  await search.fill("Berlin");
  await search.press("Control+a");
  expect(
    await search.evaluate(
      (e: HTMLInputElement) => e.selectionEnd! - e.selectionStart!,
    ),
  ).toBe(6);
  await search.press("ArrowLeft");
  await expect(map(page)).toHaveAttribute("data-camera", before!);
  await search.fill("");
  await page.mouse.move(900, 500);
  const anchor = await geoAt(page, 900, 500);
  await page.mouse.wheel(0, -120);
  await expect(map(page)).not.toHaveAttribute("data-camera", before!);
  await expect(map(page)).toHaveAttribute("data-camera-moving", "false");
  const after = await geoAt(page, 900, 500);
  expect(after.lon).toBeCloseTo(anchor.lon, 6);
  expect(after.lat).toBeCloseTo(anchor.lat, 6);
  const wheel = await map(page).getAttribute("data-camera");
  await showIncidents(page);
  await page.locator(".mission-list").hover();
  await page.mouse.wheel(0, 800);
  await expect(map(page)).toHaveAttribute("data-camera", wheel!);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await focus(page);
  await page.keyboard.press("Control+-");
  await expect(map(page)).toHaveAttribute("data-camera", wheel!);
});
test("Drag-Abbrüche, getrennte Tabs, Menürückkehr und Standortauswahl behalten sichere Grenzen", async ({
  page,
  context,
}) => {
  await enter(page);
  await page.evaluate(() =>
    document.addEventListener(
      "dragstart",
      () => (document.documentElement.dataset.nativeDrag = "yes"),
    ),
  );
  for (const reason of ["blur", "cancel", "capture", "hidden"]) {
    await map(page).evaluate((e) =>
      e.addEventListener(
        "pointerdown",
        (event) =>
          ((e as HTMLElement).dataset.testPointerId = String(
            (event as PointerEvent).pointerId,
          )),
        { once: true },
      ),
    );
    await page.mouse.move(900, 500);
    await page.mouse.down();
    await page.mouse.move(980, 550, { steps: 8 });
    await expect(map(page)).toHaveClass(/dragging/);
    if (reason === "blur")
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    if (reason === "cancel")
      await map(page).evaluate((e) =>
        e.dispatchEvent(
          new PointerEvent("pointercancel", {
            pointerId: Number((e as HTMLElement).dataset.testPointerId),
          }),
        ),
      );
    if (reason === "capture")
      await map(page).evaluate((e) =>
        e.releasePointerCapture(
          Number((e as HTMLElement).dataset.testPointerId),
        ),
      );
    if (reason === "hidden")
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
        Reflect.deleteProperty(document, "hidden");
      });
    await page.mouse.move(985, 555);
    await expect(map(page)).not.toHaveClass(/dragging/);
    await page.mouse.up();
    await expect(map(page)).toHaveAttribute("data-camera-moving", "false");
    const canceled = await map(page).getAttribute("data-camera");
    await page.mouse.move(1200, 600);
    await expect(map(page)).toHaveAttribute("data-camera", canceled!);
  }
  expect(
    await page.evaluate(() => document.documentElement.dataset.nativeDrag),
  ).toBeUndefined();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
  const second = await context.newPage();
  await second.goto(origin);
  await second.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect(map(second)).toHaveAttribute("data-camera", /zoom/);
  const other = await map(second).getAttribute("data-camera");
  await page.bringToFront();
  await focus(page);
  const beforePan = await map(page).getAttribute("data-camera");
  await page.keyboard.press("ArrowRight");
  // Input handling and the published camera attribute finish in different
  // animation frames. Capture the new camera only after its real movement.
  await expect(map(page)).not.toHaveAttribute("data-camera", beforePan!);
  await expect(map(page)).toHaveAttribute("data-camera-moving", "false");
  await expect(map(second)).toHaveAttribute("data-camera", other!);
  await second.close();
  const camera = await map(page).getAttribute("data-camera");
  await openPanel(page, "Zurück zum Hauptmenü");
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect(map(page)).toHaveAttribute("data-camera", camera!);
  await focus(page);
  await page.keyboard.press("ArrowRight");
  await expect(map(page)).not.toHaveAttribute("data-camera", camera!);
  await openPanel(page, "Standorte verwalten");
  await page
    .getByRole("button", { name: "Standort kaufen", exact: true })
    .click();
  await expect(page.getByLabel("Ort, Adresse oder Standortname")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Platzieren", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Standorte direkt auf der Karte auswählen" })
    .click();
  await page.mouse.move(900, 500);
  await page.mouse.down();
  await page.mouse.move(1020, 580, { steps: 12 });
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Kauf verbindlich bestätigen" }),
  ).toHaveCount(0);
  await focus(page);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Bau bestätigen" }),
  ).toHaveCount(0);
});
test("CSS-Pixelschwelle bleibt bei doppelter Pixeldichte korrekt", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  try {
    const page = await context.newPage();
    await enter(page);
    const before = await map(page).getAttribute("data-camera");
    const oldPoint = await geoAt(page, 950, 500);
    await page.mouse.move(950, 500);
    await page.mouse.down();
    await page.mouse.move(946, 500);
    await expect(map(page)).not.toHaveClass(/dragging/);
    await expect(map(page)).toHaveAttribute("data-camera", before!);
    await page.mouse.move(944, 500);
    await expect(map(page)).toHaveClass(/dragging/);
    await page.mouse.up();
    await expect(map(page)).not.toHaveAttribute("data-camera", before!);
    const newPoint = await geoAt(page, 944, 500);
    expect(newPoint.lon).toBeCloseTo(oldPoint.lon, 7);
    expect(newPoint.lat).toBeCloseTo(oldPoint.lat, 7);
    const after = await map(page).getAttribute("data-camera");
    await focus(page);
    await page.keyboard.press("Control+-");
    await expect(map(page)).toHaveAttribute("data-camera", after!);
  } finally {
    await context.close();
  }
});
