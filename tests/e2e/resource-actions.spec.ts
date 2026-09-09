import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import type { Config } from "../../server/config";
import { phaseFixture } from "../phase-fixture";
import { apply, tick } from "../../src/engine";
import { nodes } from "../../src/world";
import { BALANCE, bt, extensions, vt } from "../../src/catalog";
import { saleValue } from "../../src/economy/ledger";
import { formatMoney } from "../../src/money";
import { stationCapacity } from "../../src/simulation/staffing";
import { listenBrowserServer } from "./server-helper";
import { openPanel } from "./ui-navigation";

const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as {
  startServer: typeof startServer;
};
let app: ReturnType<typeof startServer>, config: Config, owner: string;
const password = "Resource-actions-test-password-123!";
const current = () => app.db.all().get(owner)!;
async function enter(page: Page) {
  await page.goto(config.publicUrl);
  if (await page.getByLabel("Benutzername", { exact: true }).isVisible()) {
    await page
      .getByLabel("Benutzername", { exact: true })
      .fill("resources-user");
    await page.getByLabel("Passwort", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  }
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
}
async function station(page: Page, name: string) {
  await openPanel(page, "Wachen");
  await page.locator(".station-card").filter({ hasText: name }).click();
}
async function doubleClick(button: Locator) {
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  await button
    .page()
    .mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, {
      clickCount: 2,
      delay: 0,
    });
}

test.beforeEach(async ({ page }) => {
  config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-resource-actions-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  owner = await app.auth.create(
    "resources-user",
    password,
    "Ressourcenprüfung",
    "Nord",
  );
  const s = phaseFixture(owner);
  s.missions = [];
  s.missionWait = 1e9;
  // Only setup uses the deterministic fixture; subsequent mutations use the UI.
  apply(s, { type: "build", kind: "fire", pos: nodes[150] });
  tick(s, s.time + 31, {}, false, false);
  s.buildings[0].name = "Nordwache";
  s.buildings[1].name = "Südwache";
  app.db.save(owner, s);
  await enter(page);
});
test.afterEach(async () => {
  await app.close();
});

