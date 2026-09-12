import { openPanel } from "./ui-navigation";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Config } from "../../src/server/config";
import type { startServer } from "../../src/server/index";
import { vt } from "../../src/shared/catalog";
import { fmsDefaults } from "../../src/simulation/fms";
import { phaseFixture } from "../dispatch-fixture";
import { interviewUI } from "./desk-helpers";
import { createBrowserServer, listenBrowserServer } from "./server-helper";
import { expect, test } from "./test";

const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, config: Config, owner: string;
const password = "Menu-form-test-password-123!";
const openForm = openPanel;
test.beforeEach(async ({ page }) => {
  config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-menu-forms-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  owner = await app.auth.create(
    "forms-user",
    password,
    "Formularprüfung",
    "Nord",
  );
  app.db.save(owner, phaseFixture(owner));
  await page.goto(config.publicUrl);
  await page.getByLabel("Benutzername", { exact: true }).fill("forms-user");
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
});
test.afterEach(async () => {
  await app.close();
  await rm(config.dataDir, { recursive: true, force: true });
});

test("AAO schützt Entwürfe, behält Fehler und sendet bei Doppelklick nur einen Auftrag", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openForm(page, "AAO verwalten");
  const name = page.getByLabel("AAO-Name", { exact: true });
  await name.fill("Lokaler ungespeicherter Entwurf");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Ungespeicherte Änderungen" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Weiter bearbeiten", exact: true })
    .click();
  await expect(name).toHaveValue("Lokaler ungespeicherter Entwurf");
  expect(app.db.all().get(owner)!.desk.aaos).toHaveLength(0);
  await page.getByRole("button", { name: "Neue AAO", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Änderungen verwerfen", exact: true })
    .click();
  await expect(name).toHaveValue("Neue AAO");
  await name.fill("Persistierte Test-AAO");

  let rejected = false,
    sent = 0,
    release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/action", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action?.type !== "aao-save") return route.continue();
    sent++;
    if (!rejected) {
      rejected = true;
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Testablehnung: Entwurf bleibt erhalten.",
        }),
      });
    }
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  const save = page.getByRole("button", { name: "AAO speichern", exact: true });
  await save.click();
  await expect(page.locator(".aao-editor [role=alert]")).toContainText(
    "Testablehnung",
  );
  await expect(name).toHaveValue("Persistierte Test-AAO");
  expect(app.db.all().get(owner)!.desk.aaos).toHaveLength(0);
  const bounds = await save.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
    { clickCount: 2, delay: 0 },
  );
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  release();
  await expect(save).toBeEnabled();
  await expect.poll(() => app.db.all().get(owner)!.desk.aaos.length).toBe(1);
  expect(sent).toBe(2); // one rejected attempt plus exactly one transmitted retry
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await openForm(page, "AAO verwalten");
  await page
    .getByRole("button", { name: "Persistierte Test-AAO", exact: true })
    .click();
  await expect(name).toHaveValue("Persistierte Test-AAO");
  expect(errors).toEqual([]);
});

test("FMS-Definitionen und Alarmprofile übernehmen, verwerfen, Standard laden und nach Serverneustart erhalten", async ({
  page,
}) => {
  await openForm(page, "FMS & Alarmierungsprofile");
  await page
    .getByRole("tab", { name: "Statusdefinitionen", exact: true })
    .click();
  const label = page.getByLabel("FMS 2", { exact: true });
  await label.fill("An der Wache / Betriebsbereit");
  await page
    .getByLabel("Profil für Organisation", { exact: true })
    .selectOption("Feuerwehr");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Weiter bearbeiten", exact: true })
    .click();
  await expect(label).toHaveValue("An der Wache / Betriebsbereit");
  await page
    .getByRole("button", { name: "FMS-Profil speichern", exact: true })
    .click();
  await expect
    .poll(() => app.db.all().get(owner)!.desk.definitions.Alle?.[2])
    .toBe("An der Wache / Betriebsbereit");
  await page
    .getByRole("button", { name: "FMS-Standard wiederherstellen", exact: true })
    .click();
  await expect(label).toHaveValue(fmsDefaults[2]);
  expect(app.db.all().get(owner)!.desk.definitions.Alle![2]).toBe(
    "An der Wache / Betriebsbereit",
  );
  await page
    .locator("#fms-panel-definitions > fieldset")
    .getByRole("button", { name: "Änderungen verwerfen", exact: true })
    .click();
  await expect(label).toHaveValue("An der Wache / Betriebsbereit");
  await page
    .getByRole("tab", { name: "Alarmierungsprofile", exact: true })
    .click();
  const profile = page.locator(".alarm-profile-row").first();
  await profile.locator("select").selectOption("siren");
  expect(
    app.db.all().get(owner)!.desk.alarms[
      app.db.all().get(owner)!.buildings[0].id
    ],
  ).not.toBe("siren");
  await profile
    .getByRole("button", { name: "Alarmierungsprofil übernehmen", exact: true })
    .click();
  const home = app.db.all().get(owner)!.buildings[0].id;
  await expect
    .poll(() => app.db.all().get(owner)!.desk.alarms[home])
    .toBe("siren");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await app.close();
  app = await createBrowserServer(compiled.startServer, config);
  await app.listen();
  await page.reload();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await openForm(page, "FMS & Alarmierungsprofile");
  await page
    .getByRole("tab", { name: "Statusdefinitionen", exact: true })
    .click();
  await expect(label).toHaveValue("An der Wache / Betriebsbereit");
  await page
    .getByRole("tab", { name: "Alarmierungsprofile", exact: true })
    .click();
  await expect(profile.locator("select")).toHaveValue("siren");
});

