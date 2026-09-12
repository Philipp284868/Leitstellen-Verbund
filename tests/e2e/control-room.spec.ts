import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import { phaseFixture } from "../dispatch-fixture";
import { listenBrowserServer } from "./server-helper";
import { test, expect } from "./test";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, origin: string;
test.beforeAll(async () => {
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-control-room-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  origin = config.publicUrl;
  const owner = await app.auth.create(
    "control",
    "Control-room-password!",
    "Alex Berger",
    "Leitstelle Berlin",
  );
  const s = phaseFixture(owner);
  s.player.station = "Leitstelle Berlin";
  s.player.name = "Alex Berger";
  s.missionWait = 9999;
  app.db.save(owner, s);
});
test.afterAll(async () => {
  await app.close();
});
for (const [width, height] of [
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
])
  test(`linker Arbeitsplatz, Textfunk und Menü ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(origin);
    await page.getByLabel("Benutzername", { exact: true }).fill("control");
    await page
      .getByLabel("Passwort", { exact: true })
      .fill("Control-room-password!");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Leaderboard", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".menu-footer,.menu-news,.menu-tutorial-link"),
    ).toHaveCount(0);
    await mkdir(".tools/screenshots/control-room", { recursive: true });
    await page.screenshot({
      path: `.tools/screenshots/control-room/menu-${width}.png`,
    });
    await page.getByRole("button", { name: "Spielen", exact: true }).click();
    const log = page.getByRole("region", { name: "Funk und Ereignisse" });
    await expect(log).toBeVisible();
    await expect(log.locator("input,textarea")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /Einsätze/ })).toBeVisible();
    await page.getByRole("tab", { name: /Notrufe/ }).click();
    await expect(page.locator(".left-call-list")).toBeVisible();
    await page.getByRole("tab", { name: /Einsätze/ }).click();
    const list = await page.locator(".mission-sidebar").boundingBox(),
      bounds = await log.boundingBox();
    expect(list!.y + list!.height).toBeLessThanOrEqual(bounds!.y);
    const identity = await page
        .locator(".control-topbar .hud-identity")
        .boundingBox(),
      menu = await page
        .getByRole("button", { name: "Leitstellenmenü", exact: true })
        .boundingBox();
    expect(menu!.x).toBeGreaterThanOrEqual(identity!.x + identity!.width);
    await page.screenshot({
      path: `.tools/screenshots/control-room/hud-${width}.png`,
    });
    await page
      .getByRole("button", { name: "Leitstellenmenü", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Zurück zum Hauptmenü", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Zurück zum Hauptmenü", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Spielen", exact: true }),
    ).toBeVisible();
  });
