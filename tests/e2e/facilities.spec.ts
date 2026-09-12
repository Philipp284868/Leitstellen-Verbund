import { openPanel, loginAndEnter } from "./ui-navigation";
import { pathToFileURL } from "node:url";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test, expect, type Page } from "./test";
import { listenBrowserServer } from "./server-helper";
import type { Config } from "../../src/server/config";
import { fixtureFacilities } from "../fixtures/germany/facilities";
import { bt } from "../../src/shared/catalog";

const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as typeof import("../../src/server/index");
test("zwei Leitstellen erwerben denselben festen Standort unabhängig; Bestätigung, Karte, Reconnect und Neustart bleiben konsistent", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const config: Config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-facility-browser-")),
    secure: false,
    trustedProxies: [],
  };
  let app = await listenBrowserServer(compiled.startServer, config);
  const password = "Facilities-test-password-123!";
  const a = await app.auth.create("site-owner", password, "Anna", "Nord"),
    b = await app.auth.create("site-other", password, "Ben", "Süd");
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    const enter = async (page: Page, username: string) => {
      await page.goto(config.publicUrl);
      await loginAndEnter(page, username, password);
    };
    await Promise.all(
      pages.map((p, i) => enter(p, i ? "site-other" : "site-owner")),
    );
    const original = app.db.all().get(a)!.money,
      facility = fixtureFacilities.find((f) => f.kind === "fire")!;
    const choose = async (page: Page) => {
      await openPanel(page, "Standorte verwalten");
      await page
        .getByRole("button", { name: "Standort kaufen", exact: true })
        .click();
      await page
        .getByLabel("Ort, Adresse oder Standortname")
        .fill(facility.name);
      await page
        .locator(".facility-result")
        .filter({ hasText: facility.name })
        .first()
        .click();
      await expect(
        page.getByRole("region", { name: "Standortdetails" }),
      ).toBeVisible();
    };
    await choose(pages[0]);
    await pages[0]
      .getByRole("button", { name: "Standorte direkt auf der Karte auswählen" })
      .click();
    const map = pages[0].getByTestId("germany-map-viewport");
    await expect(map).toHaveAttribute("data-camera-moving", "false");
    await expect(pages[0].locator(".facility-map-canvas")).toHaveAttribute(
      "data-visible-count",
      /^[1-9]\d*$/,
    );
    const box = await map.boundingBox();
    await map.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
    await expect(
      pages[0].getByRole("heading", { name: "Einrichtungen an dieser Stelle" }),
    ).toBeVisible();
    await pages[0]
      .getByRole("button", {
        name: `${facility.name} · Feuerwache`,
        exact: true,
      })
      .click();
    await expect(
      pages[0].getByRole("region", { name: "Standortdetails" }),
    ).toContainText(facility.name);
    await pages[0].screenshot({ path: ".tools/facility-map-browser.png" });
    await expect(
      pages[0].getByRole("button", { name: "Platzieren", exact: true }),
    ).toHaveCount(0);
    await pages[0].getByRole("button", { name: /^Kaufen ·/ }).click();
    expect(app.db.all().get(a)!.buildings).toHaveLength(0);
    await pages[0]
      .getByRole("button", { name: "Kauf verbindlich bestätigen" })
      .click();
    await expect(
      pages[0].getByRole("button", { name: "Verwalten", exact: true }),
    ).toBeVisible();
    expect(app.db.all().get(a)!.money).toBe(original - bt("fire").price);
    expect(app.db.all().get(b)!.buildings).toHaveLength(0);
    await choose(pages[1]);
    await pages[1].getByRole("button", { name: /^Kaufen ·/ }).click();
    await pages[1]
      .getByRole("button", { name: "Kauf verbindlich bestätigen" })
      .click();
    await expect(
      pages[1].getByRole("button", { name: "Verwalten", exact: true }),
    ).toBeVisible();
    const first = app.db.all().get(a)!.buildings[0],
      second = app.db.all().get(b)!.buildings[0];
    expect(first.facility!.id).toBe(second.facility!.id);
    expect(first.facility!.position).toEqual(facility.pos);
    await pages[0]
      .getByRole("button", { name: "Verwalten", exact: true })
      .click();
    await expect(
      pages[0].getByRole("tablist", { name: "Wachenbereiche" }),
    ).toBeVisible();
    await app.close();
    app = await listenBrowserServer(compiled.startServer, config);
    await enter(pages[0], "site-owner");
    await openPanel(pages[0], "Standorte verwalten");
    await expect(pages[0].locator(".station-card")).toContainText(
      facility.name,
    );
    expect(app.db.all().get(a)!.buildings[0].facility).toEqual(first.facility);
    expect(
      app.db.sql.prepare("SELECT COUNT(*) n FROM facility_rights").get()!.n,
    ).toBe(2);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await app.close();
  }
});