test("abgewiesene FMS-Korrektur behält Begründung, echte FMS6-Korrektur wird einmal gespeichert", async ({
  page,
}) => {
  await openForm(page, "FMS & Alarmierungsprofile");
  // FMS definitions are configurable, so code 7 is not itself invalid. Inject a
  // temporary HTTP rejection to verify the form's failure path independently.
  let rejected = false;
  await page.route("**/api/action", async (route) => {
    if (route.request().postDataJSON().action?.type === "fms" && !rejected) {
      rejected = true;
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Testkonflikt: Statuskorrektur erneut prüfen.",
        }),
      });
    }
    return route.continue();
  });
  const row = page.locator(".fms-vehicle").first(),
    id = app.db.all().get(owner)!.vehicles[0].id;
  await row.getByLabel("FMS korrigieren", { exact: true }).selectOption("7");
  await row
    .getByLabel("Begründung", { exact: true })
    .fill("Prüfung ohne tatsächlichen Patienten");
  await row
    .getByRole("button", { name: "Statuskorrektur bestätigen", exact: true })
    .click();
  await expect(row.getByRole("alert")).toBeVisible();
  await expect(row.getByLabel("Begründung", { exact: true })).toHaveValue(
    "Prüfung ohne tatsächlichen Patienten",
  );
  expect(app.db.all().get(owner)!.desk.fleet[id]?.code).not.toBe(7);
  await row.getByLabel("FMS korrigieren", { exact: true }).selectOption("6");
  await row
    .getByLabel("Begründung", { exact: true })
    .fill("Betriebliche Abmeldung");
  await row
    .getByRole("button", { name: "Statuskorrektur bestätigen", exact: true })
    .click();
  await expect
    .poll(() => app.db.all().get(owner)!.desk.fleet[id]?.code)
    .toBe(6);
  await expect(row.getByLabel("Begründung", { exact: true })).toHaveValue("");
  expect(
    app.db
      .all()
      .get(owner)!
      .desk.fleet[id].history.filter((h) =>
        h.text.includes("Betriebliche Abmeldung"),
      ),
  ).toHaveLength(1);
});

test("Disposition behält Auswahl bei Navigation und Serverfehler; erfolgreicher Alarm löscht nur den übertragenen Entwurf", async ({
  page,
}) => {
  await openPanel(page, "Notrufarbeitsplatz");
  await interviewUI(page, app);
  const selected = page.locator(".dispatch-list input").first();
  await selected.check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Schließen", exact: true })
    .click();
  await expect(
    page.getByRole("alertdialog", { name: "Ungespeicherte Änderungen" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Weiter bearbeiten", exact: true })
    .click();
  await expect(selected).toBeChecked();
  let failed = false;
  await page.route("**/api/action", async (route) => {
    if (route.request().postDataJSON().action?.type === "dispatch" && !failed) {
      failed = true;
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Testkonflikt: Fahrzeugauswahl erneut prüfen.",
        }),
      });
    }
    return route.continue();
  });
  await page
    .getByRole("button", { name: "Alarmieren (1)", exact: true })
    .click();
  await expect(page.locator(".dispatch-area > [role=alert]")).toContainText(
    "Testkonflikt",
  );
  await expect(selected).toBeChecked();
  expect(app.db.all().get(owner)!.vehicles[0].status).toBe("ready");
  await page
    .getByRole("button", { name: "Alarmieren (1)", exact: true })
    .click();
  await expect
    .poll(() => app.db.all().get(owner)!.vehicles[0].status)
    .toBe("alarmed");
  await expect(selected).not.toBeChecked();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Schließen", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    app.db
      .all()
      .get(owner)!
      .missions[0].control!.events.filter((e) => e.type === "ALARM_STARTED"),
  ).toHaveLength(1);
});

