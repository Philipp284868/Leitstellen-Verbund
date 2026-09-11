import { replaceFixtureSave } from "../fixtures/germany/replace-save";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Config } from "../../server/config";
import type { startServer } from "../../server/index";
import { writeWorldSituation } from "../../server/world-situation";
import {
  advanceSituation,
  createSituation,
  situationLevel,
  situationNames,
} from "../../src/simulation/world-situation";
import { phaseFixture } from "../dispatch-fixture";
import { organizationFixture } from "../mutual-aid-fixture";
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
const password = "Operations-browser-password-123!";
test.beforeEach(async () => {
  config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-operations-browser-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  owner = await app.auth.create("alpha", password, "Alpha", "Nord");
  member = await app.auth.create("bravo", password, "Bravo", "Süd");
  const s = phaseFixture(owner);
  s.missions[0].control!.calls[0].stress = 40;
  app.db.save(owner, s);
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

test("Garagen zeigen physische Anwesenheit und behalten ihren Klappzustand über Updates und Wiederverbindung", async ({
  page,
}, info) => {
  await login(page);
  await openPanel(page, "Standorte");
  const garage = page.locator(".station-garage").first();
  await garage.locator("summary").click();
  await expect(garage).toHaveAttribute("open", "");
  const saved = app.db.all().get(owner)!;
  const vehicle = saved.vehicles[0];
  await expect(
    garage.getByRole("button", { name: new RegExp(vehicle.name) }),
  ).toBeVisible();
  app.game.step(5, Date.now(), { generation: false });
  await expect(garage).toHaveAttribute("open", "");
  await page.screenshot({ path: info.outputPath("garage-aufgeklappt.png") });
  await page.reload();
  await enterGame(page);
  await openPanel(page, "Standorte");
  await expect(garage).toHaveAttribute("open", "");
  await garage.locator("summary").click();
  app.game.step(5, Date.now(), { generation: false });
  await expect(garage).not.toHaveAttribute("open", "");
});

test("zwei Arbeitsplätze sehen dieselbe regionale Weltlage und öffentliche Alarmstellen nach späterem Login", async ({
  page,
  browser,
}, info) => {
  await app.auth.create("worldguest", password, "Gast", "ILS West");
  const second = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  try {
    const other = await second.newPage();
    await login(page);
    await login(other, "worldguest");
    const save = app.db.all().get(owner)!;
    const state = advanceSituation(
      createSituation(save.time, 123, "storm", {
        kind: "circle",
        name: "Nordkreis",
        ...save.buildings[0].pos,
        radius: 300,
      }),
      2000,
    );
    writeWorldSituation(app.db.sql, state);
    app.game.step(0, Date.now(), { generation: false });
    const situationLabel = `Lage: ${situationNames[state.profile]} · ${situationLevel(state)}`;
    for (const p of [page, other])
      await expect(
        p.getByRole("button", {
          name: situationLabel,
          exact: true,
        }),
      ).toBeVisible();
    await other
      .getByRole("button", { name: situationLabel, exact: true })
      .click();
    await expect(other.locator(".world-situation-view")).toContainText(
      "Nordkreis",
    );
    await expect(other.locator(".world-situation-view")).toContainText(
      "außerhalb",
    );
    await other.screenshot({
      path: info.outputPath("gemeinsame-regionale-lage.png"),
    });
    await other
      .getByRole("button", { name: "Anzeige schließen", exact: true })
      .click();
    app.game.command(owner, {
      id: crypto.randomUUID(),
      action: {
        type: "civil-readiness",
        op: "mobilize",
        homes: [save.buildings[0].id],
        reason: "Sturmbedingte Bereitschaft",
      },
    });
    const name = save.player.station;
    await expect(
      other.getByRole("button", {
        name: `Katastrophenalarm: ${name}`,
        exact: true,
      }),
    ).toBeVisible();
    await other
      .getByRole("button", { name: `Katastrophenalarm: ${name}`, exact: true })
      .click();
    await expect(other.locator(".public-alarm-list")).toContainText(name);
    expect(
      app.game.view(
        app.db.sql
          .prepare("SELECT id FROM users WHERE username='worldguest'")
          .get()!.id as string,
        new Set(),
      ).network.friends,
    ).toHaveLength(0);
    await other.screenshot({
      path: info.outputPath("oeffentliche-alarmuebersicht.png"),
    });
    await other.reload();
    await enterGame(other);
    await expect(
      other.getByRole("button", {
        name: `Katastrophenalarm: ${name}`,
        exact: true,
      }),
    ).toBeVisible();
    await other.setViewportSize({ width: 1100, height: 700 });
    const fits = await other
      .locator(".topbar")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
    expect(fits).toBe(true);
  } finally {
    await second.close();
  }
});
async function login(page: Page, username = "alpha") {
  await page.goto(config.publicUrl);
  await page.getByLabel("Benutzername", { exact: true }).fill(username);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await enterGame(page);
}
async function openOperations(page: Page, name: string) {
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible()) {
    await dialog
      .getByRole("button", { name: "Schließen", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Funk", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("gemeinsamer Notrufarbeitsplatz alarmiert früh und zeigt vier nutzbare Bereiche auf dem Desktop", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);
  await page.getByRole("button", { name: /^Notrufe \(/ }).click();
  const desk = page.getByRole("region", {
    name: "Notrufarbeitsplatz",
    exact: true,
  });
  await expect(desk.getByText("Flächenbrand", { exact: true })).toHaveCount(0);
  await desk
    .getByRole("button", { name: "Notruf annehmen", exact: true })
    .click();
  await desk
    .getByRole("button", { name: "Wo genau ist der Notfall?", exact: true })
    .click();
  app.game.step(5);
  await desk
    .getByRole("button", { name: "Was ist passiert?", exact: true })
    .click();
  await desk
    .getByLabel("Dispositionspriorität", { exact: true })
    .selectOption("DRINGEND");
  await expect
    .poll(() => app.db.all().get(owner)!.missions[0].control!.priority)
    .toBe("DRINGEND");
  await desk.locator(".dispatch-list input").first().check();
  await desk
    .getByRole("button", { name: "Alarmieren (1)", exact: true })
    .click();
  await expect(
    desk.getByRole("button", { name: "Gespräch beenden", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => app.db.all().get(owner)!.vehicles[0].status)
    .toBe("alarmed");
  expect(app.db.all().get(owner)!.missions[0].control!.priority).toBe(
    "DRINGEND",
  );
  app.game.step(5);
  await desk
    .getByRole("button", {
      name: "Wie erreichen die Einsatzkräfte den Ort?",
      exact: true,
    })
    .click();
  await expect(desk.locator(".radio-message")).toHaveCount(3);
  for (const width of [1920, 1366]) {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    // Show the complete workspace header after Playwright scrolled a question
    // into view. The submit action must fit even at the top of the dialog.
    await page.locator(".modal-body").evaluate((el) => (el.scrollTop = 0));
    const layout = await desk.locator(".call-grid").evaluate((el) => ({
      scroll: el.scrollWidth,
      width: el.clientWidth,
      cols: getComputedStyle(el).gridTemplateColumns.split(" ").length,
    }));
    expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
    expect(layout.cols).toBeGreaterThanOrEqual(3);
    const alarmBox = await desk
      .getByRole("button", { name: /^Alarmieren \(/ })
      .boundingBox();
    expect(alarmBox).not.toBeNull();
    expect(alarmBox!.y).toBeGreaterThan(0);
    expect(alarmBox!.y + alarmBox!.height).toBeLessThan(
      (width === 1920 ? 1080 : 768) - 20,
    );
    await page.screenshot({
      path: info.outputPath(`notruf-disposition-${width}.png`),
    });
  }
  await page.reload();
  await enterGame(page);
  await page.getByRole("button", { name: /^Notrufe \(/ }).click();
  await expect(desk.locator(".radio-message")).toHaveCount(3);
  await expect(
    desk.getByRole("button", { name: "Gespräch beenden", exact: true }),
  ).toBeVisible();
});

test("zwei Disponenten: Notruf übergeben, KatS mobilisieren, Lagebuch teilen, alarmieren und persistent abschließen", async ({
  page,
  browser,
}, info) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const second = await browser.newContext({
      viewport: { width: 1366, height: 768 },
    }),
    errors: string[] = [];
  try {
    const other = await second.newPage();
    for (const p of [page, other])
      p.on("pageerror", (e) => errors.push(e.message));
    await login(page);
    await login(other, "bravo");
    for (const p of [page, other])
      await p.getByRole("button", { name: /^Notrufe \(/ }).click();
    const desk = page.getByRole("region", {
        name: "Notrufarbeitsplatz",
        exact: true,
      }),
      otherDesk = other.getByRole("region", {
        name: "Notrufarbeitsplatz",
        exact: true,
      });
    await desk
      .getByRole("button", { name: "Notruf annehmen", exact: true })
      .click();
    await desk
      .getByRole("button", { name: "Wo genau ist der Notfall?", exact: true })
      .click();
    await expect(otherDesk.locator(".radio-message")).toHaveCount(1);
    await desk
      .getByRole("button", {
        name: "Gespräch zur Übernahme freigeben",
        exact: true,
      })
      .click();
    await otherDesk
      .getByRole("button", { name: "Notruf annehmen", exact: true })
      .click();
    app.game.step(5);
    await otherDesk
      .getByRole("button", { name: "Was ist passiert?", exact: true })
      .click();
    await expect(otherDesk.locator(".radio-message")).toHaveCount(2);
    await otherDesk
      .getByRole("button", { name: "Gespräch beenden", exact: true })
      .click();
    await expect
      .poll(() => app.db.all().get(owner)!.missions[0].control!.calls[0].state)
      .toBe("ended");
    await page.screenshot({
      path: info.outputPath("notruf-1366.png"),
      fullPage: true,
    });
    await openOperations(page, "Katastrophenbereitschaft & KatS-Wachen");
    const civil = page.getByRole("region", {
      name: "Katastrophenbereitschaft",
      exact: true,
    });
    const s = app.db.all().get(owner)!,
      home = s.buildings[0],
      mission = s.missions[0].id;
    await expect(civil).toContainText(
      "Reguläre Alarmierung mit üblicher Anreise",
    );
    await civil.getByRole("checkbox", { name: home.name, exact: true }).check();
    await civil
      .getByRole("button", {
        name: "Ausgewählte Wachen mobilisieren",
        exact: true,
      })
      .click();
    await expect(civil).toContainText("Bereitschaft");
    const at = app.db.all().get(owner)!.buildings[0].civilProtection!.readyAt;
    await app.close();
    app = await createBrowserServer(compiled.startServer, config);
    await app.listen();
    await page.reload();
    await enterGame(page);
    await openOperations(page, "Katastrophenbereitschaft & KatS-Wachen");
    expect(app.db.all().get(owner)!.buildings[0].civilProtection!.readyAt).toBe(
      at,
    );
    app.game.step(
      Math.max(1, at - app.db.all().get(owner)!.time + 1),
      Date.now(),
      { generation: false },
    );
    await expect(civil).toContainText("2/2 Fahrzeuge alarmierbar");
    await page.screenshot({
      path: info.outputPath("kats-1366.png"),
      fullPage: true,
    });
    await openOperations(page, "Gemeinsame Einsatzlagen");
    await other.reload();
    await enterGame(other);
    await openOperations(other, "Gemeinsame Einsatzlagen");
    const note = "Zufahrt am Nordtor für alle Kräfte freihalten";
    await page.getByLabel("Lagenotiz", { exact: true }).fill(note);
    await page
      .getByRole("button", { name: "Notiz im Lagebuch speichern", exact: true })
      .click();
    await expect(
      other.getByRole("region", { name: "Lagebuch", exact: true }),
    ).toContainText(note);
    await page.context().setOffline(true);
    await expect(page.getByLabel("Lagenotiz", { exact: true })).toBeDisabled();
    await page.context().setOffline(false);
    await expect(page.getByLabel("Lagenotiz", { exact: true })).toBeEnabled();
    await page.screenshot({
      path: info.outputPath("lagebuch-1366.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Einsatzführung öffnen", exact: true })
      .click();
    for (const input of await page.locator(".dispatch-list input").all())
      await input.check();
    await page
      .getByRole("button", { name: "Alarmieren (2)", exact: true })
      .click();
    await expect
      .poll(() => app.db.all().get(owner)!.vehicles[0].status)
      .toBe("alarmed");
    const dispatched = app.db.all().get(owner)!;
    app.game.step(
      Math.max(...dispatched.vehicles.map((v) => v.arrive)) -
        dispatched.time +
        2,
      Date.now(),
      { generation: false },
    );
    await page
      .locator(".radio-queue")
      .getByRole("button", { name: "Lagemeldung aufnehmen", exact: true })
      .first()
      .click();
    app.game.step(90, Date.now(), { generation: false });
    await expect
      .poll(() =>
        app.db
          .all()
          .get(owner)!
          .archive.some((m) => m.id === mission),
      )
      .toBe(true);
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
    await expect(page.locator(".incident-history")).toContainText(note);
    await expect(page.locator(".incident-history")).toContainText(
      "zur Übernahme",
    );
    expect(errors).toEqual([]);
  } finally {
    await second.close();
  }
});

test("Lagebuch schützt Entwürfe und KatS- sowie Notrufansichten bleiben hell und auf kleinen Desktopfenstern bedienbar", async ({
  page,
}, info) => {
  const s = app.db.all().get(owner)!;
  s.missions[0].control!.locationKnown = true;
  s.missions[0].control!.reportedTemplate = "reported-fire";
  app.db.save(owner, s);
  await page.setViewportSize({ width: 1100, height: 700 });
  await login(page);
  await openOperations(page, "Gemeinsame Einsatzlagen");
  await page
    .getByLabel("Lagenotiz", { exact: true })
    .fill("Offener Entwurf bleibt hier");
  await page
    .getByRole("button", { name: "Gemeinsame Hilfe", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Weiter bearbeiten", exact: true })
    .click();
  await expect(page.getByLabel("Lagenotiz", { exact: true })).toHaveValue(
    "Offener Entwurf bleibt hier",
  );
  await page
    .getByRole("button", { name: "Notiz im Lagebuch speichern", exact: true })
    .click();
  await openPanel(page, "Einstellungen");
  await page.getByRole("tab", { name: "Anzeige & Karte", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Helle Oberfläche", exact: true })
    .check();
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  for (const name of [
    "Gemeinsame Einsatzlagen",
    "Katastrophenbereitschaft & KatS-Wachen",
  ]) {
    await openOperations(page, name);
    const dialog = page.getByRole("dialog");
    const bounds = await dialog.evaluate((el) => ({
      width: el.clientWidth,
      scroll: el.scrollWidth,
    }));
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: info.outputPath(
        name.startsWith("Gemeinsame")
          ? "lage-hell-1100.png"
          : "kats-hell-1100.png",
      ),
      fullPage: true,
    });
  }
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Schließen", exact: true })
    .click();
  await page.getByRole("button", { name: /^Notrufe \(/ }).click();
  await page.getByLabel("Notruf suchen", { exact: true }).fill("kein-treffer");
  await expect(
    page.getByRole("region", { name: "Notrufliste", exact: true }),
  ).toContainText("Keine passenden Gespräche");
  await page.getByLabel("Notruf suchen", { exact: true }).clear();
  // The reused conversation panel must inherit the light palette too.
  const contrast = await page
    .locator(".call-conversation")
    .evaluate((panel) => {
      const rgb = (color: string) => (color.match(/[\d.]+/g) ?? []).map(Number);
      const luminance = (c: number[]) =>
        c
          .slice(0, 3)
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const background = luminance(
        rgb(getComputedStyle(panel).backgroundColor),
      );
      return [...panel.querySelectorAll("h3,p,summary")].map((el) => {
        const text = luminance(rgb(getComputedStyle(el).color));
        return {
          text: el.textContent,
          ratio:
            (Math.max(text, background) + 0.05) /
            (Math.min(text, background) + 0.05),
        };
      });
    });
  for (const sample of contrast)
    expect(sample.ratio, sample.text ?? "Gesprächstext").toBeGreaterThanOrEqual(
      4.5,
    );
  await page.screenshot({
    path: info.outputPath("notruf-hell-1100.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("gezielt angefragte Nachbarhilfe ist in der gemeinsamen Lage mit wirklicher Zusage und Funkantwort bedienbar", async ({
  page,
}, info) => {
  const helper = await app.auth.create("helper", password, "Helfer", "West");
  const s = organizationFixture(owner, "field", "ops-browser-owner");
  replaceFixtureSave(app.db, owner, s);
  app.db.save(
    helper,
    organizationFixture(helper, "field", "ops-browser-helper"),
  );
  app.game.command(helper, {
    id: crypto.randomUUID(),
    action: {
      type: "aid-draft",
      peer: owner,
      mission: app.db.all().get(helper)!.missions[0].id,
      types: ["hlf"],
      priority: "DRINGEND",
      message: "Löschhilfe am Nordtor benötigt",
      vehicleWishes: ["KatS-GW-SAN 01", "Unbekannt <script>kein Code</script>"],
    },
  });
  app.game.command(helper, {
    id: crypto.randomUUID(),
    action: { type: "aid-send", id: app.db.all().get(helper)!.aid[0].id },
  });
  await login(page);
  await openOperations(page, "Gemeinsame Einsatzlagen");
  await page
    .getByRole("button", { name: "Gemeinsame Hilfe", exact: true })
    .click();
  const card = page.locator(".aid-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Löschhilfe am Nordtor benötigt");
  await expect(card).toContainText("KatS-GW-SAN 01");
  await expect(card).toContainText("Unbekannt <script>kein Code</script>");
  await expect(card.locator("script")).toHaveCount(0);
  await card.locator(".aid-vehicles").scrollIntoViewIfNeeded();
  await expect(card.locator(".aid-vehicles")).toContainText("Fahrt");
  await card.locator(".aid-vehicles input").first().check();
  await card
    .getByRole("button", { name: /Ausgewählte Kräfte alarmieren/ })
    .click();
  await expect
    .poll(() => app.db.all().get(owner)!.vehicles[0].status)
    .toBe("alarmed");
  await card.getByText("Tatsächliche Zusagen", { exact: true }).click();
  await expect(card).toContainText(app.db.all().get(owner)!.vehicles[0].name);
  await card.getByRole("textbox").fill("Kräfte fahren über Nordtor an");
  await card.getByRole("button", { name: "Nachricht übermitteln" }).click();
  await expect(card).toContainText("Kräfte fahren über Nordtor an");
  await page.screenshot({
    path: info.outputPath("gemeinsame-hilfe.png"),
    fullPage: true,
  });
});

test("freie Fahrzeugwünsche werden als privater Entwurf gespeichert, nach Versand beim Empfänger angezeigt und nach Neustart erhalten", async ({
  page,
  browser,
}, info) => {
  const helper = await app.auth.create("helper", password, "Helfer", "West");
  replaceFixtureSave(
    app.db,
    owner,
    organizationFixture(owner, "field", "aid-wishes-owner"),
  );
  app.db.save(
    helper,
    organizationFixture(helper, "field", "aid-wishes-helper"),
  );
  const second = await browser.newContext();
  try {
    const other = await second.newPage();
    await login(page);
    await login(other, "helper");
    await openPanel(page, "Freunde");
    await openPanel(other, "Freunde");
    await page.getByText("Neue Unterstützungsanfrage", { exact: true }).click();
    await page
      .getByLabel("Nachbarleitstelle", { exact: true })
      .selectOption(helper);
    await page
      .getByLabel("Eigener Einsatz", { exact: true })
      .selectOption(app.db.all().get(owner)!.missions[0].id);
    await page
      .getByLabel("Gewünschter Fahrzeugtyp", { exact: true })
      .selectOption("tsf");
    await page
      .getByRole("button", {
        name: "Fahrzeug zur Anforderung hinzufügen",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Gewünschte Fahrzeuge / Funkrufnamen (optional)", {
        exact: false,
      })
      .fill("KatS-GW-SAN01\nKatS-NKTW01\nFlorian unbekannt");
    await page
      .getByLabel("Anfragetext", { exact: true })
      .fill("Geeignetes Löschfahrzeug für Ablösung");
    await page
      .getByRole("button", { name: "Entwurf anlegen", exact: true })
      .click();
    await expect(page.locator(".aid-card")).toContainText("Florian unbekannt");
    await expect(other.locator(".aid-card")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Anfrage verbindlich senden", exact: true })
      .click();
    const card = other.locator(".aid-card");
    await expect(card).toContainText("KatS-NKTW01");
    await expect(card).toContainText("geeignete Alternative");
    await card.locator(".aid-vehicles input").first().check();
    await card
      .getByRole("button", {
        name: "Ausgewählte Kräfte alarmieren",
        exact: true,
      })
      .click();
    await card.getByText("Tatsächliche Zusagen", { exact: true }).click();
    await expect(card).toContainText("als Alternative");
    await app.close();
    app = await createBrowserServer(compiled.startServer, config);
    await app.listen();
    await other.reload();
    await enterGame(other);
    await openPanel(other, "Freunde");
    await expect(other.locator(".aid-card")).toContainText("Florian unbekannt");
    await other.screenshot({
      path: info.outputPath("fahrzeugwuensche-empfangen.png"),
      fullPage: true,
    });
  } finally {
    await second.close();
  }
});