test("Versetzen, Fahrzeugverkauf und leerer Standortverkauf sind echte einmalige Buchungen und bleiben nach Neustart erhalten", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const initial = structuredClone(current()),
    vehicle = initial.vehicles[0],
    target = initial.buildings[1];
  await openPanel(page, "Fuhrpark");
  const card = page.locator(".fleet-card").filter({ hasText: vehicle.name });
  await card
    .getByLabel(`Versetzen ${vehicle.name}`, { exact: true })
    .selectOption(target.id);
  await expect
    .poll(() => current().vehicles.find((v) => v.id === vehicle.id)!.home)
    .toBe(target.id);
  await expect(card).toContainText("Südwache");
  expect(current().money).toBe(initial.money);
  expect(current().people.filter((p) => p.vehicle === vehicle.id)).toHaveLength(
    0,
  );
  await page.reload();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await openPanel(page, "Fuhrpark");
  await expect(
    card.getByLabel(`Versetzen ${vehicle.name}`, { exact: true }),
  ).toHaveValue(target.id);
  const people = current()
    .people.map((p) => p.id)
    .sort();
  await card.getByRole("button", { name: "Verkaufen", exact: true }).click();
  let confirmation = card.locator(".inline-confirm");
  await expect(confirmation).toContainText(
    formatMoney(
      saleValue(vehicle.purchasePriceCents ?? vt(vehicle.type).price),
    ),
  );
  await confirmation
    .getByRole("button", { name: "Abbrechen", exact: true })
    .click();
  expect(current().money).toBe(initial.money);
  expect(current().vehicles.some((v) => v.id === vehicle.id)).toBe(true);
  let sales = 0;
  page.on("request", (request) => {
    if (
      request.url().endsWith("/api/action") &&
      request.postDataJSON().action?.type === "sell"
    )
      sales++;
  });
  await card.getByRole("button", { name: "Verkaufen", exact: true }).click();
  confirmation = card.locator(".inline-confirm");
  await doubleClick(
    confirmation.getByRole("button", { name: "Bestätigen", exact: true }),
  );
  await expect(card).toHaveCount(0);
  const afterVehicleSale =
    initial.money +
    saleValue(vehicle.purchasePriceCents ?? vt(vehicle.type).price);
  expect(current().money).toBe(afterVehicleSale);
  expect(
    current()
      .people.map((p) => p.id)
      .sort(),
  ).toEqual(people);
  expect(sales).toBe(1);
  await station(page, target.name);
  await page
    .getByRole("tab", { name: "Ausbau & Funktionen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Standort verkaufen", exact: true })
    .click();
  const siteConfirm = page.locator(".inline-confirm");
  await siteConfirm
    .getByRole("button", { name: "Abbrechen", exact: true })
    .click();
  expect(current().buildings.some((b) => b.id === target.id)).toBe(true);
  await page
    .getByRole("button", { name: "Standort verkaufen", exact: true })
    .click();
  await siteConfirm
    .getByRole("button", { name: "Bestätigen", exact: true })
    .click();
  await expect
    .poll(() => current().buildings.some((b) => b.id === target.id))
    .toBe(false);
  expect(sales).toBe(2);
  expect(current().people.some((p) => p.home === target.id)).toBe(false);
  const finalMoney =
    afterVehicleSale +
    saleValue(target.purchasePriceCents ?? bt(target.type).price);
  expect(current().money).toBe(finalMoney);
  expect(current().vehicles.map((v) => v.id)).toEqual(
    initial.vehicles.slice(1).map((v) => v.id),
  );
  await app.close();
  app = compiled.startServer(config);
  await app.listen();
  await enter(page);
  await expect(page.locator(".hud-budget strong")).toHaveText(
    formatMoney(finalMoney),
  );
  await expect(page.locator("svg.map [data-own-station]")).toHaveCount(1);
  await openPanel(page, "Fuhrpark");
  await expect(card).toHaveCount(0);
  await expect(page.locator(".fleet-card")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("Gebäudeausbau und technische Erweiterung warten den Bau ab und erlauben danach tatsächlich einen automatisch besetzten Rüstwagen", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const before = structuredClone(current()),
    home = before.buildings[0],
    upgradePrice = BALANCE.upgrade * home.level;
  await station(page, home.name);
  await page
    .getByRole("tab", { name: "Ausbau & Funktionen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ausbau bestätigen", exact: true })
    .click();
  let confirmation = page.locator(".inline-confirm");
  await expect(confirmation).toContainText(formatMoney(upgradePrice));
  await confirmation
    .getByRole("button", { name: "Abbrechen", exact: true })
    .click();
  expect(current().buildings[0].level).toBe(home.level);
  expect(current().money).toBe(before.money);
  let upgrades = 0;
  page.on("request", (request) => {
    if (
      request.url().endsWith("/api/action") &&
      request.postDataJSON().action?.type === "upgrade"
    )
      upgrades++;
  });
  await page
    .getByRole("button", { name: "Ausbau bestätigen", exact: true })
    .click();
  confirmation = page.locator(".inline-confirm");
  await doubleClick(
    confirmation.getByRole("button", { name: "Bestätigen", exact: true }),
  );
  await expect.poll(() => current().buildings[0].level).toBe(home.level + 1);
  expect(upgrades).toBe(1);
  expect(current().money).toBe(before.money - upgradePrice);
  expect(current().buildings[0].organization).toEqual(home.organization);
  expect(current().buildings[0].ready).toBeGreaterThan(current().time);
  await expect(
    page.getByRole("button", { name: "Ausbau bestätigen", exact: true }),
  ).toBeDisabled();
  const technical = extensions.find((e) => e.id === "technical")!;
  const extension = page
    .locator(".shop-card")
    .filter({
      has: page.getByRole("heading", { name: technical.name, exact: true }),
    });
  await expect(
    extension.getByRole("button", { name: "Erweiterung bauen", exact: true }),
  ).toBeDisabled();
  app.game.step(BALANCE.upgradeSeconds + 1);
  await expect(
    extension.getByRole("button", { name: "Erweiterung bauen", exact: true }),
  ).toBeEnabled();
  expect(stationCapacity(current().buildings[0]).slots).toBe(
    stationCapacity(home).slots * 2,
  );
  await extension
    .getByRole("button", { name: "Erweiterung bauen", exact: true })
    .click();
  await extension
    .getByRole("button", { name: "Bestätigen", exact: true })
    .click();
  await expect
    .poll(() => current().buildings[0].extensions.includes("technical"))
    .toBe(true);
  expect(current().money).toBe(before.money - upgradePrice - technical.price);
  await page
    .getByRole("tab", { name: "Fahrzeuge & Vergleich", exact: true })
    .click();
  const buy = page.locator('[data-tutorial="buy-rw"]');
  await expect(buy).toBeDisabled();
  app.game.step(BALANCE.upgradeSeconds + 1);
  await expect(buy).toBeEnabled();
  await buy.click();
  await page
    .getByRole("region", { name: "Fahrzeugkauf bestätigen", exact: true })
    .getByRole("button", { name: "Kauf verbindlich bestätigen", exact: true })
    .click();
  await expect
    .poll(() => current().vehicles.some((v) => v.type === "rw"))
    .toBe(true);
  const rw = current().vehicles.find((v) => v.type === "rw")!;
  const crew = current().people.filter((p) => p.vehicle === rw.id);
  expect(crew).toHaveLength(vt("rw").crew);
  expect(crew.every((p) => p.skills.includes(vt("rw").training!))).toBe(true);
  expect(current().money).toBe(
    before.money - upgradePrice - technical.price - vt("rw").price,
  );
  await page.reload();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await station(page, home.name);
  await expect(
    page.getByText("Betriebsbereit", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "Ausbau & Funktionen", exact: true })
    .click();
  await expect(extension).toContainText("Freigeschaltet");
  expect(errors).toEqual([]);
});
