import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../src/server/index";
import { phaseFixture } from "../dispatch-fixture";
import { fixtureMission } from "../fixtures/germany/mission";
import { attachIncident } from "../../src/simulation/calls";
import { listenBrowserServer } from "./server-helper";
import { test, expect } from "./test";
import { openPanel } from "./ui-navigation";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
for (const [width, height, scale] of [
  [1366, 768, 100],
  [1920, 1080, 100],
  [2560, 1440, 100],
  [1366, 768, 125],
  [1366, 768, 150],
  [1920, 1080, 150],
]) {
  test(`Helles HUD ${width}x${height} bei ${scale} Prozent`, async ({
    page,
  }, info) => {
    const config = {
      host: "127.0.0.1",
      port: 0,
      publicUrl: "http://127.0.0.1:0",
      dataDir: await mkdtemp(resolve(tmpdir(), "lv-light-hud-")),
      secure: false,
      trustedProxies: [],
    };
    const app = await listenBrowserServer(compiled.startServer, config);
    try {
      const id = await app.auth.create(
        "hud",
        "Light-HUD-password!",
        "Prüfung",
        "Berlin",
      );
      const s = phaseFixture(id);
      s.missionWait = 100000;
      s.nextMission = s.time + 100000;
      for (let i = 0; i < 5; i++) {
        const m = fixtureMission(s, "bin");
        s.missions.push(m);
        attachIncident(s, m);
      }
      app.db.save(id, s);
      await page.setViewportSize({ width, height });
      await page.addInitScript(
        (value) =>
          localStorage.setItem(
            "lv-device-v2",
            JSON.stringify({ version: 2, scale: value }),
          ),
        scale,
      );
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(config.publicUrl);
      await page.getByLabel("Benutzername", { exact: true }).fill("hud");
      await page
        .getByLabel("Passwort", { exact: true })
        .fill("Light-HUD-password!");
      await page.getByRole("button", { name: "Anmelden", exact: true }).click();
      await page.getByRole("button", { name: "Spielen", exact: true }).click();
      const map = page.getByTestId("germany-map-viewport"),
        menu = page.getByRole("button", {
          name: "Leitstellenmenü",
          exact: true,
        });
      await expect(map).toHaveAttribute("data-camera", /.+/);
      await expect(page.locator(".connection-inline")).toHaveCount(0);
      await expect(page.locator(".control-menu")).toHaveCount(0);
      await expect(page.locator(".status-tile")).toHaveCount(4);
      await expect(
        page.locator(".hud-identity,.mission-sidebar,.hud-shell > .event-log"),
      ).toHaveCount(0);
      await expect(
        page.getByRole("tab", { name: /Funk & Ereignisse/ }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(page.locator(".event-preview").nth(3)).toBeVisible();
      const desk = await page.locator(".compact-desk").boundingBox(),
        status = await page.locator(".hud-status").boundingBox();
      expect(desk!.y).toBeGreaterThanOrEqual(status!.y + status!.height + 10);
      expect(desk!.x + desk!.width).toBeCloseTo(width - 20, 0);
      expect(desk!.height).toBeLessThanOrEqual(scale === 100 ? 365 : 510);
      expect(
        await page
          .locator(".compact-desk")
          .evaluate((e) => getComputedStyle(e).backgroundColor),
      ).toBe("rgb(248, 250, 255)");
      const camera = await map.getAttribute("data-camera");
      await mkdir(".tools/hud-acceptance", { recursive: true });
      const shot = async (state: string) => {
        if (info.project.name === "chromium")
          await page.screenshot({
            path: `.tools/hud-acceptance/${width}-${scale}-${state}.png`,
          });
      };
      await shot("closed-radio");
      await menu.click();
      const nav = page.getByRole("navigation", {
        name: "Leitstellenmenü",
        exact: true,
      });
      await expect(nav.getByRole("button")).toHaveText([
        "Suchen …",
        "Fahrzeuge",
        "Standorte",
        "AAO & Disposition",
        "Verbund",
        "Einsatzarchiv",
        "Statistiken",
        "Leaderboard",
        "Changelogs",
        "Einstellungen",
        "Support",
        "Zurück zum Hauptmenü",
      ]);
      const navBox = await nav.boundingBox();
      expect(navBox!.x + navBox!.width).toBeLessThan(desk!.x);
      expect(
        navBox!.x + navBox!.width <= status!.x ||
          navBox!.y >= status!.y + status!.height,
      ).toBe(true);
      await shot("open-radio");
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();
      await menu.click();
      await page.mouse.click(500, Math.min(height - 120, 500));
      await expect(nav).toHaveCount(0);
      await expect(menu).toBeFocused();
      expect(await map.getAttribute("data-camera")).toBe(camera);
      await page.getByRole("tab", { name: /Aktive Einsätze/ }).click();
      await expect(page.locator(".mission-card")).toHaveCount(6);
      await expect(page.locator("#radio-preview")).toBeHidden();
      await shot("closed-missions");
      await menu.click();
      await shot("open-missions");
      await page.keyboard.press("Escape");
      await page.locator(".mission-card").first().click();
      const dockBox = await page.locator(".incident-dock").boundingBox();
      const scaleBox = await page
        .locator(".maplibregl-ctrl-scale")
        .boundingBox();
      expect(dockBox!.y + dockBox!.height).toBeLessThan(scaleBox!.y);
      await page
        .locator(".incident-dock")
        .getByRole("button", { name: "Schließen", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Ereignispanel einklappen" })
        .click();
      await expect(page.locator("#missions-preview")).toBeHidden();
      await page
        .getByRole("button", { name: "Ereignispanel ausklappen" })
        .click();
      await page.getByRole("button", { name: "Vorschau durchsuchen" }).click();
      await page
        .getByRole("textbox", { name: "Einsätze durchsuchen", exact: true })
        .fill("kein passender Name");
      await expect(page.locator(".mission-card")).toHaveCount(0);
      await page.getByRole("tab", { name: /Funk & Ereignisse/ }).click();
      await page.getByRole("tab", { name: /Aktive Einsätze/ }).click();
      await expect(
        page.getByRole("textbox", {
          name: "Einsätze durchsuchen",
          exact: true,
        }),
      ).toHaveValue("kein passender Name");
      expect(await map.getAttribute("data-camera")).toBe(camera);
      if (width === 1920 && scale === 100) {
        for (const name of [
          "Fahrzeuge",
          "Standorte",
          "AAO & Disposition",
          "Verbund",
          "Einsatzarchiv",
          "Statistiken",
          "Leaderboard",
          "Changelogs",
          "Einstellungen",
          "Support",
        ]) {
          await openPanel(page, name);
          await expect(page.getByRole("dialog")).toBeVisible();
          await expect(
            page.getByText("Ansicht wird geladen …", { exact: true }),
          ).toBeHidden();
        }
        await openPanel(page, "Suche");
        await expect(page.getByLabel("Karte durchsuchen")).toBeFocused();
        await page.getByLabel("Karte durchsuchen").fill("FMS");
        await expect(
          page.getByRole("button", { name: /FMS und Alarmierungsprofile/ }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await openPanel(page, "Zurück zum Hauptmenü");
        await expect(
          page.getByRole("button", { name: "Spielen", exact: true }),
        ).toBeVisible();
      }
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  });
}
