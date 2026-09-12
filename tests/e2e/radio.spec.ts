import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Config } from "../../src/server/config";
import type { startServer } from "../../src/server/index";
import { request } from "../../src/simulation/incidents";
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
  const log = page.getByRole("region", { name: "Funk und Ereignisse" });
  await expect(log.locator(".critical-events")).toContainText(
    "Erste Erkundung abgeschlossen.",
  );
  await expect(log.locator("input,textarea")).toHaveCount(0);
  await log
    .locator(".critical-events")
    .getByRole("button", {
      name: "Erste Erkundung abgeschlossen. Lagemeldung liegt vor.",
      exact: true,
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
  await expect(log.locator(".critical-events")).toContainText(
    "Erste Erkundung abgeschlossen.",
  );
  await page.screenshot({
    path: info.outputPath("textfunk-und-einsatz-1920.png"),
  });
});
