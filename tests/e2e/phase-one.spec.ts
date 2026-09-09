import { openPanel, showIncidents } from "./ui-navigation";
import { listenBrowserServer } from "./server-helper";
import { test, expect } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import type { Config } from "../../server/config";
import { phaseFixture } from "../phase-fixture";
import { interviewUI } from "./desk-helpers";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, config: Config, owner: string;
const password = "Phase-browser-password-123!";
test.beforeEach(async () => {
  const port = 0;
  config = {
    host: "127.0.0.1",
    port,
    publicUrl: `http://127.0.0.1:${port}`,
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-desk-browser-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  owner = await app.auth.create("dispatcher", password, "Disponent", "Nord");
  app.db.save(owner, phaseFixture(owner));
});
test.afterEach(async () => {
  await app.close();
});
for (const manual of [false, true])
  test(
    manual
      ? "Freie Disposition führt auf schmalem Bildschirm vom Notruf bis zum Archiv"
      : "Notruf, gespeicherte AAO, HLF, FMS, Neustart, Lagemeldung, Nachforderung und Abschluss",
    async ({ page }, info) => {
      if (manual) await page.setViewportSize({ width: 1366, height: 768 });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(config.publicUrl);
      await page.getByLabel("Benutzername", { exact: true }).fill("dispatcher");
      await page.getByLabel("Passwort", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Anmelden", exact: true }).click();
      await page.getByRole("button", { name: "Spielen", exact: true }).click();
      if (manual) await showIncidents(page);
      await expect(
        page.locator('svg.map [aria-label="Flächenbrand"]'),
      ).toHaveCount(0);
      if (!manual) {
        await openPanel(page, "AAO");
        await page
          .getByLabel("AAO-Name", { exact: true })
          .fill("Erstangriff HLF");
        await page.getByLabel("Anzahl TSF-W", { exact: true }).fill("0");
        await page.getByLabel("Anzahl HLF 20", { exact: true }).fill("1");
        await page
          .getByLabel("AAO-Alarmierungsart", { exact: true })
          .selectOption("station");
        await page
          .getByRole("button", { name: "AAO speichern", exact: true })
          .click();
        await expect
          .poll(() => app.db.all().get(owner)!.desk.aaos.length)
          .toBe(1);
        await page
          .getByRole("button", { name: "Schließen", exact: true })
          .click();
      }
      await showIncidents(page);
      await page.locator(".mission-card").first().click();
      await interviewUI(page, app);
      if (!manual) {
        await page.getByLabel("AAO auswählen").selectOption({ index: 1 });
        await page
          .getByRole("button", { name: "AAO-Vorschlag berechnen" })
          .click();
        await expect(
          page.locator(".dispatch-list input").first(),
        ).toBeChecked();
      } else await page.locator(".dispatch-list input").first().check();
      await page
        .getByRole("button", { name: "Alarmieren (1)", exact: true })
        .click();
      await expect
        .poll(() => app.db.all().get(owner)!.vehicles[0].status)
        .toBe("alarmed");
      const alarm = app.db.all().get(owner)!,
        mission = alarm.missions[0].id;
      expect(alarm.vehicles[0].depart - alarm.vehicles[0].arrive).toBeLessThan(
        0,
      );
      if (!manual) {
        await app.close();
        app = compiled.startServer(config);
        await app.listen();
        await page.reload();
        await page
          .getByRole("button", { name: "Spielen", exact: true })
          .click();
        await showIncidents(page);
        await page.locator(".mission-card").first().click();
        expect(
          app.db
            .all()
            .get(owner)!
            .missions[0].control!.events.filter(
              (e) => e.type === "ALARM_STARTED",
            ),
        ).toHaveLength(1);
      }
      let s = app.db.all().get(owner)!;
      app.game.step(Math.max(0, s.vehicles[0].depart - s.time) + 1);
      await expect(page.locator(".incident-desk")).toContainText("FMS 3");
      s = app.db.all().get(owner)!;
      app.game.step(Math.max(0, s.vehicles[0].arrive - s.time) + 1);
      await page
        .getByRole("button", { name: "Lagemeldung aufnehmen", exact: true })
        .click();
      await expect(page.locator(".dock-heading strong")).toHaveText(
        "Flächenbrand",
      );
      await expect(page.locator(".radio-queue")).toContainText(
        "Löschwasser: 2 Fähigkeitseinheiten benötigt",
      );
      await page
        .getByRole("button", { name: "Nachforderung bearbeiten", exact: true })
        .click();
      await page
        .locator(".dispatch-list label")
        .filter({ hasText: "TLF 4000" })
        .locator("input")
        .check();
      await page
        .getByLabel("Alarmierungsart", { exact: true })
        .selectOption("siren");
      await page
        .getByRole("button", { name: "Alarmieren (1)", exact: true })
        .click();
      await expect
        .poll(() => app.db.all().get(owner)!.vehicles[1].status)
        .toBe("alarmed");
      await page.screenshot({
        path: info.outputPath(
          manual ? "phase1-desktop-compact.png" : "phase1-disposition.png",
        ),
        fullPage: true,
      });
      s = app.db.all().get(owner)!;
      app.game.step(s.vehicles[1].arrive - s.time + 70);
      await expect(
        page.getByText("Dieser Einsatz ist abgeschlossen.", { exact: false }),
      ).toBeVisible();
      await expect(page.locator(".incident-history")).toContainText(
        "Einsatz abgeschlossen: Flächenbrand",
      );
      expect(
        app.db
          .all()
          .get(owner)!
          .archive.find((m) => m.id === mission)!
          .control!.events.some((e) => e.text.startsWith("FMS 4:")),
      ).toBe(true);
      await page
        .getByRole("button", { name: "Schließen", exact: true })
        .click();
      await openPanel(page, "Archiv");
      await page
        .getByRole("button", { name: "Verlauf ansehen", exact: true })
        .first()
        .click();
      await expect(page.locator(".incident-history")).toContainText(
        "Erste Erkundung",
      );
      await page.screenshot({
        path: info.outputPath("phase1-historie.png"),
        fullPage: true,
      });
      expect(errors).toEqual([]);
    },
  );

test("FMS-Definitionen, manuelle Sperre und Wachenprofil bleiben nach Reload wirksam", async ({
  page,
}) => {
  await page.goto(config.publicUrl);
  await page.getByLabel("Benutzername", { exact: true }).fill("dispatcher");
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await openPanel(page, "FMS");
  const vehicle = page.locator(".fms-vehicle").first();
  await vehicle
    .getByLabel("FMS korrigieren", { exact: true })
    .selectOption("6");
  await vehicle.getByLabel("Begründung").fill("Technische Prüfung");
  await vehicle
    .getByRole("button", { name: "Statuskorrektur bestätigen" })
    .click();
  await expect
    .poll(
      () =>
        app.db.all().get(owner)!.desk.fleet[
          app.db.all().get(owner)!.vehicles[0].id
        ].code,
    )
    .toBe(6);
  await page
    .getByLabel("Profil für Organisation", { exact: true })
    .selectOption("Feuerwehr");
  await page.getByLabel("FMS 3", { exact: true }).fill("Feuerwehr auf Anfahrt");
  await page.getByRole("button", { name: "FMS-Profil speichern" }).click();
  await expect
    .poll(() => app.db.all().get(owner)!.desk.definitions.Feuerwehr?.[3])
    .toBe("Feuerwehr auf Anfahrt");
  await page
    .getByRole("dialog")
    .getByLabel("Feuerwache 1", { exact: false })
    .selectOption("station");
  await expect
    .poll(() => Object.values(app.db.all().get(owner)!.desk.alarms)[0])
    .toBe("station");
  await page.reload();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await showIncidents(page);
  await page.locator(".mission-card").first().click();
  await interviewUI(page, app);
  await expect(page.locator(".dispatch-list input").first()).toBeDisabled();
  await expect(page.locator(".dispatch-list")).toContainText("FMS 6");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await openPanel(page, "FMS");
  await vehicle
    .getByLabel("FMS korrigieren", { exact: true })
    .selectOption("2");
  await vehicle.getByLabel("Begründung").fill("Prüfung abgeschlossen");
  await vehicle
    .getByRole("button", { name: "Statuskorrektur bestätigen" })
    .click();
  await expect
    .poll(
      () =>
        app.db.all().get(owner)!.desk.fleet[
          app.db.all().get(owner)!.vehicles[0].id
        ].code,
    )
    .toBe(2);
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await showIncidents(page);
  await page.locator(".mission-card").first().click();
  await page.locator(".dispatch-list input").first().check();
  await page
    .getByRole("button", { name: "Alarmieren (1)", exact: true })
    .click();
  await expect
    .poll(() => app.db.all().get(owner)!.vehicles[0].status)
    .toBe("alarmed");
  const s = app.db.all().get(owner)!;
  expect(s.vehicles[0].depart - s.time).toBeGreaterThan(28);
  expect(s.vehicles[0].depart - s.time).toBeLessThanOrEqual(30);
  app.game.step(31);
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await openPanel(page, "FMS");
  await expect(
    vehicle.getByLabel("FMS korrigieren", { exact: true }),
  ).toContainText("Feuerwehr auf Anfahrt");
});
