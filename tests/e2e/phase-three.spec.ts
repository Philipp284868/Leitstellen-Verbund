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
import { phaseFixture } from "../phase-fixture";
import { interviewUI } from "./desk-helpers";
import { newStationProfile, personDuty } from "../../src/simulation/staffing";
import { forceVolunteerAvailability } from "../../src/simulation/volunteers";
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
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
}
test("FF-Notruf mit privater NPC-Simulation, Kartenanreise, Nachforderung, Neustart und Rückkehr", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const seed = phaseFixture(owner);
  seed.buildings[0].organization = newStationProfile("fire");
  for (const [index, p] of seed.people.entries()) {
    p.vehicle = null;
    p.duty = {
      ...personDuty(seed, p),
      homeNode: index + 1,
      workNode: index + 1,
    };
  }
  forceVolunteerAvailability(seed, true, 7200);
  app.db.save(owner, seed);
  await enter(page);
  await page.getByRole("button", { name: "Wachen", exact: true }).click();
  await page.getByRole("dialog").locator(".station-card").first().click();
  await page.locator(".org-settings > summary").click();
  await expect(page.getByRole("dialog")).toContainText("Freiwillige Feuerwehr");
  await expect(page.getByLabel("Bereitschaft auf der Wache")).toHaveCount(0);
  await expect(page.getByLabel("Wohnort", { exact: true })).toHaveCount(0);
  await expect(page.locator(".person-settings")).toHaveCount(0);
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Fuhrpark", exact: true }).click();
  const fleet = page.locator(".fleet-card").first(),
    reserve = fleet.getByLabel("Als Reserve vormerken (nur Hinweis)");
  await fleet
    .getByText("Besatzung & Einsatzbereitschaft", { exact: true })
    .click();
  await reserve.click();
  await expect(reserve).toBeChecked();
  await expect(fleet).toContainText("Alarmierung bleibt möglich");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await showIncidents(page);
  await showIncidents(page);
  await page.locator(".mission-card").first().click();
  await interviewUI(page, app);
  await page.locator(".dispatch-list input").first().check();
  await page
    .getByRole("button", { name: "Alarmieren (1)", exact: true })
    .click();
  await expect
    .poll(() => app.db.all().get(owner)!.vehicles[0].status)
    .toBe("alarmed");
  let current = app.db.all().get(owner)!;
  const first = current.vehicles[0],
    mission = current.missions[0].id;
  expect(first.turnout!.arrivals).toHaveLength(6);
  expect(
    new Set(first.turnout!.arrivals.map((a) => a.at)).size,
  ).toBeGreaterThan(1);
  const moving = first.turnout!.arrivals.reduce((longest, next) =>
    next.at - next.depart! > longest.at - longest.depart! ? next : longest,
  );
  app.game.step(Math.max(0, moving.depart! - current.time + 2));
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(page.getByTestId("map-volunteer").first()).toBeVisible();
  await page.screenshot({
    path: info.outputPath("phase3-ff-anreise.png"),
    fullPage: true,
  });
  await app.close();
  app = compiled.startServer(config);
  await app.listen();
  await page.reload();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await page.getByRole("button", { name: "Fuhrpark", exact: true }).click();
  await page
    .getByText("Besatzung & Einsatzbereitschaft", { exact: true })
    .first()
    .click();
  await expect(page.locator(".vehicle-staffing").first()).toContainText(
    "Besatzung auf dem Weg",
  );
  expect(
    app.game.view(owner, new Set()).save.people.every((p) => !p.duty),
  ).toBe(true);
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await showIncidents(page);
  await showIncidents(page);
  await page.locator(".mission-card").first().click();
  current = app.db.all().get(owner)!;
  app.game.step(Math.max(0, current.vehicles[0].depart - current.time) + 1);
  await expect(page.locator(".incident-desk")).toContainText("FMS 3");
  current = app.db.all().get(owner)!;
  app.game.step(Math.max(0, current.vehicles[0].arrive - current.time) + 1);
  await page
    .getByRole("button", { name: "Lagemeldung aufnehmen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nachforderung bearbeiten", exact: true })
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
  current = app.db.all().get(owner)!;
  const all = current.vehicles.flatMap(
    (v) => v.turnout?.arrivals.map((a) => a.person) ?? [],
  );
  expect(new Set(all).size).toBe(all.length);
  app.game.step(current.vehicles[1].arrive - current.time + 70);
  await expect(
    page.getByText("Dieser Einsatz ist abgeschlossen.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".incident-history")).toContainText(
    "Einsatz abgeschlossen",
  );
  current = app.db.all().get(owner)!;
  expect(current.archive.some((m) => m.id === mission)).toBe(true);
  const returning = current.vehicles.filter((v) => v.status === "return");
  expect(returning.length).toBeGreaterThan(0);
  const view = app.game.view(owner, new Set()).save;
  expect(
    returning.every((v) => {
      const availability = view.vehicles.find(
        (x) => x.id === v.id,
      )!.availability!;
      return (
        availability.alarmable &&
        availability.dispatchable &&
        availability.crewPresent >= availability.crewRequired
      );
    }),
  ).toBe(true);
  app.game.step(Math.max(...returning.map((v) => v.arrive)) - current.time + 1);
  expect(
    app.db
      .all()
      .get(owner)!
      .vehicles.every((v) => v.status === "ready"),
  ).toBe(true);
  expect(
    app.db
      .all()
      .get(owner)!
      .people.every((p) => p.vehicle === null),
  ).toBe(true);
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
    await page.getByRole("button", { name: "Spielen", exact: true }).click();
    app.game.step(120);
    await showIncidents(page);
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
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await showIncidents(page);
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
  let current = app.db.all().get(owner)!;
  for (
    let n = 0;
    n < 240 &&
    current.vehicles.find((v) => v.id === ambulance.id)!.status !== "transport";
    n++
  ) {
    app.game.step(5);
    current = app.db.all().get(owner)!;
  }
  const transporting = current.vehicles.find((v) => v.id === ambulance.id)!;
  expect(transporting.status).toBe("transport");
  expect(transporting.patients).toBeGreaterThan(0);
  app.game.step(transporting.arrive - current.time + 0.05);
  current = app.db.all().get(owner)!;
  const returning = current.vehicles.find((v) => v.id === ambulance.id)!;
  expect(returning.status).toBe("return");
  expect(current.desk.fleet[returning.id].code).toBe(6);
  expect(
    app.game
      .view(owner, new Set())
      .save.vehicles.find((v) => v.id === ambulance.id)!.availability,
  ).toMatchObject({
    state: "POST_INCIDENT",
    alarmable: false,
    reason: "Desinfektion nach Rückkehr erforderlich.",
  });
  app.game.step(returning.arrive - current.time + 0.05);
  current = app.db.all().get(owner)!;
  for (
    let n = 0;
    n < 240 &&
    current.vehicles.find((v) => v.id === ambulance.id)!.status === "return";
    n++
  ) {
    app.game.step(5);
    current = app.db.all().get(owner)!;
  }
  const cleaning = current.vehicles.find((v) => v.id === ambulance.id)!;
  expect(cleaning.status).toBe("ready");
  expect(cleaning.postIncident?.startedAt).toBeDefined();
  expect(cleaning.postIncident?.tasks[0].kind).toBe("disinfection");
  const savedPost = structuredClone(cleaning.postIncident!);
  expect(
    app.game
      .view(owner, new Set())
      .save.vehicles.find((v) => v.id === ambulance.id)!.availability,
  ).toMatchObject({
    state: "POST_INCIDENT",
    alarmable: false,
    reason: "Desinfektion läuft.",
  });
  await app.close();
  app = compiled.startServer(config);
  await app.listen();
  const restored = app.db
    .all()
    .get(owner)!
    .vehicles.find((v) => v.id === ambulance.id)!;
  expect(restored.postIncident).toEqual(savedPost);
  await page.reload();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await page.getByRole("button", { name: "Fuhrpark", exact: true }).click();
  await expect(
    page.locator(".fleet-card").filter({ hasText: "RTW" }).first(),
  ).toContainText("Desinfektion läuft");
  await page.screenshot({
    path: info.outputPath("phase3-rd-nachbereitung.png"),
    fullPage: true,
  });
  current = app.db.all().get(owner)!;
  const remaining =
    savedPost.until! -
    current.time +
    savedPost.tasks
      .slice(savedPost.current + 1)
      .reduce((sum, task) => sum + task.seconds, 0);
  app.game.step(Math.max(0, remaining) + 1);
  await expect(
    page.locator(".fleet-card").filter({ hasText: "RTW" }).first(),
  ).toContainText("Vollständig einsatzbereit");
  const final = app.db.all().get(owner)!,
    done = final.archive.find((x) => x.id === m.id)!;
  expect(done).toBeDefined();
  expect(done.organization!.tasks[0].done).toBe(true);
  expect(done.dynamics!.patients[0].transport).toBe("delivered");
  expect(
    final.vehicles.find((v) => v.id === ambulance.id)!.postIncident,
  ).toBeUndefined();
  expect(final.desk.fleet[ambulance.id].code).toBe(2);
  expect(done.control!.events.some((e) => e.type === "VEHICLE_READY")).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
