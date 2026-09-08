import { test, expect } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import { listenBrowserServer } from "./server-helper";
import { nodes, nearest } from "../../src/world";
import { alarm } from "../../src/simulation/dispatch";
import { tick } from "../../src/engine";
import { phaseFixture } from "../phase-fixture";
test.use({ actionTimeout: 15000 });
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
  s.buildings.push({
    ...structuredClone(s.buildings[0]),
    id: "input-empty-station",
    name: "Testwache ohne Fahrzeuge",
    pos: nodes[nearest({ x: 720, y: 390 })],
  });
  app.db.save(owner, s);
});
test.afterAll(async () => {
  await app.close();
});
test("Kartenbeschriftung bleibt beim Ziehen unmarkiert", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(origin);
  await page.getByLabel("Benutzername", { exact: true }).fill("reference");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill("Reference-password-123!");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  const map = page.locator("svg.map");
  await expect(map).toBeVisible();
  const label = map.locator("text").filter({ hasText: "ALTSTADT" }).first();
  const box = await label.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 180,
    box!.y + box!.height / 2 + 70,
    { steps: 16 },
  );
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.getSelection()?.toString() ?? ""),
  ).toBe("");
});

test("Markerdrag, Folgeklick, Mausrad und Eingabefokus sind getrennt", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(origin);
  await page.getByLabel("Benutzername", { exact: true }).fill("reference");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill("Reference-password-123!");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  const map = page.locator("svg.map");
  const marker = map.locator("[data-own-station]").last();
  const before = await map.getAttribute("viewBox");
  const box = await marker.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 15, box!.y + 15);
  await page.mouse.down();
  await page.mouse.move(box!.x - 130, box!.y - 65, { steps: 12 });
  await page.mouse.up();
  await expect(map).not.toHaveAttribute("viewBox", before!);
  await expect(map).not.toHaveClass(/dragging/);
  expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
  await marker.click({ timeout: 10000 });
  await expect(page.locator("[data-center-selection]")).toBeEnabled();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  const selectedView = await map.getAttribute("viewBox");
  await page.getByRole("button", { name: "Layer", exact: true }).click();
  const search = page.getByLabel("Karte durchsuchen");
  await search.fill("ALTSTADT");
  await search.press("Control+a");
  expect(
    await search.evaluate(
      (e: HTMLInputElement) => e.selectionEnd! - e.selectionStart!,
    ),
  ).toBe(8);
  await search.press("ArrowLeft");
  await expect(map).toHaveAttribute("viewBox", selectedView!);
  await search.fill("");
  await page.mouse.move(900, 500);
  const anchor = await map.evaluate((e: SVGSVGElement) => {
    const p = e.createSVGPoint();
    p.x = 900;
    p.y = 500;
    const q = p.matrixTransform(e.getScreenCTM()!.inverse());
    return { x: q.x, y: q.y };
  });
  await page.mouse.wheel(0, -120);
  await expect(map).not.toHaveAttribute("viewBox", selectedView!);
  const afterAnchor = await map.evaluate((e: SVGSVGElement) => {
    const p = e.createSVGPoint();
    p.x = 900;
    p.y = 500;
    const q = p.matrixTransform(e.getScreenCTM()!.inverse());
    return { x: q.x, y: q.y };
  });
  expect(afterAnchor.x).toBeCloseTo(anchor.x, 1);
  expect(afterAnchor.y).toBeCloseTo(anchor.y, 1);
  const afterWheel = await map.getAttribute("viewBox");
  await page.locator(".mission-list").hover();
  await page.mouse.wheel(0, 800);
  await expect(map).toHaveAttribute("viewBox", afterWheel!);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await map.focus();
  await page.keyboard.press("Control+-");
  await expect(map).toHaveAttribute("viewBox", afterWheel!);
});

test("Abbruch, HUD-Grenzen, Bauvorschau und erneutes Öffnen bleiben sicher", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(origin);
  await page.getByLabel("Benutzername", { exact: true }).fill("reference");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill("Reference-password-123!");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  const map = page.locator("svg.map");
  await page.evaluate(() => {
    document.addEventListener(
      "dragstart",
      () => (document.documentElement.dataset.nativeDrag = "yes"),
    );
  });
  await page.mouse.move(900, 500);
  await page.mouse.down();
  await page.mouse.move(100, 180, { steps: 20 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(map).not.toHaveClass(/dragging/);
  expect(
    await page.evaluate(() => document.documentElement.dataset.nativeDrag),
  ).toBeUndefined();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
  await page.mouse.move(900, 500);
  await page.mouse.down();
  await page.mouse.move(960, 540, { steps: 8 });
  await expect(map).toHaveClass(/dragging/);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(map).not.toHaveClass(/dragging/);
  const canceled = await map.getAttribute("viewBox");
  await page.mouse.up();
  await page.mouse.move(1200, 600);
  await expect(map).toHaveAttribute("viewBox", canceled!);
  await page.mouse.move(900, 500);
  await page.mouse.down();
  await page.mouse.move(980, 570, { steps: 8 });
  await map.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await expect(map).not.toHaveClass(/dragging/);
  const second = await context.newPage();
  await second.goto(origin);
  await second.getByRole("button", { name: "Spielen", exact: true }).click();
  const other = await second.locator("svg.map").getAttribute("viewBox");
  await page.bringToFront();
  await map.focus();
  await page.keyboard.press("ArrowRight");
  await expect(second.locator("svg.map")).toHaveAttribute("viewBox", other!);
  await second.close();
  const view = await map.getAttribute("viewBox");
  await page.getByRole("button", { name: "Hauptmenü", exact: true }).click();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect(map).toHaveAttribute("viewBox", view!);
  await map.focus();
  await page.keyboard.press("ArrowRight");
  const delta =
    (await map.getAttribute("viewBox"))!.split(" ").map(Number)[0] -
    view!.split(" ").map(Number)[0];
  expect(delta).toBeCloseTo(60, 3);
  await page.getByRole("button", { name: "Wachen", exact: true }).click();
  await page.getByRole("button", { name: "Wache bauen", exact: true }).click();
  const shop = page.getByRole("dialog");
  await expect(shop).toBeVisible();
  await shop
    .getByRole("button", { name: "Platzieren", exact: true })
    .first()
    .click();
  await page.mouse.move(900, 500);
  await page.mouse.down();
  await page.mouse.move(1020, 580, { steps: 12 });
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Bau bestätigen", exact: true }),
  ).toHaveCount(0);
  await map.focus();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Bau abbrechen", exact: true }),
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
    await page.goto(origin);
    await page.getByLabel("Benutzername", { exact: true }).fill("reference");
    await page
      .getByLabel("Passwort", { exact: true })
      .fill("Reference-password-123!");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await page.getByRole("button", { name: "Spielen", exact: true }).click();
    const map = page.locator("svg.map"),
      before = await map.getAttribute("viewBox");
    await page.mouse.move(950, 500);
    await page.mouse.down();
    await page.mouse.move(946, 500);
    await expect(map).not.toHaveClass(/dragging/);
    await expect(map).toHaveAttribute("viewBox", before!);
    await page.mouse.move(944, 500);
    await expect(map).toHaveClass(/dragging/);
    await page.mouse.up();
    const after = (await map.getAttribute("viewBox"))!.split(" ").map(Number);
    expect(after[0] - Number(before!.split(" ")[0])).toBeCloseTo(
      (6 * 1300) / 1920,
      2,
    );
    await map.focus();
    await page.keyboard.press("Control+-");
    await expect(map).toHaveAttribute("viewBox", after.join(" "));
  } finally {
    await context.close();
  }
});
