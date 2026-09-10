import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Config } from "../../server/config";
import type { startServer } from "../../server/index";
import { request } from "../../src/simulation/incidents";
import { radioFixture } from "../radio-fixture";
import { createBrowserServer, listenBrowserServer } from "./server-helper";
import { expect, test, type Page } from "./test";
import { enterGame, openPanel } from "./ui-navigation";
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
  await page.getByRole("button", { name: "Funk", exact: true }).click();
  await page.getByRole("button", { name: /^Sprechwünsche \d+$/ }).click();
  await expect(
    page.getByRole("heading", { name: "Funkarbeitsplatz", exact: true }),
  ).toBeVisible();
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
    const desk = page.locator(".radio-workspace"),
      otherDesk = other.locator(".radio-workspace");
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
    await otherDesk
      .getByRole("button", {
        name: "Einsatz öffnen / weitere Kräfte disponieren",
      })
      .click();
    await expect(
      other
        .locator(".radio-queue")
        .getByRole("button", { name: "Lagemeldung aufnehmen", exact: true }),
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
    await expect(desk.locator(".radio-conversation")).toContainText(
      "Erledigt von dir",
    );
    app.game.step(5);
    await desk
      .locator(".radio-row")
      .filter({ hasText: "Nachforderung" })
      .click();
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
    await expect(desk.locator(".radio-conversation")).toContainText(
      "Erledigt von dir",
    );
    expect(app.db.all().get(owner)!.vehicles[1].status).toBe("ready");
    await page.screenshot({
      path: info.outputPath("radio-nachforderung-1366.png"),
      fullPage: true,
    });
    await desk
      .getByRole("button", {
        name: "Einsatz öffnen / weitere Kräfte disponieren",
      })
      .click();
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
test("Priorität, Kanal, Suche, eigene Übernahmen, Freigabe und leere Filter sind benutzbar", async ({
  page,
}, info) => {
  const s = app.db.all().get(owner)!,
    m = s.missions[0];
  request(
    s,
    m,
    s.vehicles[1].id,
    "arrival",
    "Erste Erkundung abgeschlossen.",
    "NOTFALL",
  );
  // Public FMS channel labels are existing per-vehicle data.
  s.desk.fleet[s.vehicles[1].id].channel = "Feuerwehr Süd";
  app.db.save(owner, s);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);
  await radio(page);
  const desk = page.locator(".radio-workspace"),
    rows = desk.locator(".radio-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("NOTFALL");
  await expect(rows.first()).toContainText("FMS 0");
  await desk
    .getByLabel("Funkkanal", { exact: true })
    .selectOption("Feuerwehr Süd");
  await expect(rows).toHaveCount(1);
  await desk
    .getByRole("button", { name: "Sprechwunsch übernehmen", exact: true })
    .click();
  await desk.getByLabel("Bearbeitungsstand").selectOption("mine");
  await expect(rows).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("radio-arbeitsplatz-1920.png"),
    fullPage: true,
  });
  await desk
    .getByRole("button", { name: "Bearbeitung freigeben", exact: true })
    .click();
  await expect(rows).toHaveCount(0);
  await desk.getByLabel("Bearbeitungsstand").selectOption("free");
  await expect(rows).toHaveCount(1);
  await desk.getByLabel("Sprechwunsch suchen").fill("kein-passender-funk");
  await expect(desk).toContainText("Keine Sprechwünsche für diese Auswahl.");
  await expect(rows).toHaveCount(0);
  await desk.getByLabel("Sprechwunsch suchen").clear();
  await expect(rows).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
