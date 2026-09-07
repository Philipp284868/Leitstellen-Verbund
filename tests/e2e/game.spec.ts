import { listenBrowserServer } from "./server-helper";
import { interviewUI, joinDesk } from "./desk-helpers";
import { test, expect, type Page, type Browser } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import type { startServer } from "../../server/index";
import type { Config } from "../../server/config";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, config: Config;
const password = "Only-a-browser-test-password!";
test.beforeEach(async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-browser-")),
    port = 0;
  config = {
    host: "127.0.0.1",
    port,
    publicUrl: `http://127.0.0.1:${port}`,
    dataDir: dir,
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  expect(app.db.sql.prepare("SELECT id FROM users").all()).toHaveLength(0);
});
test.afterEach(async () => {
  await app.close();
});
async function register(page: Page, label: string) {
  const username = label.toLowerCase() + "-" + crypto.randomUUID().slice(0, 8);
  await page.goto(config.publicUrl);
  await page
    .getByRole("button", { name: "Neues Konto erstellen", exact: true })
    .click();
  await expect(page.getByLabel("Einladungscode", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("Benutzername", { exact: true }).fill(username);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByLabel("Dein Anzeigename").fill(label);
  await page.getByLabel("Name deiner Leitstelle").fill(`Leitstelle ${label}`);
  await page
    .getByRole("button", { name: "Konto erstellen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Leitstelle öffnen", exact: false })
    .click();
  await expect(page.locator(".money")).toContainText("250.000");
  await expect(page.locator(".radio-bar")).toContainText(
    "Mit Spielserver verbunden",
  );
  expect(
    app.db.sql.prepare("SELECT role FROM users WHERE username=?").get(username)!
      .role,
  ).toBe("player");
  await expect(page.getByLabel("Spielgeschwindigkeit")).toHaveCount(0);
  return username;
}
async function enter(page: Page, username: string) {
  await page.goto(config.publicUrl);
  if (await page.getByLabel("Benutzername", { exact: true }).isVisible()) {
    await page.getByLabel("Benutzername", { exact: true }).fill(username);
    await page.getByLabel("Passwort", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Leitstelle öffnen", exact: false })
    .click();
}
async function resources(page: Page) {
  await page
    .locator(".bottom-panel")
    .getByRole("button", { name: "Wache bauen" })
    .click();
  await page
    .locator(".shop-card")
    .filter({
      has: page.getByRole("heading", { name: "Feuerwache", exact: true }),
    })
    .getByRole("button", { name: "Platzieren" })
    .click();
  const mapBounds = await page.locator("svg.map").boundingBox();
  await page.locator("svg.map").click({
    position: { x: mapBounds!.width * 0.3, y: mapBounds!.height * 0.55 },
  });
  await page
    .getByRole("button", { name: "Bau bestätigen", exact: true })
    .click();
  await expect(page.locator(".station-strip .station-card")).toHaveCount(1);
  app.game.step(30); // Advance the test server clock, never a player-controlled speed.
  await page.locator(".station-strip .station-card").first().click();
  await page.getByRole("button", { name: "18.000 Cr", exact: true }).click();
  await page
    .getByRole("button", { name: "6 einstellen", exact: false })
    .click();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Fuhrpark", exact: true }).click();
  await page.getByRole("button", { name: "Besetzen", exact: true }).click();
  await expect(page.getByText("Vollständig einsatzbereit")).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
}
function advanceWithRepairs(ownerId: string, finished: () => boolean) {
  for (let elapsed = 0; elapsed < 7200 && !finished(); elapsed += 30) {
    for (const v of app.db
      .all()
      .get(ownerId)!
      .vehicles.filter((v) => v.fault?.state === "awaiting"))
      app.game.command(ownerId, {
        id: crypto.randomUUID(),
        action: { type: "repair", vehicle: v.id },
      });
    app.game.step(30);
  }
}
async function pair(browser: Browser) {
  const ca = await browser.newContext(),
    cb = await browser.newContext(),
    a = await ca.newPage(),
    b = await cb.newPage();
  const ua = await register(a, "Anna"),
    ub = await register(b, "Ben");
  return { ca, cb, a, b, ua, ub };
}
test("Freie Registrierung, getrennte Spielerkonten, Solo-Einsatz, Belohnung, Rückkehr und Reload", async ({
  browser,
}) => {
  const { ca, cb, a, b, ua } = await pair(browser);
  await a.getByRole("button", { name: "Einstellungen", exact: true }).click();
  await expect(
    a.getByRole("heading", { name: "Serververwaltung" }),
  ).toHaveCount(0);
  await expect(
    a.getByRole("button", { name: "Einladung erstellen" }),
  ).toHaveCount(0);
  await a.getByRole("button", { name: "Schließen", exact: true }).click();
  await resources(a);
  await expect(b.locator(".money")).toContainText("250.000");
  await expect(b.locator(".station-strip .station-card")).toHaveCount(0);
  await a.locator(".mission-card").first().click();
  await interviewUI(a, app);
  await a.locator(".dispatch-list input").first().check();
  await a.getByRole("button", { name: "Alarmieren (1)", exact: true }).click();
  await expect
    .poll(() =>
      [...app.db.all().values()].some((s) =>
        s.vehicles.some((v) => v.status === "alarmed"),
      ),
    )
    .toBe(true);
  const owner = String(
    app.db.sql.prepare("SELECT id FROM users WHERE username=?").get(ua)!.id,
  );
  const missionId = app.db.all().get(owner)!.missions[0].id;
  advanceWithRepairs(owner, () =>
    app.db
      .all()
      .get(owner)!
      .vehicles.some((v) => v.mission === missionId && v.status === "scene"),
  );
  await a
    .getByRole("button", { name: "Lagemeldung aufnehmen", exact: true })
    .click();
  advanceWithRepairs(owner, () =>
    app.db
      .all()
      .get(owner)!
      .archive.some((m) => m.id === missionId),
  );
  await expect(
    a.getByText("Dieser Einsatz ist abgeschlossen.", { exact: false }),
  ).toBeVisible({ timeout: 100000 });
  await a.getByRole("button", { name: "Schließen", exact: true }).click();
  await a.getByRole("button", { name: "Fuhrpark", exact: true }).click();
  advanceWithRepairs(owner, () =>
    app.db
      .all()
      .get(owner)!
      .vehicles.every((v) => v.status === "ready"),
  );
  await expect(a.getByText("Vollständig einsatzbereit")).toBeVisible();
  await a.getByRole("button", { name: "Schließen", exact: true }).click();
  const money = await a.locator(".money strong").innerText();
  await enter(a, ua);
  await expect(a.locator(".money strong")).toHaveText(money);
  await expect(a.locator(".station-strip .station-card")).toHaveCount(1);
  await ca.close();
  await cb.close();
});
test("Gemeinsame Leitstelle läuft ohne zweiten Disponentenbrowser weiter; Neustart und Wiederherstellung erhalten Besitz", async ({
  browser,
}) => {
  const { ca, cb, a, b, ua, ub } = await pair(browser);
  await resources(a);
  await resources(b);
  await joinDesk(a, b, ub);
  await a.locator(".mission-card").first().click();
  await interviewUI(a, app);
  await b.locator(".mission-card").first().click();
  await b.locator(".dispatch-list input").first().check();
  await b.getByRole("button", { name: "Alarmieren (1)", exact: true }).click();
  await expect
    .poll(() =>
      [...app.db.all().values()].some((s) =>
        s.vehicles.some((v) => v.status === "alarmed"),
      ),
    )
    .toBe(true);
  const ownerId = String(
    app.db.sql.prepare("SELECT id FROM users WHERE username=?").get(ua)!.id,
  );
  const missionId = app.db.all().get(ownerId)!.missions[0].id;
  const advance = (finished: () => boolean) =>
    advanceWithRepairs(ownerId, finished);
  await cb.close();
  // Verify the recorded departure, not a transient status after an arbitrary
  // 61-second jump: a nearby incident can already have been reached by then.
  const departed = () =>
    app.db
      .all()
      .get(ownerId)!
      .missions.find((m) => m.id === missionId)!
      .control!.events.some((e) => e.type === "VEHICLE_DEPARTED");
  advance(departed);
  expect(departed()).toBe(true);
  expect(
    app.db
      .all()
      .get(ownerId)!
      .missions.find((m) => m.id === missionId)!
      .control!.events.some((e) => e.text.startsWith("FMS 3:")),
  ).toBe(true);
  // New accounts produce seeded but different incidents. A real breakdown requires a repair order.
  advance(() =>
    app.db
      .all()
      .get(ownerId)!
      .vehicles.some((v) => v.mission === missionId && v.status === "scene"),
  );
  await a
    .getByRole("button", { name: "Lagemeldung aufnehmen", exact: true })
    .click();
  advance(() =>
    app.db
      .all()
      .get(ownerId)!
      .archive.some((m) => m.id === missionId),
  );
  await expect(
    a.getByText("Dieser Einsatz ist abgeschlossen.", { exact: false }),
  ).toBeVisible({ timeout: 100000 });
  await a.getByRole("button", { name: "Schließen", exact: true }).click();
  const aMoney = await a.locator(".money strong").innerText(),
    c = await browser.newContext(),
    p = await c.newPage();
  await enter(p, ub);
  const bMoney = await p.locator(".money strong").innerText();
  expect(bMoney).not.toBe("173.400 Cr");
  await c.close();
  await ca.close();
  const backup = await app.db.backup();
  await app.close();
  app = compiled.startServer(config);
  await app.listen();
  const restart = await browser.newContext(),
    rp = await restart.newPage();
  await enter(rp, ua);
  await expect(rp.locator(".money strong")).toHaveText(aMoney);
  await restart.close();
  await app.close();
  const restore = spawnSync(
    process.execPath,
    ["dist/server/cli.js", "restore", "--file", backup, "--confirm"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DATA_DIR: config.dataDir,
        PUBLIC_URL: config.publicUrl,
        PORT: String(config.port),
        HOST: config.host,
      },
    },
  );
  expect(restore.status, restore.stderr).toBe(0);
  app = compiled.startServer(config);
  await app.listen();
  const restored = await browser.newContext(),
    page = await restored.newPage();
  await enter(page, ub);
  await expect(page.locator(".money strong")).toHaveText(bMoney);
  await expect(page.locator(".station-strip .station-card")).toHaveCount(1);
  await restored.close();
});
test("Mehrere Tabs verwenden einen Serverstand; Offline-Aktionen werden nicht bestätigt", async ({
  page,
  context,
}) => {
  const username = await register(page, "Tabs"),
    second = await context.newPage();
  await enter(second, username);
  await page.getByRole("button", { name: "Fortschritt", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Bereitschaftsdienst übernehmen",
      exact: false,
    })
    .click();
  await expect
    .poll(() => [...app.db.all().values()].some((s) => s.reliefActive))
    .toBe(true);
  app.game.step(125);
  await expect
    .poll(() => second.locator(".money strong").innerText())
    .not.toBe("250.000 Cr");
  await second.close();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  const before = await page.locator(".money strong").innerText();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator(".banner")).toContainText(
    "Serververbindung unterbrochen",
  );
  await page.getByRole("button", { name: "Fortschritt", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Bereitschaftsdienst übernehmen",
      exact: false,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText("Keine Serververbindung");
  expect(await page.locator(".money strong").innerText()).toBe(before);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".banner")).toHaveCount(0);
});
test("Export und validierte Altdateivorschau erlauben keine Übernahme fremden Guthabens", async ({
  page,
}) => {
  await register(page, "Sicherung");
  await page.getByRole("button", { name: "Sicherungen", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Spielstand exportieren", exact: true })
    .click();
  const download = await pending,
    file = await download.path();
  expect(file).toBeTruthy();
  await page.getByLabel("Spielstanddatei importieren").setInputFiles(file!);
  await expect(
    page.getByRole("heading", { name: "Import prüfen: Sicherung" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Geprüften Spielstand übernehmen" }),
  ).toHaveCount(0);
  await expect(page.locator(".money")).toContainText("250.000");
  await page.getByLabel("Spielstanddatei importieren").setInputFiles({
    name: "kaputt.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
});
test("Serverchat bleibt Klartext; Abmeldung entfernt private Daten und widerruft die Sitzung", async ({
  browser,
}) => {
  const { ca, cb, a, b, ua, ub } = await pair(browser);
  await joinDesk(a, b, ub);
  await a.getByRole("button", { name: "Freunde", exact: true }).click();
  await b.getByRole("button", { name: "Freunde", exact: true }).click();
  await a.getByLabel("Chatnachricht").fill("<b>Nur Text</b>");
  await a.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(b.locator(".chat-log")).toContainText("<b>Nur Text</b>");
  await expect(b.locator(".chat-log b")).toHaveText(ua);
  await a.getByRole("button", { name: "Schließen", exact: true }).click();
  await a.getByRole("button", { name: "Einstellungen", exact: true }).click();
  await a
    .getByRole("button", { name: "Alle Sitzungen abmelden", exact: true })
    .click();
  await expect(a.getByLabel("Benutzername", { exact: true })).toBeVisible();
  await expect(a.locator(".money")).toHaveCount(0);
  await enter(a, ua);
  await expect(a.locator(".chat-log")).toHaveCount(0);
  await ca.close();
  await cb.close();
});
test("Mobilansicht und notwendige Ressourcen bleiben auf demselben eigenen Server", async ({
  page,
}) => {
  const external: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(config.publicUrl)) external.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page, "Mobil");
  await expect(
    page.getByRole("button", { name: "Karte", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("amp-mobile.png"),
    fullPage: true,
  });
});
