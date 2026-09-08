import { fork } from "node:child_process";
import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import { listenBrowserServer } from "./server-helper";
import { openPanel } from "./ui-navigation";
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
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, origin: string, helper: string;
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
  helper = await app.auth.create(
    "rivermere-neighbor",
    "Rivermere-password-123!",
    "Nachbar",
    "Nachbarleitstelle",
  );
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
    if (file === "village")
      expect(await map.locator("[data-footprint]").count()).toBeGreaterThan(40);
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
    .locator(".dock-tabs")
    .getByRole("button", { name: "Fahrzeuge", exact: true })
    .click();
  await page.locator(".dispatch-list input:not(:disabled)").first().check();
  await page
    .getByRole("button", { name: "Alarmieren (1)", exact: true })
    .click();
  await expect
    .poll(
      () =>
        [...app.db.all().values()][0].vehicles.filter(
          (v) => v.status === "alarmed" || v.status === "travel",
        ).length,
    )
    .toBe(2);
  await page
    .getByRole("button", { name: "Kartenauswahl zentrieren", exact: true })
    .click();
  await shot("incident-route");
  const arrival = page.locator('[data-hud-section="arrival"]');
  expect(
    await arrival.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  ).toBe(true);
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
  await openPanel(page, "Freunde");
  await page.getByText("Neue Unterstützungsanfrage", { exact: true }).click();
  await page
    .getByLabel("Nachbarleitstelle", { exact: true })
    .selectOption(helper);
  await page
    .getByLabel("Eigener Einsatz", { exact: true })
    .selectOption([...app.db.all().values()][0].missions[0].id);
  await page.getByLabel("Gewünschter Fahrzeugtyp").selectOption("hlf");
  await page
    .getByRole("button", { name: "Fahrzeug zur Anforderung hinzufügen" })
    .click();
  await page
    .getByLabel("Anfragetext")
    .fill("Rivermere: Rückfrage für die Kartenprüfung.");
  await page
    .getByRole("button", { name: "Entwurf anlegen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Anfrage verbindlich senden" })
    .click();
  const message = page.getByLabel(/^Nachricht /);
  await message.fill("Sammelpunkt an der Brücke");
  await message.press("Control+a");
  expect(
    await message.evaluate(
      (e: HTMLInputElement) => e.selectionEnd! - e.selectionStart!,
    ),
  ).toBe(25);
  await message.press("Control+c");
  await message.fill("");
  await message.press("Control+v");
  await expect(message).toHaveValue("Sammelpunkt an der Brücke");
  await page.getByRole("button", { name: "Nachricht übermitteln" }).click();
  await expect(page.locator(".aid-messages")).toContainText(
    "Sammelpunkt an der Brücke",
  );
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await map.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(map).not.toHaveAttribute("viewBox", camera!);
  expect(errors).toEqual([]);
});

test(
  "Rivermere: gemessene Kartenbewegung",
  { tag: "@load" },
  async ({ page, browser }, info) => {
    const child = fork(
      resolve("tests/helpers/rivermere-load-server.mjs"),
      [fixturePath],
      { stdio: ["ignore", "pipe", "pipe", "ipc"] },
    );
    let output = "";
    child.stderr?.on("data", (data) => {
      output += String(data);
    });
    const ready = await new Promise<{
      origin: string;
      buildings: number;
      vehicles: number;
      incidents: number;
    }>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(Error("Lastserver startet nicht: " + output));
      }, 30000);
      child.once("message", (message) => {
        clearTimeout(timer);
        resolve(
          message as {
            origin: string;
            buildings: number;
            vehicles: number;
            incidents: number;
          },
        );
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(Error(`Lastserver vorzeitig beendet (${code}): ${output}`));
      });
    });
    try {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(ready.origin);
      await page
        .getByLabel("Benutzername", { exact: true })
        .fill("rivermere-load");
      await page
        .getByLabel("Passwort", { exact: true })
        .fill("Rivermere-password-123!");
      await page.getByRole("button", { name: "Anmelden", exact: true }).click();
      await page.getByRole("button", { name: "Spielen", exact: true }).click();
      const map = page.locator("svg.map");
      await expect(map).toBeVisible();
      await page.evaluate(() => {
        const data = {
          gaps: [] as number[],
          frame: 0,
          last: performance.now(),
        };
        Object.assign(window, { mapFrameMeasurement: data });
        const frame = (now: number) => {
          data.gaps.push(now - data.last);
          data.last = now;
          data.frame = requestAnimationFrame(frame);
        };
        data.frame = requestAnimationFrame(frame);
      });
      const start = performance.now();
      await page.mouse.move(1000, 500);
      await page.mouse.down();
      await page.mouse.move(650, 550, { steps: 50 });
      await page.mouse.move(1100, 430, { steps: 50 });
      await page.mouse.up();
      const dragMs = performance.now() - start,
        gaps = (
          await page.evaluate(() => {
            const data = (
              window as unknown as {
                mapFrameMeasurement: { gaps: number[]; frame: number };
              }
            ).mapFrameMeasurement;
            cancelAnimationFrame(data.frame);
            return data.gaps;
          })
        ).sort((a, b) => a - b);
      const result = {
        browser: process.env.PW_EDGE
          ? "Edge"
          : "Playwright " + info.project.name,
        version: browser.version(),
        viewport: [1920, 1080],
        world: "rivermere-1",
        nodes: f.nodes.length,
        roads: f.roads.length,
        sections: f.roadSections.length,
        buildings: ready.buildings,
        vehicles: ready.vehicles,
        incidents: ready.incidents,
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
    } finally {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill();
          reject(Error("Lastserver beendet nicht sauber."));
        }, 20000);
        child.once("exit", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(Error(`Lastserver beendet (${code}): ${output}`));
        });
        child.send("stop");
      });
    }
  },
);
