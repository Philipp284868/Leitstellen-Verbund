import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { startOverviewLoadServer } from "./load-server";
test(
  "großer Browserbestand mit 100 Wachen, 500 Fahrzeugen und 40 Einsätzen bleibt bedienbar",
  { tag: "@load" },
  async ({ page }, info) => {
    const load = await startOverviewLoadServer();
    try {
      expect([
        load.buildings,
        load.vehicles,
        load.incidents,
        load.activeTrips,
      ]).toEqual([100, 500, 40, 100]);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewportSize({ width: 1600, height: 1000 });
      const started = Date.now();
      await page.goto(load.origin);
      await page
        .getByLabel("Benutzername", { exact: true })
        .fill("germany-load");
      await page
        .getByLabel("Passwort", { exact: true })
        .fill("Germany-load-password-123!");
      await page.getByRole("button", { name: "Anmelden", exact: true }).click();
      await page.getByRole("button", { name: "Spielen", exact: true }).click();
      await page.getByRole("button", { name: "Karte", exact: true }).click();
      await expect(
        page.getByText("Deutschland · reale Geografie", { exact: true }),
      ).toBeVisible();
      const readyMs = Date.now() - started;
      const before = Date.now();
      if (
        (await page
          .getByRole("button", { name: "Karte", exact: true })
          .getAttribute("aria-expanded")) !== "true"
      )
        await page.getByRole("button", { name: "Karte", exact: true }).click();
      await page
        .getByRole("button", { name: "Ganz Deutschland", exact: true })
        .click();
      await page
        .getByLabel("Karte durchsuchen", { exact: true })
        .fill("Regionsfahrzeug 99-4");
      await page
        .locator(".map-search-results")
        .getByRole("button", {
          name: "Regionsfahrzeug 99-4 Meine Leitstelle",
          exact: true,
        })
        .click();
      await expect(page.getByLabel("Ausgewähltes Fahrzeug")).toContainText(
        "Regionsfahrzeug 99-4",
      );
      await page.evaluate(() => {
        const measurement = {
          gaps: [] as number[],
          frame: 0,
          last: performance.now(),
        };
        Object.assign(window, { mapFrameMeasurement: measurement });
        const frame = (now: number) => {
          measurement.gaps.push(now - measurement.last);
          measurement.last = now;
          measurement.frame = requestAnimationFrame(frame);
        };
        measurement.frame = requestAnimationFrame(frame);
      });
      const dragStart = performance.now();
      await page.mouse.move(1000, 500);
      await page.mouse.down();
      await page.mouse.move(650, 550, { steps: 50 });
      await page.mouse.move(1100, 430, { steps: 50 });
      await page.mouse.up();
      const dragMs = performance.now() - dragStart;
      const gaps = await page.evaluate(() => {
        const m = (
          window as unknown as {
            mapFrameMeasurement: { gaps: number[]; frame: number };
          }
        ).mapFrameMeasurement;
        cancelAnimationFrame(m.frame);
        return m.gaps.sort((a, b) => a - b);
      });
      const p95FrameMs = gaps[Math.floor(gaps.length * 0.95)];
      expect(Number.isFinite(p95FrameMs)).toBe(true);
      expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
      const metrics = {
        dragMs,
        p95FrameMs,
        frames: gaps.length,
        browser: info.project.name,
        buildings: 100,
        vehicles: 500,
        activeTrips: 100,
        missions: 40,
        loginAndOpenMs: readyMs,
        overviewSearchSelectMs: Date.now() - before,
        markerElements: await page.locator(".germany-marker").count(),
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
    } finally {
      await load.stop();
    }
  },
);
