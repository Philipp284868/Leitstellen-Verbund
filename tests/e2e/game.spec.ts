import { test, expect, type Page } from "@playwright/test";
import { established, emsProfile, largeProfile } from "./fixtures";
import { exportText } from "../../src/storage";
import type { Save } from "../../src/model";
async function importSave(page: Page, s: Save) {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Spielstand importieren", exact: true })
    .click();
  await page.getByLabel("Spielstanddatei importieren").setInputFiles({
    name: "fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(exportText(s)),
  });
  await page
    .getByRole("button", { name: "Geprüften Spielstand übernehmen" })
    .click();
  await expect(
    page.getByRole("heading", { name: `Import prüfen: ${s.player.name}` }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Fortsetzen", exact: false }).click();
}
async function profile(page: Page, name = "Anna") {
  await page.goto("./");
  await page.getByRole("button", { name: "Neues Spiel", exact: false }).click();
  await page.getByLabel("Dein Anzeigename").fill(name);
  await page.getByLabel("Name deiner Leitstelle").fill(`Leitstelle ${name}`);
  await page.getByRole("button", { name: "Leitstelle gründen" }).click();
  await expect(page.locator(".money")).toContainText("250.000");
  await page.getByLabel("Spielgeschwindigkeit").selectOption("32");
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
  const map = page.locator("svg.map");
  await map.click({ position: { x: 80, y: 130 } });
  await page.locator(".station-strip").getByRole("button").first().click();
  await page.getByRole("button", { name: "18.000 Cr", exact: true }).click();
  await page.getByRole("button", { name: "6 einstellen" }).click();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Fuhrpark", exact: true }).click();
  await page.getByRole("button", { name: "Besetzen", exact: true }).click();
  await expect(page.getByText("Vollständig einsatzbereit")).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
}
async function friends(page: Page) {
  await page.getByRole("button", { name: "Freunde", exact: true }).click();
}
async function connect(a: Page, b: Page) {
  const countA = await a
      .locator(".friend")
      .filter({ hasText: "Verbunden" })
      .count(),
    countB = await b
      .locator(".friend")
      .filter({ hasText: "Verbunden" })
      .count();
  await a.getByRole("button", { name: "Angebot erstellen" }).click();
  await expect(a.getByLabel("Verbindungstext zum Weitergeben")).not.toHaveValue(
    "",
  );
  const offer = await a
    .getByLabel("Verbindungstext zum Weitergeben")
    .inputValue();
  await b.getByLabel("Angebot oder Antwort einfügen").fill(offer);
  await b.getByRole("button", { name: "Verbindungstext übernehmen" }).click();
  await expect(b.getByLabel("Verbindungstext zum Weitergeben")).not.toHaveValue(
    "",
  );
  const answer = await b
    .getByLabel("Verbindungstext zum Weitergeben")
    .inputValue();
  await a.getByLabel("Angebot oder Antwort einfügen").fill(answer);
  await a.getByRole("button", { name: "Verbindungstext übernehmen" }).click();
  await expect(
    a.locator(".friend").filter({ hasText: "Verbunden" }),
  ).toHaveCount(countA + 1);
  await expect(
    b.locator(".friend").filter({ hasText: "Verbunden" }),
  ).toHaveCount(countB + 1);
}
test("A/C: erster vollständiger Solo-Einsatz, Belohnung, Rückkehr und Reload", async ({
  page,
}) => {
  await profile(page);
  await resources(page);
  await expect(page.locator(".mission-card").first()).toBeVisible();
  await page.locator(".mission-card").first().click();
  await page.locator(".dispatch-list input").first().check();
  await page
    .getByRole("button", { name: "Alarmieren (1)", exact: true })
    .click();
  await expect(
    page.getByText("Dieser Einsatz ist abgeschlossen.", { exact: false }),
  ).toBeVisible({ timeout: 90000 });
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Fuhrpark", exact: true }).click();
  await expect(page.getByText("Vollständig einsatzbereit")).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  const money = await page.locator(".money strong").innerText();
  await page.screenshot({
    path: "test-results/leitstelle-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Fortsetzen", exact: false }).click();
  await expect(page.locator(".money strong")).toHaveText(money);
  await expect(page.locator(".station-strip .station-card")).toHaveCount(1);
});
test("D: Export, Importvorschau und beschädigte Datei", async ({ page }) => {
  await profile(page);
  await page.getByRole("button", { name: "Sicherungen", exact: true }).click();
  const file = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Spielstand exportieren", exact: true })
      .click(),
  ]);
  const path = await file[0].path();
  expect(path).toBeTruthy();
  await page.getByLabel("Spielstanddatei importieren").setInputFiles(path!);
  await expect(
    page.getByRole("heading", { name: "Import prüfen: Anna" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Geprüften Spielstand übernehmen" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Import prüfen: Anna" }),
  ).not.toBeVisible();
  await page.getByLabel("Spielstanddatei importieren").setInputFiles({
    name: "kaputt.json",
    mimeType: "application/json",
    buffer: Buffer.from("{kaputt"),
  });
  await expect(page.locator(".modal [role=alert]")).toBeVisible();
  await page.getByLabel("Spielstanddatei importieren").setInputFiles({
    name: "alt.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "leitstellen-verbund", version: 0 }),
    ),
  });
  await expect(page.locator(".modal [role=alert]")).toContainText(
    "nicht unterstützte Version",
  );
});
test("E/F: echte WebRTC-DataChannels über UI und gemeinsame Unterstützung", async ({
  browser,
}) => {
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  await profile(a, "Anna");
  await resources(a);
  await profile(b, "Ben");
  await resources(b);
  await friends(a);
  await friends(b);
  await connect(a, b);
  await a.getByLabel("Chatnachricht").fill("<b>Funkprobe</b>");
  await a.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(b.locator(".chat-log")).toContainText("<b>Funkprobe</b>");
  await expect(b.locator(".chat-log b")).toHaveText("Anna");
  await a.getByRole("button", { name: "Schließen", exact: true }).click();
  await a.locator(".mission-card").first().click();
  await a
    .getByRole("button", { name: "Mit Freunden teilen", exact: true })
    .click();
  await expect(b.getByLabel("Eigenes Fahrzeug anbieten").first()).toBeVisible();
  await b
    .getByLabel("Eigenes Fahrzeug anbieten")
    .first()
    .selectOption({ index: 1 });
  await expect(b.locator(".radio-bar")).toContainText(
    "Unterstützung bestätigt",
    { timeout: 15000 },
  );
  await expect(
    a.getByText("Dieser Einsatz ist abgeschlossen.", { exact: false }),
  ).toBeVisible({ timeout: 90000 });
  await expect(b.locator(".radio-bar")).toContainText("Belohnung verbucht", {
    timeout: 15000,
  });
  await ca.close();
  await cb.close();
});
test("I/J: zweiter Tab schreibgeschützt und gecachter Produktions-Unterpfad offline", async ({
  page,
  context,
}) => {
  await profile(page);
  await page.reload();
  await page.getByRole("button", { name: "Fortsetzen", exact: false }).click();
  const second = await context.newPage();
  await second.goto("./");
  await expect(
    second.getByText("Schreibgeschützter Tab.", { exact: false }),
  ).toBeVisible();
  await second.close();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "Fortsetzen", exact: false }).click();
  await expect(page.locator(".money")).toContainText("250.000");
  await context.setOffline(false);
});
test("J: mobile Bedienung und lokale Ressourcen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await profile(page);
  await expect(
    page.getByRole("button", { name: "Karte", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Einsätze (0)", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bereitschaft herstellen" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/leitstelle-mobil.png",
    fullPage: true,
  });
});
test("B: Wachenausbau, Fachausbildung und weitere Organisation über UI", async ({
  page,
}) => {
  await importSave(page, established("Anna"));
  await page.locator(".station-strip .station-card").first().click();
  await page.getByRole("button", { name: "Ausbauen", exact: false }).click();
  await expect(page.locator(".stat-row")).toContainText("2");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page
    .locator(".bottom-panel")
    .getByRole("button", { name: "Wache bauen" })
    .click();
  await page
    .locator(".shop-card")
    .filter({
      has: page.getByRole("heading", {
        name: "Ausbildungszentrum",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Platzieren" })
    .click();
  await page.locator("svg.map").click({ position: { x: 220, y: 180 } });
  await page.locator(".station-strip .station-card").first().click();
  await expect(
    page.getByRole("button", { name: "Ausbilden", exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ausbilden", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("In Ausbildung: Drehleiter", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Drehleiter · Zugewiesen", { exact: false }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page
    .locator(".bottom-panel")
    .getByRole("button", { name: "Wache bauen" })
    .click();
  await page
    .locator(".shop-card")
    .filter({
      has: page.getByRole("heading", { name: "Rettungswache", exact: true }),
    })
    .getByRole("button", { name: "Platzieren" })
    .click();
  await page.locator("svg.map").click({ position: { x: 320, y: 260 } });
  await expect(page.locator(".station-strip .station-card")).toHaveCount(3);
});
test("D: vollständiger Speicherfehlerpfad ohne scheinbaren Kauf", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(IDBFactory.prototype, "open", {
      value() {
        throw new DOMException("Speicher verweigert", "QuotaExceededError");
      },
    });
  });
  const page = await context.newPage();
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText(
    "Speicher nicht verfügbar",
  );
  await expect(
    page.getByRole("button", { name: "Bereinigte Diagnose" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Neues Spiel", exact: false }).click();
  await page.getByLabel("Dein Anzeigename").fill("Anna");
  await page.getByLabel("Name deiner Leitstelle").fill("Nord");
  await page.getByRole("button", { name: "Leitstelle gründen" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".money")).toHaveCount(0);
  await context.close();
});
test("F/G: gemeinsamer Patiententransport und doppelte Nachrichten zahlen nur einmal", async ({
  browser,
}) => {
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  await ca.addInitScript(() => {
    const original = RTCDataChannel.prototype.send;
    Object.defineProperty(RTCDataChannel.prototype, "send", {
      value: function (this: RTCDataChannel, data: unknown) {
        Reflect.apply(original, this, [data]);
        Reflect.apply(original, this, [data]);
      },
    });
  });
  await cb.addInitScript(() => {
    const original = RTCDataChannel.prototype.send;
    Object.defineProperty(RTCDataChannel.prototype, "send", {
      value: function (this: RTCDataChannel, data: unknown) {
        if (typeof data === "string" && JSON.parse(data).payload.type === "ack")
          return;
        Reflect.apply(original, this, [data]);
      },
    });
  });
  const a = await ca.newPage(),
    b = await cb.newPage();
  const sa = emsProfile("Anna"),
    sb = emsProfile("Ben");
  await importSave(a, sa);
  await importSave(b, sb);
  await friends(a);
  await friends(b);
  await connect(a, b);
  await a.getByRole("button", { name: "Schließen", exact: true }).click();
  await a
    .locator(".mission-card")
    .filter({ hasText: "Medizinischer Notfall" })
    .first()
    .click();
  await a
    .getByRole("button", { name: "Mit Freunden teilen", exact: true })
    .click();
  await expect(b.getByLabel("Eigenes Fahrzeug anbieten")).toBeVisible();
  await b
    .getByLabel("Eigenes Fahrzeug anbieten")
    .selectOption({ label: sb.vehicles.find((v) => v.type === "rtw")!.name });
  await expect(b.locator(".radio-bar")).toContainText(
    "Unterstützung bestätigt",
  );
  await expect(
    a.getByText("Dieser Einsatz ist abgeschlossen.", { exact: false }),
  ).toBeVisible({ timeout: 90000 });
  await expect(b.locator(".money strong")).toHaveText(
    new Intl.NumberFormat("de-DE").format(sb.money + 4250) + " Cr",
  );
  await expect(a.locator(".money strong")).toHaveText(
    new Intl.NumberFormat("de-DE").format(sa.money + 4250) + " Cr",
  );
  await b.reload();
  await b.getByRole("button", { name: "Fortsetzen", exact: false }).click();
  await expect(b.locator(".money strong")).toHaveText(
    new Intl.NumberFormat("de-DE").format(sb.money + 4250) + " Cr",
  );
  await a.getByRole("button", { name: "Schließen", exact: true }).click();
  await friends(a);
  await friends(b);
  await expect(
    a.locator(".friend").filter({ hasText: "Verbunden" }),
  ).toHaveCount(0);
  await connect(a, b);
  await expect(b.locator(".radio-bar")).toContainText("Belohnung verbucht");
  await expect(b.locator(".money strong")).toHaveText(
    new Intl.NumberFormat("de-DE").format(sb.money + 4250) + " Cr",
  );
  await ca.close();
  await cb.close();
});
test("H: drei direkte Verbindungen bleiben ohne ursprüngliche Einladende nutzbar", async ({
  browser,
}) => {
  const ca = await browser.newContext(),
    cb = await browser.newContext(),
    cc = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage(),
    c = await cc.newPage();
  await profile(a, "Anna");
  await profile(b, "Ben");
  await profile(c, "Clara");
  await friends(a);
  await friends(b);
  await friends(c);
  await connect(a, b);
  await connect(a, c);
  await connect(b, c);
  await ca.close();
  await b
    .getByLabel("Chatnachricht")
    .fill("Ben an Clara: direkte Verbindung steht");
  await b.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(c.locator(".chat-log")).toContainText(
    "Ben an Clara: direkte Verbindung steht",
  );
  await cb.close();
  await cc.close();
});
test("G: falscher Absender, Verbindungsabbruch und sicherer lokaler Rückruf", async ({
  browser,
}) => {
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  await ca.addInitScript(() => {
    const original = RTCDataChannel.prototype.send;
    Object.defineProperty(RTCDataChannel.prototype, "send", {
      value: function (this: RTCDataChannel, data: unknown) {
        if (typeof data === "string") {
          const parsed = JSON.parse(data);
          if (parsed.payload.type === "chat")
            Reflect.apply(original, this, [
              JSON.stringify({
                ...parsed,
                sender: "falscher-absender",
                payload: { type: "chat", text: "DARF NICHT ERSCHEINEN" },
              }),
            ]);
        }
        Reflect.apply(original, this, [data]);
      },
    });
  });
  const a = await ca.newPage(),
    b = await cb.newPage();
  await profile(a, "Anna");
  await resources(a);
  await profile(b, "Ben");
  await resources(b);
  await friends(a);
  await friends(b);
  await connect(a, b);
  await a.getByLabel("Chatnachricht").fill("Gültige Funkmeldung");
  await a.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(b.locator(".chat-log")).toContainText("Gültige Funkmeldung");
  await expect(b.locator(".chat-log")).not.toContainText(
    "DARF NICHT ERSCHEINEN",
  );
  await a.getByRole("button", { name: "Schließen", exact: true }).click();
  await a.locator(".mission-card").first().click();
  await a
    .getByRole("button", { name: "Mit Freunden teilen", exact: true })
    .click();
  await expect(b.getByLabel("Eigenes Fahrzeug anbieten")).toBeVisible();
  await b.getByLabel("Eigenes Fahrzeug anbieten").selectOption({ index: 1 });
  await expect(b.locator(".radio-bar")).toContainText(
    "Unterstützung bestätigt",
  );
  await ca.close();
  await b.getByRole("button", { name: "Schließen", exact: true }).click();
  await b.getByRole("button", { name: "Fuhrpark", exact: true }).click();
  await expect(b.getByText("Vollständig einsatzbereit")).toBeVisible({
    timeout: 90000,
  });
  await b.getByRole("button", { name: "Schließen", exact: true }).click();
  await b.locator(".mission-card").first().click();
  await b.locator(".dispatch-list input").first().check();
  await b.getByRole("button", { name: "Alarmieren (1)", exact: true }).click();
  await expect(
    b.getByText("Dieser Einsatz ist abgeschlossen.", { exact: false }),
  ).toBeVisible({ timeout: 90000 });
  await cb.close();
});
test("Lasttest: 100 Gebäude, 300 Fahrzeuge und 50 Einsätze im Produktionsbrowser", async ({
  page,
  browser,
}) => {
  const s = largeProfile(),
    start = Date.now();
  await importSave(page, s);
  await expect(page.locator(".station-strip .station-card")).toHaveCount(100);
  await expect(page.locator(".mission-card")).toHaveCount(50);
  await page.getByRole("button", { name: "Fuhrpark", exact: true }).click();
  await expect(page.locator(".fleet-card")).toHaveCount(300);
  const rendered = Date.now();
  await test.info().attach("lastmessung.json", {
    body: JSON.stringify(
      {
        browser: browser.version(),
        platform: process.platform,
        buildings: 100,
        vehicles: 300,
        people: 1800,
        missions: 50,
        importAndRenderMs: rendered - start,
        jsonBytes: Buffer.byteLength(exportText(s)),
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});
test("Vier Spieler: vollständiges direktes Netz ohne zentralen Host", async ({
  browser,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () => browser.newContext()),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  for (let i = 0; i < 4; i++) {
    await profile(pages[i], ["Anna", "Ben", "Clara", "David"][i]);
    await friends(pages[i]);
  }
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++) await connect(pages[i], pages[j]);
  for (const p of pages)
    await expect(
      p.locator(".friend").filter({ hasText: "Verbunden" }),
    ).toHaveCount(3);
  await contexts[0].close();
  await pages[1].getByLabel("Chatnachricht").fill("Verbund bleibt online");
  await pages[1].getByRole("button", { name: "Senden", exact: true }).click();
  await expect(pages[2].locator(".chat-log")).toContainText(
    "Verbund bleibt online",
  );
  await expect(pages[3].locator(".chat-log")).toContainText(
    "Verbund bleibt online",
  );
  for (const c of contexts.slice(1)) await c.close();
});
