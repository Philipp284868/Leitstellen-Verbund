import { build } from "esbuild";
import { resolve } from "node:path";
import { fork } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const dir = resolve(".tools/screenshots/menu-2.21-after");
mkdirSync(dir, { recursive: true });
const outfile = resolve(".tools/menu-real-server.mjs");
await build({
  entryPoints: ["tests/fixtures/quality-real-server.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const child = fork(outfile, { stdio: ["ignore", "pipe", "pipe", "ipc"] });
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
let browser,
  page,
  sequence = 0,
  shot = 0;
const evidence = [],
  errors = [];
const ipc = (type, values = {}) =>
  new Promise((res, rej) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      child.off("message", receive);
      rej(Error("IPC timeout " + type));
    }, 45000);
    const receive = (m) => {
      if (m.id !== id) return;
      clearTimeout(timer);
      child.off("message", receive);
      if (m.error) rej(Error(m.error));
      else res(m.save);
    };
    child.on("message", receive);
    child.send({ type, id, ...values });
  });
async function snap(name) {
  const file = String(++shot).padStart(2, "0") + "-" + name + ".png";
  await page.screenshot({ path: resolve(dir, file) });
  const state = await page.locator("body").innerText();
  evidence.push({
    name,
    file,
    buttons: await page.getByRole("button").allTextContents(),
  });
  writeFileSync(
    resolve(dir, "inventory.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log("VERIFIED", name);
  writeFileSync(resolve(dir, "last-view.txt"), state);
}
async function close() {
  await page
    .getByRole("button", { name: "Schließen", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function nav(title) {
  if (await page.getByRole("dialog").count()) await close();
  if (await page.locator(".incident-dock").count()) await close();
  await page.getByRole("button", { name: "Kartensuche", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Karte durchsuchen", exact: true })
    .fill(title);
  await page
    .locator(".map-search-results")
    .getByRole("button")
    .filter({ hasText: title })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function center(zoom = 15) {
  const point = (await ipc("save")).buildings[0].pos;
  await expect(page.getByTestId("germany-map-viewport")).toHaveAttribute(
    "data-camera",
    /"zoom":/,
    { timeout: 30000 },
  );
  await page.evaluate(
    ({ point, zoom }) =>
      window.dispatchEvent(
        new CustomEvent("lv:map-focus", { detail: { point, zoom } }),
      ),
    { point, zoom },
  );
  await expect
    .poll(
      async () =>
        JSON.parse(
          await page
            .getByTestId("germany-map-viewport")
            .getAttribute("data-camera"),
        ).zoom,
    )
    .toBeCloseTo(zoom, 2);
}
const next = async (chapter) => {
  if (await page.getByRole("dialog").count()) await close();
  if (await page.locator(".incident-dock").count()) await close();
  const coach = page.getByRole("complementary", {
    name: "Persönliche Serverübung",
  });
  await expect(
    coach.getByRole("button", { name: "Weiter", exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  await coach.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(coach).toContainText("Kapitel " + chapter + " / 16");
};
async function openIncident() {
  const expand = page.getByRole("button", {
    name: "Einsatzliste ausklappen",
    exact: true,
  });
  if (await expand.isVisible()) await expand.click();
  await expect(page.locator(".mission-card").first()).toBeVisible({
    timeout: 15000,
  });
  await page.locator(".mission-card").first().click();
  await expect(page.locator(".incident-dock")).toBeVisible();
}
async function callAndDispatch() {
  await openIncident();
  const dock = page.locator(".incident-dock");
  await dock
    .getByRole("button", { name: "Notruf annehmen", exact: true })
    .click();
  for (const question of [
    "Wo genau ist der Notfall?",
    "Was ist passiert?",
    "Wie viele Personen sind betroffen?",
  ]) {
    await ipc("practice-advance", { seconds: 15 });
    await dock.getByRole("button", { name: question, exact: true }).click();
  }
  await ipc("practice-advance", { seconds: 15 });
  await dock
    .getByRole("button", {
      name: /^(Welche Gefahren erkennen Sie|Sehen Sie Flammen)/,
    })
    .click();
  await dock
    .getByRole("button", { name: "Gespräch beenden", exact: true })
    .click();
  await snap("tutorial-notruf-erfragt");
  await close();
}
async function dispatch() {
  await openIncident();
  const dock = page.locator(".incident-dock");
  await dock.getByRole("button", { name: "Fahrzeuge", exact: true }).click();
  await dock.locator('input[type="checkbox"]:enabled').first().check();
  await snap("tutorial-disposition-vorschau");
  await dock.getByRole("button", { name: /^Alarmieren \(1\)/ }).click();
  await expect(
    dock.getByRole("button", { name: /^Alarmieren \(0\)/ }),
  ).toBeVisible();
  await close();
}
async function arrivalAndRadio() {
  for (let i = 0; i < 50; i++) {
    const s = await ipc("practice-advance", { seconds: 20 });
    if (s.missions[0]?.control.firstArrival) break;
  }
  await openIncident();
  const dock = page.locator(".incident-dock");
  await dock.getByRole("button", { name: "Funk", exact: true }).click();
  await expect(
    dock.getByRole("button", { name: "Lagemeldung aufnehmen", exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  await snap("tutorial-erste-lagemeldung");
  await dock
    .getByRole("button", { name: "Lagemeldung aufnehmen", exact: true })
    .click();
  await expect(
    dock.getByRole("button", { name: "Lagemeldung aufnehmen", exact: true }),
  ).toHaveCount(0);
  const done = dock.getByRole("button", {
    name: "Sprechwunsch erledigen",
    exact: true,
  });
  if ((await done.count()) && (await done.first().isEnabled()))
    await done.first().click();
  await close();
}
async function complete() {
  for (let i = 0; i < 120; i++) {
    const s = await ipc("practice-advance", { seconds: 15 });
    if (!s.missions.length) return s;
    const radio = s.missions[0].control.radio.filter((r) => r.state === "open");
    if (radio.length) {
      await openIncident();
      const dock = page.locator(".incident-dock");
      await dock.getByRole("button", { name: "Funk", exact: true }).click();
      const report = dock.getByRole("button", {
        name: "Lagemeldung aufnehmen",
        exact: true,
      });
      if (await report.count()) await report.click();
      const done = dock.getByRole("button", {
        name: "Sprechwunsch erledigen",
        exact: true,
      });
      while (await done.count()) {
        const count = await done.count();
        await done.first().click();
        await expect(done).toHaveCount(count - 1);
      }
      await close();
    }
  }
  throw Error("Practice mission not completed in engine");
}
try {
  const info = await new Promise((res, rej) => {
    child.once("message", res);
    child.once("exit", (code) => rej(Error("Server exit " + code)));
  });
  browser = await chromium.launch({ channel: "msedge", headless: true });
  if (!process.argv.includes("--tutorial-only")) {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(info.origin);
    await snap("anmeldung");
    await page
      .getByRole("button", { name: /Registrieren|Konto erstellen/ })
      .first()
      .click();
    await snap("registrierung");
    await page
      .getByRole("button", { name: /Zur Anmeldung|Anmelden/ })
      .first()
      .click();
    await page.getByLabel("Benutzername", { exact: true }).fill("quality-main");
    await page.getByLabel("Passwort", { exact: true }).fill(info.password);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Spielen", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("germany-menu-map").first()).toHaveAttribute(
      "data-ready",
      "true",
      { timeout: 45000 },
    );
    await snap("hauptmenue");
    await page.getByRole("button", { name: "Spielen", exact: true }).click();
    await expect(page.getByTestId("germany-map-viewport")).toBeVisible();
    await expect(
      page.getByText("Deutschlandkarte wird geladen …", { exact: true }),
    ).toHaveCount(0, { timeout: 30000 });
    for (const [width, height] of [
      [1920, 1080],
      [1366, 768],
      [2560, 1440],
    ]) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
      await snap("hud-" + width);
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    for (const title of [
      "Fuhrpark",
      "Wachen verwalten",
      "Standort kaufen",
      "Leitstellenverbund und Disponenten",
      "Alarm- und Ausrückeordnung",
      "FMS und Alarmierungsprofile",
      "Spieler dieser Serverwelt",
      "Einsatzarchiv und Geldjournal",
      "Fortschritt und Erfolge",
      "Konto und Sicherheit",
      "Interaktives Tutorial",
      "Spielanleitung",
      "Einsatzkatalog",
      "Spielstände und Sicherungen",
      "Neuigkeiten",
      "Mitwirkende",
      "Datenschutz im Spiel",
      "Support",
      "Sprache",
    ]) {
      await nav(title);
      await snap("menue-" + title.replaceAll(/[^a-zA-ZäöüÄÖÜß0-9]+/g, "-"));
      if (title === "Einsatzkatalog") {
        await page
          .getByLabel("Einsatzart suchen", { exact: true })
          .fill("kein-treffer-221");
        await expect(
          page.getByRole("heading", { name: "Keine passenden Einsatzarten" }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Filter zurücksetzen", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Nächste Seite", exact: true })
          .click();
        await expect(
          page.locator(".scenario-catalog [role=status]"),
        ).toContainText("Seite 2");
        await page
          .locator(".scenario-catalog select")
          .selectOption("Rettungsdienst");
        await page.getByLabel("Nur freigeschaltete Stufen").check();
        await page
          .getByRole("navigation", { name: "Szenarien", exact: true })
          .getByRole("button")
          .last()
          .click();
        await expect(page.locator(".scenario-layout article")).toContainText(
          "Grundvergütung",
        );
        await expect(page.locator(".scenario-layout article")).toContainText(
          "€",
        );
        await snap("einsatzkatalog-filter-detail");
      }
      if (title === "Fortschritt und Erfolge") {
        await page.locator(".progression-details > summary").click();
        await page
          .getByRole("button", { name: "Weitere Freischaltungen", exact: true })
          .click();
        await expect(
          page.getByRole("navigation", { name: "Freischaltungsseiten" }),
        ).toContainText("Seite 2");
        await page
          .getByLabel("Freischaltungen suchen", { exact: true })
          .fill("kein-treffer-221");
        await expect(
          page.locator(".progression-details .empty-state"),
        ).toBeVisible();
        await page
          .getByLabel("Freischaltungen suchen", { exact: true })
          .fill("");
        await page
          .getByLabel("Freigabestatus", { exact: true })
          .selectOption("available");
        await expect(page.locator(".progression-details ol")).toContainText(
          "€",
        );
        await snap("fortschritt-euro-filter");
      }
      if (title === "FMS und Alarmierungsprofile") {
        for (const tab of [
          "Fahrzeugstatus",
          "Statusdefinitionen",
          "Alarmierungsprofile",
        ]) {
          await page.getByRole("tab", { name: tab, exact: true }).click();
          await expect(page.getByRole("tabpanel")).toBeVisible();
          await snap("fms-" + tab.toLowerCase());
        }
      }
      if (title === "Einsatzarchiv und Geldjournal") {
        for (const tab of ["Statistiken", "Einsatzberichte", "Geldjournal"]) {
          await page
            .getByRole("dialog")
            .getByRole("button", { name: tab, exact: true })
            .click();
          await snap("archiv-" + tab.toLowerCase());
        }
      }
      await close();
      await nav(title);
      await expect(page.getByRole("dialog")).toBeVisible();
      await close();
    }
    await nav("Audio-Einstellungen");
    for (const tab of [
      "Audio",
      "Anzeige & Karte",
      "Steuerung",
      "Hinweise & Hilfe",
    ]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await snap(
        "einstellungen-" + tab.replaceAll(/[^a-zA-ZäöüÄÖÜß0-9]+/g, "-"),
      );
    }
    await page
      .getByRole("tab", { name: "Anzeige & Karte", exact: true })
      .click();
    await page
      .getByLabel("Oberflächentext", { exact: true })
      .selectOption("110");
    await page.getByLabel("Kartensymbole", { exact: true }).selectOption("120");
    await page.getByLabel("Bewegung reduzieren", { exact: true }).check();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Weiter bearbeiten", exact: true }),
    ).toBeVisible();
    await snap("einstellungen-entwurfsschutz");
    await page
      .getByRole("button", { name: "Weiter bearbeiten", exact: true })
      .click();
    await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
    await expect(
      page.getByText("Alle Änderungen gespeichert.", { exact: true }),
    ).toBeVisible();
    await close();
    await nav("Anzeige und Karte");
    await expect(
      page.getByLabel("Oberflächentext", { exact: true }),
    ).toHaveValue("110");
    await page
      .getByRole("button", { name: "Standardwerte", exact: true })
      .click();
    await page.getByRole("button", { name: "Verwerfen", exact: true }).click();
    await expect(
      page.getByLabel("Oberflächentext", { exact: true }),
    ).toHaveValue("110");
    await page
      .getByRole("button", { name: "Standardwerte", exact: true })
      .click();
    await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
    await close();
  }
  // Real independent fresh account uses every training action through the UI.
  const newContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  page = await newContext.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(info.origin);
  await page.getByLabel("Benutzername", { exact: true }).fill("quality-new");
  await page.getByLabel("Passwort", { exact: true }).fill(info.password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Spielen", exact: true }),
  ).toBeVisible();
  await snap("neues-konto-leer");
  await page.locator(".menu-tutorial-link").click();
  await page
    .getByRole("button", {
      name: "Serverübung starten / fortsetzen",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Persönliche Serverübung" }),
  ).toBeVisible();
  await center();
  const map = page.getByTestId("germany-map-viewport"),
    box = await map.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 100,
    box.y + box.height / 2 + 80,
    { steps: 12 },
  );
  await page.mouse.up();
  await page.mouse.wheel(0, -220);
  await page.getByRole("button", { name: "Kartensuche", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Karte durchsuchen", exact: true })
    .fill("Berlin");
  await page
    .getByRole("textbox", { name: "Karte durchsuchen", exact: true })
    .fill("");
  await snap("tutorial-orientierung");
  await next(2);
  await page
    .getByRole("button", { name: "Budget und Geldjournal", exact: true })
    .click();
  await page.getByRole("button", { name: "Geldjournal", exact: true }).click();
  await snap("tutorial-eurobudget");
  await next(3);
  await page.getByRole("button", { name: "Standorte", exact: true }).click();
  await page
    .getByRole("button", { name: "Standort kaufen", exact: true })
    .click();
  await page
    .getByLabel("Kaufstatus", { exact: true })
    .selectOption("available");
  await page.getByLabel("Ort, Adresse oder Standortname").fill("Berlin");
  await page.locator(".facility-result").first().click();
  await page.getByRole("button", { name: /^Kaufen ·/ }).click();
  await snap("tutorial-standort-kosten");
  await page
    .getByRole("button", { name: "Kauf verbindlich bestätigen", exact: true })
    .click();
  await expect
    .poll(async () => (await ipc("practice-save")).buildings.length)
    .toBe(1);
  await next(4);
  await ipc("practice-advance", { seconds: 125 });
  await page
    .getByRole("complementary", { name: "Persönliche Serverübung" })
    .getByRole("button", { name: "Bereich öffnen", exact: true })
    .click();
  await snap("tutorial-automatische-besetzung");
  await next(5);
  await page
    .getByRole("complementary", { name: "Persönliche Serverübung" })
    .getByRole("button", { name: "Bereich öffnen", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Fahrzeuge & Vergleich", exact: true })
    .click();
  const lf = page
    .locator(".vehicle-shop > article")
    .filter({ has: page.getByRole("heading", { name: "LF 20", exact: true }) });
  await lf.getByRole("button", { name: "Vergleichen", exact: true }).click();
  await lf.getByRole("button", { name: "Kauf prüfen", exact: true }).click();
  await snap("tutorial-lf20-kaufvergleich");
  await page
    .getByRole("button", { name: "Kauf verbindlich bestätigen", exact: true })
    .click();
  await expect
    .poll(async () => (await ipc("practice-save")).vehicles.length)
    .toBe(1);
  await next(6);
  await page
    .getByRole("button", {
      name: "Technischen Übungsnotruf anfordern",
      exact: true,
    })
    .click();
  await callAndDispatch();
  await next(7);
  await dispatch();
  await next(8);
  await arrivalAndRadio();
  await next(9);
  await next(10);
  await complete();
  await next(11);
  await nav("Einsatzarchiv und Geldjournal");
  await page
    .getByRole("button", { name: "Einsatzberichte", exact: true })
    .click();
  await page.locator(".archive-item button").first().click();
  await expect(page.locator(".report-panel h2")).toBeVisible();
  await snap("tutorial-euro-xp-bericht");
  await next(12);
  await page
    .getByRole("button", {
      name: "Brandübung mit Nachforderung anfordern",
      exact: true,
    })
    .click();
  await callAndDispatch();
  await dispatch();
  await arrivalAndRadio();
  await openIncident();
  await page
    .locator(".incident-dock")
    .getByRole("button", { name: "Funk", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nachforderung bearbeiten", exact: true })
    .click();
  await snap("tutorial-echte-nachforderung");
  await close();
  await nav("Wachen verwalten");
  await page.locator(".station-card").first().click();
  await page
    .getByRole("tab", { name: "Fahrzeuge & Vergleich", exact: true })
    .click();
  const tsf = page
    .locator(".vehicle-shop > article")
    .filter({ has: page.getByRole("heading", { name: "TSF-W", exact: true }) });
  await tsf.getByRole("button", { name: "Kauf prüfen", exact: true }).click();
  await page
    .getByRole("button", { name: "Kauf verbindlich bestätigen", exact: true })
    .click();
  await expect
    .poll(async () => (await ipc("practice-save")).vehicles.length)
    .toBe(2);
  await close();
  await dispatch();
  await complete();
  await snap("tutorial-brand-verstaerkt-abgeschlossen");
  await next(13);
  await nav("Fuhrpark");
  await snap("tutorial-rueckfahrt");
  await next(14);
  await nav("Leitstellenverbund und Disponenten");
  await snap("tutorial-zusammenarbeit");
  await next(15);
  await nav("Audio-Einstellungen");
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await next(16);
  await nav("Spielanleitung");
  await close();
  await page
    .getByRole("complementary", { name: "Persönliche Serverübung" })
    .getByRole("button", { name: "Weiter", exact: true })
    .click();
  await expect(page.getByText(/Lernweg abgeschlossen/)).toBeVisible();
  await snap("tutorial-abgeschlossen");
  await ipc("restart");
  await expect(page.getByText(/Mit Spielserver verbunden/)).toBeVisible({
    timeout: 30000,
  });
  await page
    .getByRole("button", { name: "Zur echten Leitstelle", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Persönliche Serverübung" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Budget und Geldjournal", exact: true }),
  ).toContainText("1.400.000,00");
  await snap("echte-leitstelle-unveraendert");
  expect(errors).toEqual([]);
  writeFileSync(
    resolve(dir, "result.json"),
    JSON.stringify(
      {
        passed: true,
        views: evidence.length,
        errors,
        realGermany: true,
        fullTutorial: true,
        restart: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (page) {
    await page.screenshot({ path: resolve(dir, "debug-failure.png") });
    writeFileSync(
      resolve(dir, "failure.txt"),
      await page.locator("body").innerText(),
    );
  }
  throw error;
} finally {
  await browser?.close();
  if (child.connected) child.send({ type: "shutdown" });
}
