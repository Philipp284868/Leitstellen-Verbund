import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import { listenBrowserServer } from "./server-helper";
import type * as Fixture from "../rivermere-fixture";
test.use({ actionTimeout: 15000 });
const fixturePath = resolve(`.tools/rivermere-fixture-${process.pid}.mjs`);
await build({
  entryPoints: ["tests/rivermere-fixture.ts"],
  outfile: fixturePath,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  define: { __LV_WORLD__: JSON.stringify("rivermere-1") },
});
const f = (await import(pathToFileURL(fixturePath).href)) as typeof Fixture;
const compiled = (await import(
  pathToFileURL(resolve("dist/worlds/rivermere/dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, origin: string;
test.beforeAll(async () => {
  const c = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-rivermere-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, c);
  origin = c.publicUrl;
  const owner = await app.auth.create(
    "rivermere",
    "Rivermere-password-123!",
    "Leitstellenleitung",
    "Leitstelle Rivermere",
  );
  const s = f.phaseFixture(owner);
  s.environment = undefined;
  s.player.station = "Leitstelle Rivermere";
  s.missionWait = 9999;
  const m = s.missions[0];
  m.pos = f.nodes[f.nearest({ x: 4600, y: 3800 })];
  m.control!.locationKnown = true;
  m.control!.reportedTemplate = m.template;
  m.control!.calls[0].state = "ended";
  f.alarm(s, m, [s.vehicles[0].id], owner, "NORMAL", "station");
  f.tick(s, s.vehicles[0].depart + 40, {}, false, false);
  app.db.save(owner, s);
});
test.afterAll(async () => {
  await app.close();
});
test("Rivermere: Region, Innenstadt, Außenorte, Anfahrt und Wiederverbindung", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByLabel("Benutzername", { exact: true }).fill("rivermere");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill("Rivermere-password-123!");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  const map = page.locator("svg.map");
  await expect(map.locator('[data-world="rivermere-1"]')).toBeVisible();
  await page.getByRole("button", { name: "Layer", exact: true }).click();
  const folder = resolve(
    process.env.UPDATE_SCREENSHOTS
      ? "docs/screenshots/rivermere"
      : ".tools/screenshots/rivermere",
  );
  await mkdir(folder, { recursive: true });
  const shot = async (name: string) =>
    page.screenshot({
      path: resolve(folder, `${info.project.name}-${name}.png`),
    });
  await page
    .getByRole("button", { name: "Gesamte Region", exact: true })
    .click();
  await page.getByRole("button", { name: "Layer", exact: true }).click();
  await shot("region");
  await page.getByRole("button", { name: "Layer", exact: true }).click();
  const search = page.getByLabel("Karte durchsuchen");
  for (const [name, file] of [
    ["Rivermere", "city"],
    ["Westhaven", "town"],
    ["Meadowbrook", "village"],
  ]) {
    await search.fill(name);
    await page
      .locator(".map-search-results")
      .getByRole("button", { name, exact: true })
      .click();
    await page.getByRole("button", { name: "Layer", exact: true }).click();
    await shot(file);
    await page.getByRole("button", { name: "Layer", exact: true }).click();
  }
  await search.fill("Rivermere");
  await page
    .locator(".map-search-results")
    .getByRole("button", { name: "Rivermere", exact: true })
    .click();
  await page.getByRole("button", { name: "Layer", exact: true }).click();
  const before = await map.getAttribute("viewBox");
  await page.mouse.move(950, 500);
  await page.mouse.down();
  await page.mouse.move(1080, 580, { steps: 18 });
  await page.mouse.up();
  await expect(map).not.toHaveAttribute("viewBox", before!);
  expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
  const changed = await map.getAttribute("viewBox");
  await page.locator(".mission-card").first().click();
  await expect(map).toHaveAttribute("viewBox", changed!);
  await page
    .getByRole("button", { name: "Kartenauswahl zentrieren", exact: true })
    .click();
  await shot("incident-route");
  const camera = await map.getAttribute("viewBox");
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Object.keys(localStorage).some((k) =>
          k.startsWith("lv-camera-v1:rivermere-1"),
        ),
      ),
    )
    .toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect(map).toHaveAttribute("viewBox", camera!);
  expect(errors).toEqual([]);
});

test(
  "Rivermere: gemessene Kartenbewegung",
  { tag: "@load" },
  async ({ page, browser }, info) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(origin);
    await page.getByLabel("Benutzername", { exact: true }).fill("rivermere");
    await page
      .getByLabel("Passwort", { exact: true })
      .fill("Rivermere-password-123!");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await page.getByRole("button", { name: "Spielen", exact: true }).click();
    const map = page.locator("svg.map");
    await expect(map).toBeVisible();
    const measured = page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const gaps: number[] = [];
          let previous = performance.now();
          const start = previous;
          function frame(now: number) {
            gaps.push(now - previous);
            previous = now;
            if (now - start < 1800) requestAnimationFrame(frame);
            else resolve(gaps);
          }
          requestAnimationFrame(frame);
        }),
    );
    const start = performance.now();
    await page.mouse.move(1000, 500);
    await page.mouse.down();
    await page.mouse.move(650, 550, { steps: 50 });
    await page.mouse.move(1100, 430, { steps: 50 });
    await page.mouse.up();
    const dragMs = performance.now() - start,
      gaps = (await measured).sort((a, b) => a - b);
    const result = {
      browser: process.env.PW_EDGE ? "Edge" : "Playwright " + info.project.name,
      version: browser.version(),
      viewport: [1920, 1080],
      world: "rivermere-1",
      nodes: f.nodes.length,
      roads: f.roads.length,
      sections: f.roadSections.length,
      dragMs,
      frames: gaps.length,
      medianFrameMs: gaps[Math.floor(gaps.length * 0.5)],
      p95FrameMs: gaps[Math.floor(gaps.length * 0.95)],
      framesOver33ms: gaps.filter((n) => n > 33).length,
      svgElements: await map.locator("*").count(),
    };
    const folder = resolve(
      process.env.UPDATE_SCREENSHOTS
        ? "docs/screenshots/rivermere"
        : ".tools/screenshots/rivermere",
    );
    await mkdir(folder, { recursive: true });
    await writeFile(
      resolve(folder, `${info.project.name}-performance.json`),
      JSON.stringify(result, null, 2),
    );
    expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
    await expect(map).not.toHaveClass(/dragging/);
    expect(Number.isFinite(result.p95FrameMs)).toBe(true);
  },
);
