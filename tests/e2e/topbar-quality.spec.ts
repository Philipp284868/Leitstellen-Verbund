import { openPanel, showMapTools } from "./ui-navigation";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Config } from "../../src/server/config";
import type { startServer } from "../../src/server/index";
import { phaseFixture } from "../dispatch-fixture";
import { listenBrowserServer } from "./server-helper";
import { expect, test, type Page } from "./test";

const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, config: Config, owner: string;
const password = "Topbar-quality-browser-284!";
test.use({ viewport: { width: 1600, height: 1000 }, actionTimeout: 15000 });
test.beforeEach(async () => {
  config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-topbar-quality-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  owner = await app.auth.create(
    "quality",
    password,
    "Testdisponent",
    "Leitstelle Qualität",
  );
  const save = phaseFixture(owner);
  save.missions = [];
  save.missionWait = 100000;
  save.nextMission = save.time + 100000;
  app.db.save(owner, save);
});
test.afterEach(async () => {
  await app.close();
  await rm(config.dataDir, { recursive: true, force: true });
});
async function enter(page: Page) {
  await page.goto(config.publicUrl);
  await page.getByLabel("Benutzername", { exact: true }).fill("quality");
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect(
    page.locator("[data-testid=germany-map-viewport]"),
  ).toBeVisible();
}

test("kompakte Topbar, freie Karte, Tastaturmenüs und unveränderte Kamera bei Menürückkehr", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enter(page);
  const topbar = page.locator(".topbar"),
    map = page.locator("[data-testid=germany-map-viewport]"),
    tools = page.getByRole("complementary", {
      name: "Kartenwerkzeuge",
      exact: true,
    });
  const top = await topbar.boundingBox(),
    box = await map.boundingBox();
  expect(top).not.toBeNull();
  expect(box).not.toBeNull();
  expect(top!.height).toBe(76);
  expect(top!.y).toBe(0);
  expect(box!.x).toBe(0);
  expect(box!.y).toBe(76);
  expect(box!.width).toBe(1600);
  expect(box!.height).toBe(924);
  await expect(page.locator(".mission-sidebar")).toBeVisible();
  await expect(tools).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Personal", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const notice = page.getByRole("button", {
    name: "Meldung schließen",
    exact: true,
  });
  if (await notice.isVisible()) await notice.click();
  await page.screenshot({ path: info.outputPath("topbar-idle-full-map.png") });
  const menu = page.getByRole("button", {
    name: "Leitstellenmenü",
    exact: true,
  });
  await showMapTools(page);
  await expect(tools).toBeVisible();
  const search = page.getByLabel("Karte durchsuchen", { exact: true });
  await expect(search).toBeFocused();
  await search.fill("Nord");
  await page.keyboard.press("Escape");
  await expect(tools).toBeHidden();
  await expect(menu).toBeFocused();
  const before = await map.getAttribute("data-camera");
  await menu.click();
  const popup = page.locator("#control-menu");
  await expect(popup).toBeVisible();
  const choices = popup.getByRole("button");
  await expect(choices.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(choices.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(choices.last()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(choices.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(menu).toBeFocused();
  expect(await map.getAttribute("data-camera")).toBe(before);
  await page.mouse.move(1050, 500);
  await page.mouse.wheel(0, -360);
  await expect.poll(() => map.getAttribute("data-camera")).not.toBe(before);
  const zoomed = await map.getAttribute("data-camera");
  await page.mouse.move(1050, 500);
  await page.mouse.down();
  await page.mouse.move(1220, 570, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => map.getAttribute("data-camera")).not.toBe(zoomed);
  const camera = await map.getAttribute("data-camera");
  await openPanel(page, "Zurück zum Hauptmenü");
  await expect(page.locator(".command-menu")).toBeVisible();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect(map).toHaveAttribute("data-camera", camera!);
  await expect(page.locator(".mission-sidebar")).toBeHidden();
  await page.getByRole("button", { name: /Einsätze.*Notrufe/ }).click();
  await expect(page.locator(".mission-sidebar")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Fahrzeugname wird inline gespeichert; Abbrechen, Escape und Verkaufsabbruch ändern keine Daten", async ({
  page,
}, info) => {
  await enter(page);
  const initial = app.db.all().get(owner)!,
    vehicle = initial.vehicles[0];
  const actions: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/action"))
      actions.push(request.postData() || "");
  });
  await openPanel(page, "Fuhrpark");
  const dialog = page.getByRole("dialog", { name: "Fuhrpark", exact: true }),
    card = dialog.locator(".fleet-card").first();
  await card.getByRole("button", { name: "Name", exact: true }).click();
  const field = card.getByRole("textbox", {
    name: "Neuer Fahrzeugname",
    exact: true,
  });
  await expect(field).toBeFocused();
  await field.fill("Florian Nord 01");
  await card.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect
    .poll(
      () =>
        app.db
          .all()
          .get(owner)!
          .vehicles.find((v) => v.id === vehicle.id)!.name,
    )
    .toBe("Florian Nord 01");
  await expect(field).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Name", exact: true }),
  ).toBeFocused();
  await expect(card).toContainText("Florian Nord 01");
  const count = actions.length;
  await card.getByRole("button", { name: "Name", exact: true }).click();
  await field.fill("Nicht speichern");
  await card.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(field).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Name", exact: true }),
  ).toBeFocused();
  await card.getByRole("button", { name: "Name", exact: true }).click();
  await expect(field).toHaveValue("Florian Nord 01");
  await field.fill("Escape schützt Entwurf");
  await page.keyboard.press("Escape");
  await expect(field).toHaveValue("Escape schützt Entwurf");
  await expect(dialog).toBeVisible();
  // A changed inline name is no longer silently discarded by Escape.
  await card.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(field).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Name", exact: true }),
  ).toBeFocused();
  await card.getByRole("button", { name: "Verkaufen", exact: true }).click();
  const confirm = card.locator(".inline-confirm");
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("Besatzung bleibt erhalten");
  await page.screenshot({
    path: info.outputPath("vehicle-inline-sale-confirm.png"),
  });
  await confirm.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Verkaufen", exact: true }),
  ).toBeFocused();
  expect(actions).toHaveLength(count);
  const after = app.db.all().get(owner)!;
  expect(after.vehicles.map((v) => v.id)).toEqual(
    initial.vehicles.map((v) => v.id),
  );
  expect(after.money).toBe(initial.money);
  expect(after.people.length).toBe(initial.people.length);
  expect(after.vehicles.find((v) => v.id === vehicle.id)!.name).toBe(
    "Florian Nord 01",
  );
  await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Leitstellenmenü", exact: true }),
  ).toBeFocused();
});

