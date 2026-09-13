import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Config } from "../../src/server/config";
import type { startServer } from "../../src/server/index";
import { request } from "../../src/simulation/incidents";
import { transmit } from "../../src/simulation/transmissions";
import { radioFixture } from "../radio-fixture";
import { createBrowserServer, listenBrowserServer } from "./server-helper";
import { expect, test, type Page } from "./test";
import { enterGame, openPanel, showIncidents } from "./ui-navigation";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>,
  config: Config,
  owner: string,
  member: string;
const password = "Radio-browser-password-123!";
test.beforeEach(async () => {
  config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-radio-browser-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  owner = await app.auth.create("alpha", password, "Alpha", "Nord");
  member = await app.auth.create("bravo", password, "Bravo", "Süd");
  app.db.save(owner, radioFixture(owner));
  app.game.command(owner, {
    id: crypto.randomUUID(),
    action: { type: "member-invite", username: "bravo" },
  });
  app.game.command(member, {
    id: crypto.randomUUID(),
    action: { type: "member-accept", owner },
  });
});
test.afterEach(async () => {
  await app.close();
});
async function login(page: Page, username = "alpha") {
  await page.goto(config.publicUrl);
  await page.getByLabel("Benutzername", { exact: true }).fill(username);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await enterGame(page);
}
async function radio(page: Page) {
  await showIncidents(page);
  await page.locator(".mission-card").first().click();
  await expect(page.locator(".radio-queue")).toBeVisible();
}

