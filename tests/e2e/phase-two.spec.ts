import { test, expect, type Page } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import type { Config } from "../../server/config";
import { phaseFixture } from "../phase-fixture";
import { emsProfile } from "./fixtures";
import { interviewUI } from "./desk-helpers";
import { attachDynamics } from "../../src/simulation/dynamics";
import { attachIncident } from "../../src/simulation/calls";
import { breakVehicle } from "../../src/simulation/faults";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, config: Config, owner: string;
const password = "Phase-two-browser-password-123!";
test.beforeEach(async () => {
  const port = 40000 + Math.floor(Math.random() * 12000);
  config = {
    host: "127.0.0.1",
    port,
    publicUrl: `http://127.0.0.1:${port}`,
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-dynamics-browser-")),
    secure: false,
    trustedProxies: [],
  };
  app = compiled.startServer(config);
  await app.listen();
  owner = await app.auth.create("dispatcher", password, "Disponent", "Nord");
});
test.afterEach(async () => {
  await app.close();
});
async function enter(page: Page, mobile = false) {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(config.publicUrl);
  await page.getByLabel("Benutzername", { exact: true }).fill("dispatcher");
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page
    .getByRole("button", { name: "Leitstelle öffnen", exact: true })
    .click();
  if (mobile) await page.getByRole("button", { name: /Einsätze \(/ }).click();
  await page.locator(".mission-card").first().click();
}
test("dynamischer Brand, echte Fahrzeugpanne, Reparatur über Neustart, Taktik und Abschluss", async ({
  page,
}, info) => {
  const s = phaseFixture(owner),
    m = s.missions[0];
  attachDynamics(s, m);
  app.db.save(owner, s);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await expect(page.getByLabel("Dynamische Einsatzlage")).toHaveCount(0);
  await interviewUI(page, app);
  await page
    .getByLabel("Anfahrtsart", { exact: true })
    .selectOption("emergency");
  await page.locator(".dispatch-list input").first().check();
  await page
    .getByRole("button", { name: "Alarmieren (1)", exact: true })
    .click();
  await expect
    .poll(() => app.db.all().get(owner)!.vehicles[0].status)
    .toBe("alarmed");
  let saved = app.db.all().get(owner)!;
  app.game.step(saved.vehicles[0].depart - saved.time + 1);
  saved = app.db.all().get(owner)!;
  breakVehicle(saved, saved.vehicles[0], "engine");
  app.db.save(owner, saved);
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(page.locator(".fault-card")).toContainText("Motorschaden");
  await page
    .getByRole("button", { name: "Reparatur beauftragen", exact: true })
    .click();
  await expect
    .poll(() => app.db.all().get(owner)!.vehicles[0].fault!.state)
    .toBe("repairing");
  await app.close();
  app = compiled.startServer(config);
  await app.listen();
  await page.reload();
  await page
    .getByRole("button", { name: "Leitstelle öffnen", exact: true })
    .click();
  await expect(page.locator(".fault-card")).toContainText("Reparatur läuft");
  saved = app.db.all().get(owner)!;
  app.game.step(saved.vehicles[0].fault!.repairAt - saved.time + 1);
  saved = app.db.all().get(owner)!;
  app.game.step(Math.max(0, saved.vehicles[0].arrive - saved.time) + 1);
  await page.locator(".mission-card").first().click();
  await page
    .getByRole("button", { name: "Lagemeldung aufnehmen", exact: true })
    .click();
  await expect(page.getByLabel("Dynamische Einsatzlage")).toContainText(
    "Brandentwicklung",
  );
  await page
    .getByLabel("Einsatztaktik", { exact: true })
    .selectOption("defensive");
  await expect
    .poll(
      () =>
        app.db
          .all()
          .get(owner)!
          .missions.find((x) => x.id === m.id)!.dynamics!.tactic,
    )
    .toBe("defensive");
  await page
    .locator(".dispatch-list label")
    .filter({ hasText: "TLF" })
    .locator("input")
    .check();
  await page
    .getByRole("button", { name: "Alarmieren (1)", exact: true })
    .click();
  await expect
    .poll(() => app.db.all().get(owner)!.vehicles[1].status)
    .toBe("alarmed");
  await page.locator(".dynamics-heading").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("phase2-dynamische-lage.png"),
    fullPage: true,
  });
  for (
    let i = 0;
    i < 20 &&
    app.db
      .all()
      .get(owner)!
      .missions.some((x) => x.id === m.id);
    i++
  )
    app.game.step(30);
  await expect
    .poll(() =>
      app.db
        .all()
        .get(owner)!
        .archive.some((x) => x.id === m.id),
    )
    .toBe(true);
  const archived = app.db
    .all()
    .get(owner)!
    .archive.find((x) => x.id === m.id)!;
  expect(archived.dynamics!.hazards.every((h) => h.resolved)).toBe(true);
  expect(
    archived.control!.events.filter((e) => e.type === "REPAIR_ORDERED"),
  ).toHaveLength(1);
  expect(errors).toEqual([]);
});
test("mobile Patientenversorgung mit wirksamem Schwerpunkt, Wiederverbindung und Krankenhausübergabe", async ({
  page,
}, info) => {
  const s = emsProfile("Patient"),
    m = s.missions[0];
  s.player.id = owner;
  s.buildings.forEach((b) => (b.owner = owner));
  s.vehicles.forEach((v) => (v.owner = owner));
  s.seed = 124;
  attachIncident(s, m);
  attachDynamics(s, m);
  s.missionWait = 210;
  app.db.save(owner, s);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page, true);
  await interviewUI(page, app);
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
          .vehicles.find((v) => v.type === "rtw")!.status,
    )
    .toBe("alarmed");
  let saved = app.db.all().get(owner)!,
    rtw = saved.vehicles.find((v) => v.type === "rtw")!;
  app.game.step(rtw.arrive - saved.time + 1);
  await page
    .getByRole("button", { name: "Lagemeldung aufnehmen", exact: true })
    .click();
  await expect(page.locator(".patient-card")).toContainText("SpO₂");
  await page.getByLabel(/^Versorgung Patient/).selectOption("oxygen");
  await page
    .getByRole("button", { name: "Versorgung priorisieren", exact: true })
    .click();
  await expect
    .poll(
      () =>
        app.db
          .all()
          .get(owner)!
          .missions.find((x) => x.id === m.id)!.dynamics!.patients[0].priority,
    )
    .toBe("urgent");
  await page.locator(".patient-card header").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("phase2-patient-mobil.png"),
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Leitstelle öffnen", exact: true })
    .click();
  await page.getByRole("button", { name: /Einsätze \(/ }).click();
  await page.locator(".mission-card").first().click();
  await expect(page.getByLabel(/^Versorgung Patient/)).toHaveValue("oxygen");
  for (
    let i = 0;
    i < 80 &&
    app.db
      .all()
      .get(owner)!
      .missions.some((x) => x.id === m.id);
    i++
  )
    app.game.step(30);
  saved = app.db.all().get(owner)!;
  rtw = saved.vehicles.find((v) => v.type === "rtw")!;
  const archived = saved.archive.find((x) => x.id === m.id)!;
  expect(archived).toBeTruthy();
  expect(archived.dynamics!.patients[0].transport).toBe("delivered");
  expect(rtw.patients).toBe(0);
  expect(errors).toEqual([]);
});
