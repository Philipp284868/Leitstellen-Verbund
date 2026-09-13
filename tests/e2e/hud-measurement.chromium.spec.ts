import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../src/server/index";
import { phaseFixture } from "../dispatch-fixture";
import { listenBrowserServer } from "./server-helper";
import { test, expect } from "./test";

test("Menü- und Reiterwechsel erzeugen keine Kartenabfragen oder Kameraänderung", async ({
  page,
  context,
}) => {
  const compiled = (await import(
    pathToFileURL(resolve("dist/server/index.js")).href
  )) as { startServer: typeof startServer };
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-hud-measure-")),
    secure: false,
    trustedProxies: [],
  };
  const app = await listenBrowserServer(compiled.startServer, config);
  try {
    const id = await app.auth.create(
      "measure",
      "Hud-measure-password!",
      "Messung",
      "Leitstelle",
    );
    const s = phaseFixture(id);
    s.missionWait = 100000;
    s.nextMission = s.time + 100000;
    app.db.save(id, s);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(config.publicUrl);
    await page.getByLabel("Benutzername", { exact: true }).fill("measure");
    await page
      .getByLabel("Passwort", { exact: true })
      .fill("Hud-measure-password!");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await page.getByRole("button", { name: "Spielen", exact: true }).click();
    const map = page.locator("[data-testid=germany-map-viewport]");
    await expect(map).toHaveAttribute("data-camera", /.+/);
    await page.waitForTimeout(1200);
    const camera = await map.getAttribute("data-camera");
    const handle = await map.elementHandle();
    const requests: string[] = [];
    page.on("request", (r) => requests.push(new URL(r.url()).pathname));
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    const metrics = async () =>
      Object.fromEntries(
        (await cdp.send("Performance.getMetrics")).metrics.map((m) => [
          m.name,
          m.value,
        ]),
      );
    const before = await metrics();
    const baseline = process.env.LV_HUD_BASELINE === "1";
    for (let i = 0; i < 10; i++) {
      await page
        .getByRole("button", { name: "Leitstellenmenü", exact: true })
        .click();
      await page.keyboard.press("Escape");
      if (baseline) {
        await page.getByRole("tab", { name: /Notrufe/ }).click();
        await page.getByRole("tab", { name: /^Einsätze/ }).click();
      } else {
        await page
          .getByRole("button", { name: "Einsatzliste einklappen" })
          .click();
        await page
          .getByRole("button", { name: "Einsatzliste ausklappen" })
          .click();
      }
    }
    const after = await metrics();
    expect(await map.getAttribute("data-camera")).toBe(camera);
    expect(await handle!.evaluate((e) => e.isConnected)).toBe(true);
    const geo = requests.filter((p) => /facilities|geodata|\/geo\//.test(p));
    expect(geo).toEqual([]);
    const result = {
      source:
        "built game, 1920x1080, ten menu cycles and twenty tab switches, Chromium CDP",
      requests,
      geographicRequests: geo.length,
      cameraPreserved: true,
      mapRetained: true,
      metrics: Object.fromEntries(
        [
          "TaskDuration",
          "ScriptDuration",
          "LayoutDuration",
          "RecalcStyleDuration",
          "LayoutCount",
          "RecalcStyleCount",
        ].map((k) => [k, after[k] - before[k]]),
      ),
    };
    await mkdir(".tools/hud-acceptance", { recursive: true });
    await writeFile(
      `.tools/hud-acceptance/measurement-${baseline ? "before" : "after"}.json`,
      JSON.stringify(result, null, 2),
    );
  } finally {
    await app.close();
  }
});
