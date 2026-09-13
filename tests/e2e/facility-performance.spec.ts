import { createFacilityLoad } from "../helpers/facility-load";
import { fixtureDataset } from "../fixtures/germany/locations";
import { DatabaseSync } from "node:sqlite";
import type { Config } from "../../src/server/config";
import { test, expect, browserGeography } from "./test";
import { loginAndEnter, openPanel } from "./ui-navigation";
import { mkdtemp, writeFile, cp, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { hash } from "../../src/server/auth";
import { fixtureFacilities } from "../fixtures/germany/facilities";
const compiled = (await import(
  pathToFileURL(
    resolve(process.env.PERF_BUILD_DIR || ".", "dist/server/index.js"),
  ).href
)) as typeof import("../../src/server/index");

test("facility viewport sustained drag measurement", async ({ page }) => {
  const config: Config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-facility-perf-")),
    secure: false,
    trustedProxies: [],
  };
  Object.assign(config, browserGeography());
  if (process.env.PERF_FACILITIES) {
    const dir = await mkdtemp(resolve(tmpdir(), "lv-browser-load-geodata-"));
    await cp(config.geodataDir!, dir, { recursive: true });
    const path = resolve(dir, "facilities.sqlite");
    await rename(path, resolve(dir, "facilities.original.sqlite"));
    createFacilityLoad(path, Number(process.env.PERF_FACILITIES));
    const catalog = new DatabaseSync(path);
    catalog
      .prepare("UPDATE metadata SET value=? WHERE key='dataset'")
      .run(fixtureDataset);
    catalog.close();
    config.geodataDir = dir;
  }
  const app = compiled.startServer(
    config,
    resolve(process.env.PERF_BUILD_DIR || ".", "dist/client"),
    await compiled.prepareGeography(config),
  );
  await app.listen();
  const address = app.http.address();
  if (!address || typeof address === "string") throw Error("Missing port");
  config.publicUrl = `http://127.0.0.1:${address.port}`;
  await app.auth.create(
    "mapmeasure",
    "Map-measure-password-123!",
    "Messung",
    "Berlin",
  );
  const metrics = {
    started: 0,
    failed: 0,
    ok: 0,
    limited: 0,
    bytes: 0,
    ms: [] as number[],
    allReads: 0,
  };
  const starts = new Map<string, number>();
  const originalAll = app.db.all.bind(app.db);
  app.db.all = (...args) => {
    metrics.allReads++;
    return originalAll(...args);
  };
  page.on("request", (r) => {
    if (r.url().includes("/api/facilities")) {
      metrics.started++;
      starts.set(r.url(), Date.now());
    }
  });
  page.on("requestfailed", (r) => {
    if (r.url().includes("/api/facilities")) metrics.failed++;
  });
  page.on("response", async (r) => {
    if (r.url().includes("/api/facilities")) {
      if (r.status() === 429) metrics.limited++;
      if (r.ok()) {
        metrics.ok++;
        if (
          r.url().includes("clusters=1") &&
          timings.facilityResponseMs === undefined
        )
          timings.facilityResponseMs = Date.now() - start;
        if (r.url().includes("q=")) timings.searchSucceeded = 1;
      }
      metrics.ms.push(Date.now() - (starts.get(r.url()) ?? Date.now()));
      try {
        metrics.bytes += (await r.body()).length;
      } catch {
        /* aborted response */
      }
    }
  });
  const timings: Record<string, number> = {};
  const start = Date.now();
  await page.addInitScript(() => {
    const measures = { longTasks: 0, longTaskMs: 0, mutations: 0 };
    Object.assign(window, { facilityMeasures: measures });
    if (PerformanceObserver.supportedEntryTypes.includes("longtask"))
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          measures.longTasks++;
          measures.longTaskMs += entry.duration;
        }
      }).observe({ type: "longtask", buffered: true });
    document.addEventListener("DOMContentLoaded", () =>
      new MutationObserver((list) => {
        measures.mutations += list.length;
      }).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
      }),
    );
  });
  try {
    await page.goto(config.publicUrl);
    await loginAndEnter(page, "mapmeasure", "Map-measure-password-123!");
    timings.hudMs = Date.now() - start;
    const viewport = page.getByTestId("germany-map-viewport");
    await expect(viewport).toHaveAttribute("data-camera", /zoom/);
    timings.mapMs = Date.now() - start;
    await expect(page.locator(".facility-map-canvas")).toHaveAttribute(
      "data-visible-count",
      /^\d+$/,
    );
    timings.canvasMs = Date.now() - start;
    const box = (await viewport.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
    await page.mouse.down();
    for (let i = 0; i < 300; i++) {
      await page.mouse.move(
        box.x + box.width * 0.5 + Math.sin(i / 40) * 180,
        box.y + box.height * 0.55 + Math.sin(i / 70) * 80,
      );
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(1200);
    if (!process.env.FACILITY_BASELINE) {
      await expect(page.locator(".facility-map-canvas")).toHaveAttribute(
        "data-visible-count",
        "0",
      );
      expect(metrics.started).toBe(0);
    }
    await openPanel(page, "Standorte verwalten");
    await page
      .getByRole("button", { name: "Standort kaufen", exact: true })
      .click();
    await page.getByLabel("Ort, Adresse oder Standortname").fill("Berlin");
    await page.waitForTimeout(800);
    timings.searchObservationMs = Date.now() - start;
    const browserMeasures = await page.evaluate(() => ({
      ...(window as unknown as { facilityMeasures: object }).facilityMeasures,
      canvases: document.querySelectorAll("canvas").length,
      domNodes: document.querySelectorAll("*").length,
      heap:
        (performance as unknown as { memory?: { usedJSHeapSize: number } })
          .memory?.usedJSHeapSize ?? null,
    }));
    metrics.ms.sort((a, b) => a - b);
    const report = {
      ...metrics,
      timings,
      browserMeasures,
      p50: metrics.ms[Math.floor(metrics.ms.length * 0.5)],
      p95: metrics.ms[Math.floor(metrics.ms.length * 0.95)],
    };
    await writeFile(
      resolve(
        ".tools",
        `facility-${process.env.FACILITY_BASELINE ? "before" : "after"}${process.env.PERF_FACILITIES ? "-" + process.env.PERF_FACILITIES : ""}.json`,
      ),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
    if (!process.env.FACILITY_BASELINE) {
      expect(metrics.limited).toBe(0);
      expect(metrics.started).toBeLessThan(35);
    }
  } finally {
    await app.close();
  }
});

test("real facility 429 waits, keeps the session and recovers the latest viewport", async ({
  page,
}) => {
  const config: Config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-facility-cooldown-")),
    secure: false,
    trustedProxies: [],
    ...browserGeography(),
  };
  const app = compiled.startServer(
    config,
    resolve("dist/client"),
    await compiled.prepareGeography(config),
  );
  await app.listen();
  const address = app.http.address();
  if (!address || typeof address === "string") throw Error("Missing port");
  config.publicUrl = `http://127.0.0.1:${address.port}`;
  const owner = await app.auth.create(
    "cooldown",
    "Map-measure-password-123!",
    "Cooldown",
    "Berlin",
  );
  try {
    await page.goto(config.publicUrl);
    await loginAndEnter(page, "cooldown", "Map-measure-password-123!");
    const canvas = page.locator(".facility-map-canvas");
    await expect(canvas).toHaveAttribute("data-loading", "false");
    const requests: { at: number; url: string }[] = [];
    let logins = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/facilities"))
        requests.push({ at: Date.now(), url: r.url() });
      if (r.url().includes("/api/login")) logins++;
    });
    app.db.sql
      .prepare("INSERT OR REPLACE INTO limits VALUES(?,?,?)")
      .run(hash(`facility-map:${owner}`), 240, Date.now() + 2300);
    const limited = page.waitForResponse(
      (r) => r.url().includes("/api/facilities") && r.status() === 429,
    );
    await page.evaluate(
      (point) =>
        window.dispatchEvent(
          new CustomEvent("lv:map-focus", { detail: { point, zoom: 16 } }),
        ),
      fixtureFacilities[0].pos,
    );
    const response = await limited;
    const wait = Number(response.headers()["retry-after"]) * 1000;
    const until = Date.now() + wait;
    await expect(
      page.getByText(/Standorte werden zu häufig abgefragt/),
    ).toBeVisible();
    const recovered = page.waitForResponse(
      (r) => r.url().includes("/api/facilities") && r.status() === 200,
    );
    await recovered;
    expect(requests.at(-1)!.at).toBeGreaterThanOrEqual(until - 100);
    expect(requests.length).toBeLessThanOrEqual(3);
    await expect(
      page.getByText(/Standorte werden zu häufig abgefragt/),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Leitstellenmenü", exact: true }),
    ).toBeVisible();
    expect(logins).toBe(0);
    expect(app.io.sockets.sockets.size).toBe(1);
  } finally {
    await app.close();
  }
});