test("zwei Disponenten bearbeiten Lage und Nachforderung bis zur Alarmierung und zum persistenten Archiv", async ({
  page,
  browser,
}, info) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const second = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  try {
    const other = await second.newPage(),
      errors: string[] = [];
    for (const p of [page, other])
      p.on("pageerror", (e) => errors.push(e.message));
    await login(page);
    await login(other, "bravo");
    await radio(page);
    await radio(other);
    const desk = page.locator(".radio-queue"),
      otherDesk = other.locator(".radio-queue");
    await desk
      .getByRole("button", { name: "Sprechwunsch übernehmen", exact: true })
      .click();
    await expect(desk).toContainText("In Bearbeitung bei dir");
    await expect(otherDesk).toContainText("In Bearbeitung bei alpha");
    await expect(
      otherDesk.getByRole("button", {
        name: "Lagemeldung aufnehmen",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      desk.getByRole("button", {
        name: "Nachforderung bearbeiten",
        exact: true,
      }),
    ).toBeDisabled();
    const lease = app.db.all().get(owner)!.missions[0].control!.radio[0]
      .handling;
    await app.close();
    app = await createBrowserServer(compiled.startServer, config);
    await app.listen();
    await page.reload();
    await enterGame(page);
    await radio(page);
    expect(
      app.db.all().get(owner)!.missions[0].control!.radio[0].handling,
    ).toEqual(lease);
    await expect(desk).toContainText("In Bearbeitung bei dir");
    await page.context().setOffline(true);
    await expect(
      desk.getByRole("button", { name: "Lagemeldung aufnehmen", exact: true }),
    ).toBeDisabled();
    await page.context().setOffline(false);
    await expect(
      desk.getByRole("button", { name: "Lagemeldung aufnehmen", exact: true }),
    ).toBeEnabled();
    await desk
      .getByRole("button", { name: "Lagemeldung aufnehmen", exact: true })
      .click();
    await expect
      .poll(() => app.db.all().get(owner)!.missions[0].control!.radio[0].state)
      .toBe("handled");
    app.game.step(5);
    await desk
      .getByRole("button", { name: "Sprechwunsch übernehmen", exact: true })
      .click();
    await desk
      .getByRole("button", { name: "Rückfrage zur Lage", exact: true })
      .click();
    await expect(desk.locator(".radio-answer")).toContainText("Löschwasser");
    await desk
      .getByRole("button", { name: "Nachforderung bearbeiten", exact: true })
      .click();
    await expect
      .poll(
        () =>
          app.db
            .all()
            .get(owner)!
            .missions[0].control!.radio.filter((r) => r.state === "open")
            .length,
      )
      .toBe(0);
    expect(app.db.all().get(owner)!.vehicles[1].status).toBe("ready");
    await page.screenshot({
      path: info.outputPath("radio-nachforderung-1366.png"),
      fullPage: true,
    });
    await page
      .locator(".dispatch-list label")
      .filter({ hasText: "TLF 4000" })
      .locator("input")
      .check();
    await page
      .getByRole("button", { name: "Alarmieren (1)", exact: true })
      .click();
    await expect
      .poll(() => app.db.all().get(owner)!.vehicles[1].status)
      .toBe("alarmed");
    const s = app.db.all().get(owner)!,
      mission = s.missions[0].id;
    app.game.step(s.vehicles[1].arrive - s.time + 70);
    await expect(
      page.getByText("Dieser Einsatz ist abgeschlossen.", { exact: false }),
    ).toBeVisible();
    await app.close();
    app = await createBrowserServer(compiled.startServer, config);
    await app.listen();
    await page.reload();
    await enterGame(page);
    await openPanel(page, "Archiv");
    await page
      .getByRole("button", { name: "Verlauf ansehen", exact: true })
      .first()
      .click();
    await expect(page.locator(".incident-history")).toContainText(
      "zur Bearbeitung übernommen",
    );
    await expect(page.locator(".incident-history")).toContainText(
      "Rückfrage beantwortet",
    );
    expect(
      app.db
        .all()
        .get(owner)!
        .archive.find((m) => m.id === mission)!
        .control!.radio.some(
          (r) => r.handledBy === owner && r.answer?.includes("Löschwasser"),
        ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await second.close();
  }
});
test("Offene Lagemeldungen bleiben ausschließlich im Einsatz bearbeitbar; Lesen und Hinweisablauf quittieren nichts", async ({
  page,
}, info) => {
  const s = app.db.all().get(owner)!,
    m = s.missions[0];
  request(
    s,
    m,
    s.vehicles[1].id,
    "arrival",
    "Dringende Erkundung abgeschlossen.",
    "NOTFALL",
  );
  app.db.save(owner, s);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);
  await expect(
    page.locator(".game-toast,.event-log,.event-preview"),
  ).toHaveCount(0);
  await radio(page);
  const row = page
    .locator(".radio-queue article")
    .filter({ hasText: "NOTFALL" });
  await expect(row).toBeVisible();
  expect(
    app.db
      .all()
      .get(owner)!
      .missions[0].control!.radio.filter((r) => r.state === "open"),
  ).toHaveLength(2);
  await row
    .getByRole("button", { name: "Sprechwunsch übernehmen", exact: true })
    .click();
  await expect(row).toContainText("In Bearbeitung bei dir");
  await row
    .getByRole("button", { name: "Bearbeitung freigeben", exact: true })
    .click();
  await expect(row).toContainText("Offen · zur Übernahme verfügbar");
  await page.screenshot({ path: info.outputPath("lage-im-einsatz-1920.png") });
});

test("ein Dreisekundenhinweis ab DOM-Einblendung; Offlinezustand bleibt, Remount und Reconnect spielen nichts nach", async ({
  page,
  context,
}) => {
  const initial = app.db.all().get(owner)!;
  for (let i = 0; i < 12; i++)
    transmit(initial, {
      id: "old-system-" + i,
      channel: "System",
      sender: "Leitstelle",
      vehicle: "",
      mission: "",
      text: "Älterer Betriebshinweis " + i,
      priority: 10,
      silent: true,
    });
  app.db.save(owner, initial);
  await login(page);
  await radio(page);
  const before = app.db.all().get(owner)!.missions[0].control!.radio;
  await expect(page.locator(".game-toast")).toHaveCount(0);
  const button = page
    .locator(".radio-queue")
    .getByRole("button", { name: "Sprechwunsch übernehmen", exact: true });
  await button.focus();
  await page.evaluate(() => {
    const measurements: {
      shown: number;
      removed: number;
      count: number;
      max: number;
    } = { shown: 0, removed: 0, count: 0, max: 0 };
    Object.assign(window, { toastMeasurements: measurements });
    const observer = new MutationObserver(() => {
      const visible = document.querySelectorAll(".game-toast").length;
      measurements.max = Math.max(measurements.max, visible);
      if (visible && !measurements.shown) {
        measurements.shown = performance.now();
        measurements.count++;
      }
      if (!visible && measurements.shown && !measurements.removed)
        measurements.removed = performance.now();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await context.setOffline(true);
  const toast = page.locator(".game-toast");
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("Serververbindung verloren");
  await expect(button).toBeDisabled();
  const box = await toast.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(300);
  expect(box!.width).toBeLessThanOrEqual(420);
  expect(
    Math.abs(box!.x + box!.width / 2 - page.viewportSize()!.width / 2),
  ).toBeLessThan(2);
  await page.mouse.move(box!.x + 20, box!.y + 10);
  await expect(toast).toHaveCount(0, { timeout: 5000 });
  const timing = await page.evaluate(
    () =>
      (
        window as unknown as {
          toastMeasurements: {
            shown: number;
            removed: number;
            count: number;
            max: number;
          };
        }
      ).toastMeasurements,
  );
  expect(timing.max).toBe(1);
  expect(timing.count).toBe(1);
  expect(timing.removed - timing.shown).toBeGreaterThanOrEqual(2950);
  expect(timing.removed - timing.shown).toBeLessThan(3300);
  await expect(page.locator(".offline-badge")).toBeVisible();
  expect(app.db.all().get(owner)!.missions[0].control!.radio).toEqual(before);
  await context.setOffline(false);
  await expect(button).toBeEnabled();
  await expect(page.locator(".offline-badge")).toHaveCount(0);
  await openPanel(page, "Zurück zum Hauptmenü");
  await enterGame(page);
  await expect(
    page.locator(".game-toast,.event-log,.event-preview"),
  ).toHaveCount(0);
  await page.reload();
  await enterGame(page);
  await radio(page);
  await expect(page.locator(".game-toast")).toHaveCount(0);
  expect(app.db.all().get(owner)!.missions[0].control!.radio).toEqual(before);
});

test("Fortschrittsdetail zeigt nächste Kaufziele und Voraussetzungen; das kompakte Panel zählt tatsächliche Einsatzplätze", async ({
  page,
}, info) => {
  const s = app.db.all().get(owner)!;
  s.xp = 0;
  app.db.save(owner, s);
  await login(page);
  await expect(
    page.getByRole("heading", { name: /Aktive Einsätze/ }),
  ).toContainText("1 / 3");
  await openPanel(page, "Fortschritt");
  await page
    .getByText("Fortschritt & Freischaltungen · Stufe 1", { exact: true })
    .click();
  const detail = page.locator(".progression-details");
  await expect(detail).toContainText("Nächstes Ziel: Stufe 2");
  await expect(detail).toContainText("noch 240 bis Stufe 2");
  await detail
    .getByLabel("Freischaltungen suchen", { exact: true })
    .fill("NEF");
  await expect(detail.locator("ol")).toContainText("Stufe 9");
  await expect(detail.locator("ol")).toContainText("freier Stellplatz");
  await detail
    .getByLabel("Freigabestatus", { exact: true })
    .selectOption("available");
  await expect(detail).toContainText("Keine passende Freischaltung");
  await detail
    .getByLabel("Freigabestatus", { exact: true })
    .selectOption("all");
  await page.screenshot({
    path: info.outputPath("fortschritt-nef-voraussetzungen.png"),
  });
});
