import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test, expect } from "./test";
import { listenBrowserServer } from "./server-helper";
import { loginAndEnter } from "./ui-navigation";
import { project } from "../../src/shared/germany/projection";
import { markerFocusZoom } from "../../src/client/germany/metric-scale";
import { phaseFixture } from "../dispatch-fixture";
import { coordinates } from "../fixtures/germany/locations";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as typeof import("../../src/server/index");
for (const width of [1366, 2560])
  test(`metrische Spielmarker bei 500/200/100/50 m über drei Breiten, Maus und Tastatur ${width}`, async ({
    page,
  }) => {
    const c = {
      host: "127.0.0.1",
      port: 0,
      publicUrl: "http://127.0.0.1:0",
      dataDir: await mkdtemp(resolve(tmpdir(), "lv-scale-")),
      secure: false,
      trustedProxies: [],
    };
    const app = await listenBrowserServer(compiled.startServer, c);
    try {
      const id = await app.auth.create(
        "scale-player",
        "Scale-password-123!",
        "Maßstab",
        "Berlin",
      );
      app.db.save(id, phaseFixture(id));
      await page.setViewportSize({
        width,
        height: width === 1366 ? 768 : 1440,
      });
      const requests: { url: string; bytes: number; ms: number }[] = [],
        starts = new Map<string, number>();
      page.on("request", (r) => {
        if (/\/api\/(water|facilities)\?/.test(r.url()))
          starts.set(r.url(), performance.now());
      });
      page.on("response", async (r) => {
        if (starts.has(r.url()))
          try {
            requests.push({
              url: r.url(),
              bytes: (await r.body()).length,
              ms: performance.now() - starts.get(r.url())!,
            });
          } catch {
            /* canceled viewport response */
          }
      });
      await page.goto(c.publicUrl);
      await loginAndEnter(page, "scale-player", "Scale-password-123!");
      const map = page.getByTestId("germany-map-viewport");
      const scale = page.locator(".germany-map[data-scale-meters]");
      const focus = async (lat: number, zoom: number) => {
        await page.evaluate(
          (detail) =>
            window.dispatchEvent(new CustomEvent("lv:map-focus", { detail })),
          { point: project({ lon: coordinates[0].lon, lat }), zoom },
        );
        await expect(map).toHaveAttribute("data-camera-moving", "false");
      };
      for (const lat of [47.3, coordinates[0].lat, 54.85]) {
        const zoom = markerFocusZoom(lat);
        await focus(lat, zoom - 1.2);
        await expect(scale).toHaveAttribute("data-scale-meters", "500");
        await expect(page.locator(".germany-marker")).toHaveCount(0);
        for (const selector of [".facility-map-canvas", ".water-map-canvas"])
          await expect(page.locator(selector)).toHaveAttribute(
            "data-visible-count",
            "0",
          );
        const before = requests.length;
        await map.focus();
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowLeft");
        await expect(map).toHaveAttribute("data-camera-moving", "false");
        await page.waitForTimeout(650);
        expect(requests.length).toBe(before);
        const box = await map.boundingBox();
        await page.mouse.click(
          box!.x + box!.width / 2,
          box!.y + box!.height / 2,
        );
        await expect(
          page.locator(
            ".facility-map-panel,.map-vehicle-detail,.incident-dock",
          ),
        ).toHaveCount(0);
        for (const [delta, meters] of [
          [0, 200],
          [1, 100],
          [2, 50],
        ]) {
          await focus(lat, zoom + delta);
          await expect(scale).toHaveAttribute(
            "data-scale-meters",
            String(meters),
          );
          if (lat === coordinates[0].lat) {
            await expect(page.locator(".facility-map-canvas")).toHaveAttribute(
              "data-visible-count",
              /^[1-9]\d*$/,
            );
            await expect(page.locator(".water-map-canvas")).toHaveAttribute(
              "data-visible-count",
              /^[1-9]\d*$/,
            );
          }
        }
      }
      await focus(coordinates[0].lat, markerFocusZoom(coordinates[0].lat));
      const count = requests.length;
      const box = await map.boundingBox();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      for (let n = 0; n < 120; n++)
        await page.mouse.move(
          box!.x + box!.width / 2 + n / 12,
          box!.y + box!.height / 2,
        );
      await page.mouse.up();
      await page.waitForTimeout(1100);
      expect(requests.length - count).toBeLessThanOrEqual(2);
      await page.mouse.move(
        box!.x + box!.width / 2,
        box!.y + box!.height * 0.7,
      );
      await page.mouse.wheel(0, 960);
      // Input deliberately clamps one wheel event; crossing the next 1/2/5
      // ruler interval requires a second real wheel gesture after settling.
      await page.waitForTimeout(300);
      await page.mouse.wheel(0, 960);
      await expect(scale).not.toHaveAttribute("data-scale-meters", "200");
      await expect(
        page.locator(
          ".map-quick-tools,.maplibregl-ctrl-zoom-in,.maplibregl-ctrl-zoom-out",
        ),
      ).toHaveCount(0);
      await expect(page.locator(".maplibregl-ctrl-attrib")).toBeVisible();
      await writeFile(
        `.tools/infrastructure-acceptance/marker-requests-${width}.json`,
        JSON.stringify(requests, null, 2),
      );
      await page.screenshot({
        path: `.tools/infrastructure-acceptance/metric-scale-${width}.png`,
      });
    } finally {
      await app.close();
    }
  });
