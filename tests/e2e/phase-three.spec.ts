import { openPanel, showIncidents } from "./ui-navigation";
import { listenBrowserServer } from "./server-helper";
import { test, expect, type Page } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import type { Config } from "../../server/config";
import { organizationFixture, addAmbulance } from "../phase-three-fixture";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
test.use({ actionTimeout: 15000 });
const password = "Phase-three-browser-password-123!";
let app: ReturnType<typeof startServer>,
  config: Config,
  owner: string,
  helper: string;
test.beforeEach(async () => {
  const port = 0;
  config = {
    host: "127.0.0.1",
    port,
    publicUrl: `http://127.0.0.1:${port}`,
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-org-browser-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  owner = await app.auth.create("north", password, "Nord", "Nord");
  helper = await app.auth.create("south", password, "Süd", "Süd");
  const a = organizationFixture(owner),
    b = organizationFixture(helper, "field", "south");
  a.player.station = "Nord";
  b.player.station = "Süd";
  app.db.save(owner, a);
  app.db.save(helper, b);
});
test.afterEach(async () => {
  await app.close();
});
async function enter(page: Page, username = "north") {
  await page.goto(config.publicUrl);
  await page.getByLabel("Benutzername", { exact: true }).fill(username);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page
    .getByRole("button", { name: "Spielen", exact: true })
    .click();
}
test("FF-Wache und Personal konfigurieren, Reserve freigeben und individuelle Ausrückbereitschaft verfolgen", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await page.getByRole("button", { name: "Wachen", exact: true }).click();
  await page.getByRole("dialog").locator(".station-card").first().click();
  await page
    .getByText("Organisation, Ausrücken und Reserve", { exact: true })
    .click();
  await page.getByLabel("Organisation", { exact: true }).selectOption("ff");
  await page.getByLabel("Besatzungsregel").selectOption("minimum");
  await page.getByRole("button", { name: "Wachenprofil speichern" }).click();
  await expect
    .poll(() => app.db.all().get(owner)!.buildings[0].organization?.kind)
    .toBe("ff");
  await page.locator(".person-settings summary").first().click();
  const person = page.locator(".person-settings").first();
  await person.getByLabel("Name", { exact: true }).fill("Freiwillige Anna");
  await person.getByLabel("Bereitschaft auf der Wache").check();
  await person
    .getByRole("button", { name: "Personalprofil speichern" })
    .click();
  await expect
    .poll(() => app.db.all().get(owner)!.people[0].duty?.name)
    .toBe("Freiwillige Anna");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Fuhrpark", exact: true }).click();
  const fleet = page.locator(".fleet-card").first();
  const reserve = fleet.getByLabel("Als Reserve zurückhalten");
  // This controlled input changes only after the server confirms the action.
  // check()/uncheck() require the DOM state to change synchronously with a click.
  await expect(reserve).not.toBeChecked();
  await reserve.click();
  await expect(reserve).toBeChecked();
  await expect(fleet).toContainText("Als Reserve zurückgehalten");
  await reserve.click();
  await expect(reserve).not.toBeChecked();
  await expect(fleet).toContainText("Disposition freigegeben");
  await expect
    .poll(() => app.db.all().get(owner)!.vehicles[0].reserve)
    .toBe(false);
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.locator(".mission-card").first().click();
  await page.locator(".dispatch-list input").first().check();
  await page
    .getByRole("button", { name: "Alarmieren (1)", exact: true })
    .click();
  await expect
    .poll(() => app.db.all().get(owner)!.vehicles[0].status)
    .toBe("alarmed");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Fuhrpark", exact: true }).click();
  await expect(page.locator(".vehicle-staffing").first()).toContainText(
    "Besatzung auf dem Weg",
  );
  await page.screenshot({
    path: info.outputPath("phase3-ff-besatzung.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("zwei Browser handeln eine Teilannahme aus, zeigen nur zugesagte Kräfte und setzen Hilfe nach Neustart fort", async ({
  page,
  browser,
}, info) => {
  const context = await browser.newContext(),
    south = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  south.on("pageerror", (e) => errors.push(e.message));
  try {
    await enter(page);
    await enter(south, "south");
    await openPanel(page, "Freunde");
    await openPanel(south, "Freunde");
    await page.getByText("Neue Unterstützungsanfrage", { exact: true }).click();
    await page
      .getByLabel("Nachbarleitstelle", { exact: true })
      .selectOption(helper);
    await page
      .getByLabel("Eigener Einsatz", { exact: true })
      .selectOption(app.db.all().get(owner)!.missions[0].id);
    for (const type of ["hlf", "tlf"]) {
      await page.getByLabel("Gewünschter Fahrzeugtyp").selectOption(type);
      await page
        .getByRole("button", { name: "Fahrzeug zur Anforderung hinzufügen" })
        .click();
    }
    await page
      .getByLabel("Anfragetext")
      .fill("Flächenbrand: HLF und TLF zur Unterstützung benötigt.");
    await page
      .getByRole("button", { name: "Entwurf anlegen", exact: true })
      .click();
    await expect(page.locator(".aid-card")).toContainText("Entwurf");
    await expect(south.locator(".aid-card")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Anfrage verbindlich senden" })
      .click();
    await expect(south.locator(".aid-card")).toHaveCount(1);
    await south.getByLabel(/^Nachricht /).fill("HLF sofort, TLF folgt.");
    await south.getByRole("button", { name: "Nachricht übermitteln" }).click();
    await expect(page.locator(".aid-messages")).toContainText(
      "HLF sofort, TLF folgt.",
    );
    await south.locator(".aid-vehicles input").first().check();
    await south
      .getByRole("button", { name: "Ausgewählte Kräfte alarmieren" })
      .click();
    await expect(page.locator(".aid-card")).toContainText("1 / 2 zugesagt");
    expect(
      app.game.view(owner, new Set()).network.friends[0].vehicles,
    ).toHaveLength(1);
    await south.locator(".aid-vehicles input").first().check();
    await south
      .getByRole("button", { name: "Ausgewählte Kräfte alarmieren" })
      .click();
    await expect(page.locator(".aid-card")).toContainText("2 / 2 zugesagt");
    await page.locator(".aid-card").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath("phase3-nachbarhilfe.png"),
      fullPage: true,
    });
    await context.close();
    await app.close();
    app = compiled.startServer(config);
    await app.listen();
    await page.reload();
    await page
      .getByRole("button", { name: "Spielen", exact: true })
      .click();
    app.game.step(120);
    await page.locator(".mission-card").first().click();
    await page
      .getByRole("button", { name: "Lagemeldung aufnehmen", exact: true })
      .click();
    await expect(
      page.getByText("HLF 20 / 1 · Nachbarleitstelle", { exact: true }),
    ).toBeVisible();
    const id = app.db.all().get(owner)!.aid[0].mission;
    for (
      let n = 0;
      n < 40 &&
      app.db
        .all()
        .get(owner)!
        .missions.some((m) => m.id === id);
      n++
    )
      app.game.step(30);
    expect(
      app.db
        .all()
        .get(owner)!
        .archive.some((m) => m.id === id),
    ).toBe(true);
    await page.getByRole("button", { name: "Schließen", exact: true }).click();
    await openPanel(page, "Freunde");
    await page.getByLabel("Abgeschlossene Anfragen anzeigen").check();
    await expect(page.locator(".aid-card")).toContainText("Abgeschlossen");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
test("Organisationsaufträge und Krankenhauswahl bleiben nach Wiederverbindung wirksam", async ({
  page,
}, info) => {
  const s = organizationFixture(owner, "sick"),
    ambulance = addAmbulance(s),
    m = s.missions[0];
  m.control!.briefed = true;
  app.db.save(owner, s);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await showIncidents(page);
  await page.locator(".mission-card").first().click();
  await expect(page.getByLabel("Organisationsaufträge")).toContainText(
    "Sichtung und Versorgung",
  );
  await page.getByRole("button", { name: "Beauftragen", exact: true }).click();
  await page.getByLabel("Bevorzugtes Krankenhaus").selectOption("public");
  await page
    .locator(".dispatch-list label")
    .filter({ hasText: "RTW" })
    .locator("input")
    .check();
  await page
    .getByRole("button", { name: "Alarmieren (1)", exact: true })
    .click();
  await expect
    .poll(
      () =>
        app.db
          .all()
          .get(owner)!
          .vehicles.find((v) => v.id === ambulance.id)!.status,
    )
    .toBe("alarmed");
  await page.reload();
  await page
    .getByRole("button", { name: "Spielen", exact: true })
    .click();
  await showIncidents(page);
  await page.locator(".mission-card").first().click();
  await expect(page.getByLabel("Bevorzugtes Krankenhaus")).toHaveValue(
    "public",
  );
  await expect(page.getByLabel("Organisationsaufträge")).toContainText(
    "Beauftragt",
  );
  await page.screenshot({
    path: info.outputPath("phase3-desktop-ems.png"),
    fullPage: true,
  });
  for (
    let n = 0;
    n < 80 &&
    app.db
      .all()
      .get(owner)!
      .missions.some((x) => x.id === m.id);
    n++
  )
    app.game.step(30);
  const done = app.db
    .all()
    .get(owner)!
    .archive.find((x) => x.id === m.id)!;
  expect(done).toBeDefined();
  expect(done.organization!.tasks[0].done).toBe(true);
  expect(done.dynamics!.patients[0].transport).toBe("delivered");
  expect(errors).toEqual([]);
});
