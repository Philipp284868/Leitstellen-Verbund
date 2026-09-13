import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Config } from "../../src/server/config";
import type { startServer } from "../../src/server/index";
import { request } from "../../src/simulation/incidents";
import { updateIncidentRadio } from "../../src/simulation/incident-radio";
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
test("Kritischer Textfunk bleibt sichtbar; Lesen quittiert nicht; Übernahme und Freigabe erfolgen im Einsatz", async ({
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
  s.desk.fleet[s.vehicles[1].id].channel = "Feuerwehr Süd";
  app.db.save(owner, s);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);
  const log = page.getByRole("region", {
    name: "Einsatzübersicht und Textfunk",
  });
  await expect(
    log.locator('.event-preview[data-priority="critical"]'),
  ).toContainText("Erste Erkundung abgeschlossen.");
  await expect(log.locator("input:visible,textarea:visible")).toHaveCount(0);
  await log
    .locator('.event-preview[data-priority="critical"]')
    .filter({
      hasText: "Erste Erkundung abgeschlossen. Lagemeldung liegt vor.",
    })
    .click();
  const requestRow = page
    .locator(".radio-queue article")
    .filter({ hasText: "NOTFALL" });
  await expect(requestRow).toBeVisible();
  expect(
    app.db
      .all()
      .get(owner)!
      .missions[0].control!.radio.filter((r) => r.state === "open"),
  ).toHaveLength(2);
  await requestRow
    .getByRole("button", { name: "Sprechwunsch übernehmen", exact: true })
    .click();
  await expect(requestRow).toContainText("In Bearbeitung bei dir");
  await requestRow
    .getByRole("button", { name: "Bearbeitung freigeben", exact: true })
    .click();
  await expect(requestRow).toContainText("Offen · zur Übernahme verfügbar");
  await expect(
    log.locator('.event-preview[data-priority="critical"]'),
  ).toContainText("Erste Erkundung abgeschlossen.");
  await page.screenshot({
    path: info.outputPath("textfunk-und-einsatz-1920.png"),
  });
});

test("kompaktes Ereignispanel erhält Sprechwunsch, Leseposition und Verbindungshinweise", async ({
  page,
  context,
}) => {
  const initial = app.db.all().get(owner)!;
  for (let i = 0; i < 12; i++)
    transmit(initial, {
      id: `separate-system-${i}`,
      channel: "System",
      sender: "Leitstelle",
      vehicle: "",
      mission: "",
      text: `Unabhängiger Betriebshinweis ${i}.`,
      priority: 10,
      silent: true,
    });
  app.db.save(owner, initial);
  await login(page);
  const s = app.db.all().get(owner)!,
    m = s.missions[0];
  const arrival = m.control!.radio.find((r) => r.reason === "arrival")!;
  const summaryId = m.control!.radioSummary!.id;
  const visible = page.locator(`#radio-preview [data-event-id="${summaryId}"]`);
  await expect(visible).toBeVisible();
  await expect(page.locator(".compact-desk footer")).toContainText(
    "1 offene Sprechwünsche",
  );
  const before = structuredClone(arrival);
  await page.getByRole("tab", { name: /Aktive Einsätze/ }).click();
  arrival.priority = "NOTFALL";
  updateIncidentRadio(s, m);
  s.revision++;
  app.db.save(owner, s);
  await expect(page.locator(".critical-count")).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /Aktive Einsätze/ }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /Funk & Ereignisse/ }).click();
  await page.getByRole("button", { name: "Ereignispanel einklappen" }).click();
  await page.getByRole("button", { name: "Ereignispanel ausklappen" }).click();
  expect(
    app.db
      .all()
      .get(owner)!
      .missions[0].control!.radio.find((r) => r.id === arrival.id),
  ).toMatchObject({ ...before, priority: "NOTFALL", state: "open" });
  const scroll = page.locator("#radio-preview .preview-scroll");
  await scroll.evaluate((e) => {
    e.scrollTop = 90;
    e.dispatchEvent(new Event("scroll"));
  });
  const position = await scroll.evaluate((e) => e.scrollTop);
  expect(position).toBeGreaterThan(0);
  await page.getByRole("tab", { name: /Aktive Einsätze/ }).click();
  await page.getByRole("tab", { name: /Funk & Ereignisse/ }).click();
  expect(await scroll.evaluate((e) => e.scrollTop)).toBeCloseTo(position, 0);
  const anchor = await scroll.evaluate((el) => {
    const top = el.getBoundingClientRect().top;
    const row = [...el.querySelectorAll<HTMLElement>("[data-event-id]")].find(
      (r) => r.getBoundingClientRect().bottom > top,
    )!;
    return {
      id: row.dataset.eventId!,
      offset: row.getBoundingClientRect().top - top,
    };
  });
  const latest = app.db.all().get(owner)!;
  latest.time++;
  request(
    latest,
    latest.missions[0],
    latest.vehicles[1].id,
    "arrival",
    "Neue dringende Rückfrage während des Lesens.",
    "NOTFALL",
  );
  latest.revision++;
  app.db.save(owner, latest);
  await expect(scroll.locator(`[data-event-id="${summaryId}"]`)).toHaveCount(1);
  await expect(scroll.locator('[data-event-id^="incident:"]')).toHaveCount(1);
  await expect
    .poll(() =>
      scroll.evaluate((el, id) => {
        const row = [
          ...el.querySelectorAll<HTMLElement>("[data-event-id]"),
        ].find((r) => r.dataset.eventId === id)!;
        return row.getBoundingClientRect().top - el.getBoundingClientRect().top;
      }, anchor.id),
    )
    .toBeCloseTo(anchor.offset, 0);
  await context.setOffline(true);
  await expect(page.locator(".connection-inline")).toContainText(
    "Serververbindung verloren. Bitte die Seite neu laden oder den Support kontaktieren.",
  );
  await context.setOffline(false);
  await expect(page.locator(".connection-inline")).toHaveCount(0);
  await expect(
    page.locator(`#radio-preview [data-event-id="${summaryId}"]`),
  ).toHaveCount(1);
  await page.reload();
  await enterGame(page);
  await expect(
    page.locator(`#radio-preview [data-event-id="${summaryId}"]`),
  ).toHaveCount(1);
  await page.locator(`#radio-preview [data-event-id="${summaryId}"]`).click();
  await expect(page.locator(".radio-queue")).toBeVisible();
  expect(
    app.db
      .all()
      .get(owner)!
      .missions[0].control!.radio.find((r) => r.id === arrival.id)!.state,
  ).toBe("open");
});

test("Fortschrittsdetail zeigt nächste Kaufziele und Voraussetzungen; das kompakte Panel zählt tatsächliche Einsatzplätze", async ({
  page,
}, info) => {
  const s = app.db.all().get(owner)!;
  s.xp = 0;
  app.db.save(owner, s);
  await login(page);
  await expect(
    page.getByRole("tab", { name: /Aktive Einsätze/ }),
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