test("Tastatur erreicht die letzte Besatzungsdisclosure und bricht eine Verkaufsbestätigung ohne Dialogwechsel ab", async ({
  page,
}) => {
  await enter(page);
  const actions: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/action"))
      actions.push(request.postData() || "");
  });
  const opener = page.getByRole("button", {
    name: "Leitstellenmenü",
    exact: true,
  });
  await openPanel(page, "Fuhrpark");
  const dialog = page.getByRole("dialog", { name: "Fuhrpark", exact: true }),
    lastCard = dialog.locator(".fleet-card").last(),
    disclosure = lastCard.locator("details").filter({
      has: page.getByText("Besatzung & Einsatzbereitschaft", { exact: true }),
    }),
    summary = disclosure.locator("summary"),
    equipment = lastCard.locator("details").filter({
      has: page.getByText("Ausrüstung und Fahrzeugzustand", { exact: true }),
    }),
    equipmentSummary = equipment.locator("summary"),
    close = dialog.getByRole("button", { name: "Schließen", exact: true }),
    sell = lastCard.getByRole("button", { name: "Verkaufen", exact: true });
  await sell.focus();
  await page.keyboard.press("Tab");
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("open", "");
  await page.keyboard.press("Space");
  await expect(disclosure).not.toHaveAttribute("open", "");
  await page.keyboard.press("Tab");
  await expect(equipmentSummary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(equipment).toHaveAttribute("open", "");
  await page.keyboard.press("Space");
  await expect(equipment).not.toHaveAttribute("open", "");
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(equipmentSummary).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(summary).toBeFocused();

  await sell.focus();
  await page.keyboard.press("Enter");
  const confirmation = lastCard.locator(".inline-confirm"),
    cancel = confirmation.getByRole("button", {
      name: "Abbrechen",
      exact: true,
    });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(sell).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(confirmation).toHaveCount(0);
  await expect(sell).toBeFocused();
  expect(actions).toHaveLength(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