test("Wachenreiter bewahrt Betriebsentwurf und Kaufabsicht; Kauf-ACK sperrt Abbruch und Doppelbestellung", async ({
  page,
}) => {
  await openPanel(page, "Standorte verwalten");
  await page.locator(".station-card").first().click();
  await page.locator(".org-settings > summary").first().click();
  await page
    .getByLabel("Ausrück-Grundzeit in Sekunden", { exact: true })
    .fill("45");
  await page
    .getByRole("tab", { name: "Fahrzeuge & Vergleich", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Weiter bearbeiten", exact: true })
    .click();
  await expect(
    page.getByLabel("Ausrück-Grundzeit in Sekunden", { exact: true }),
  ).toHaveValue("45");
  await page
    .getByRole("tab", { name: "Fahrzeuge & Vergleich", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Änderungen verwerfen", exact: true })
    .click();
  expect(app.db.all().get(owner)!.buildings[0].organization!.turnout).toBe(30);
  await page
    .locator('[data-vehicle-type=\"tsf\"]')
    .getByRole("button", { name: "Kauf prüfen", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Übersicht & Betrieb", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Weiter bearbeiten", exact: true })
    .click();
  const review = page.getByRole("region", {
    name: "Fahrzeugkauf bestätigen",
    exact: true,
  });
  await expect(review).toBeVisible();
  const before = app.db.all().get(owner)!,
    count = before.vehicles.length,
    money = before.money;
  let purchases = 0,
    release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/action", async (route) => {
    if (route.request().postDataJSON().action?.type !== "buy")
      return route.continue();
    purchases++;
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  const buy = review.getByRole("button", {
    name: "Kauf verbindlich bestätigen",
    exact: true,
  });
  await buy.scrollIntoViewIfNeeded();
  const box = await buy.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, {
    clickCount: 2,
    delay: 0,
  });
  await expect(
    review.getByRole("button", { name: "Abbrechen", exact: true }),
  ).toBeDisabled();
  release();
  await expect(review).toHaveCount(0);
  const after = app.db.all().get(owner)!;
  expect(purchases).toBe(1);
  expect(after.vehicles).toHaveLength(count + 1);
  expect(after.money).toBe(money - vt("tsf").price);
  expect(
    after.people.filter((p) => p.vehicle === after.vehicles.at(-1)!.id),
  ).toHaveLength(vt("tsf").crew);
});

test("Fuhrpark verwirft Namensentwurf wirklich vor Filterwechsel und behält gespeicherten Namen", async ({
  page,
}) => {
  await openPanel(page, "Fuhrpark");
  const row = page.locator(".fleet-card").first(),
    original = app.db.all().get(owner)!.vehicles[0].name;
  await row.getByRole("button", { name: "Name", exact: true }).click();
  await row
    .getByLabel("Neuer Fahrzeugname", { exact: true })
    .fill("Unfertiger Name");
  await page.getByLabel("Fahrzeug suchen", { exact: true }).fill("HLF");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Weiter bearbeiten", exact: true })
    .click();
  await expect(
    row.getByLabel("Neuer Fahrzeugname", { exact: true }),
  ).toHaveValue("Unfertiger Name");
  await page.getByLabel("Fahrzeug suchen", { exact: true }).fill("HLF");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Änderungen verwerfen", exact: true })
    .click();
  await expect(page.locator(".fleet-card")).toHaveCount(1);
  await expect(
    row.getByLabel("Neuer Fahrzeugname", { exact: true }),
  ).toHaveCount(0);
  expect(app.db.all().get(owner)!.vehicles[0].name).toBe(original);
  await row.getByRole("button", { name: "Name", exact: true }).click();
  await expect(
    row.getByLabel("Neuer Fahrzeugname", { exact: true }),
  ).toHaveValue(original);
  await row.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await row
    .getByRole("button", { name: `Favorit ${original}`, exact: true })
    .click();
  await expect
    .poll(() => app.db.all().get(owner)!.vehicles[0].favorite)
    .toBe(true);
});
