import { test, expect, type Page } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import type { Config } from "../../server/config";
import { majorFixture, atScene } from "../phase-four-fixture";
import type { SectionKind } from "../../src/simulation/major-schema";
import type { ServerAction } from "../../server/actions";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>,
  config: Config,
  owner: string,
  peer: string;
const password = "Phase-four-browser-password-123!";
test.use({ actionTimeout: 15000 });
test.beforeEach(async () => {
  const port = 40000 + Math.floor(Math.random() * 11000);
  config = {
    host: "127.0.0.1",
    port,
    publicUrl: `http://127.0.0.1:${port}`,
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-major-browser-")),
    secure: false,
    trustedProxies: [],
  };
  app = compiled.startServer(config);
  await app.listen();
  owner = await app.auth.create("north", password, "Nord", "Nord");
  peer = await app.auth.create("south", password, "Süd", "Süd");
  app.db.save(owner, majorFixture(owner));
  app.db.save(peer, majorFixture(peer, "field", "south"));
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
    .getByRole("button", { name: "Leitstelle öffnen", exact: true })
    .click();
}
function command(action: ServerAction) {
  app.game.command(owner, { id: crypto.randomUUID(), action });
}
test("Großbrand ausrufen, frei alarmieren, Abschnitte und Leitung zuweisen und Historie prüfen", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await page.locator(".mission-card").first().click();
  await page
    .getByRole("button", { name: "Großbrand ausrufen", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Großlagenführung", exact: true }),
  ).toBeVisible();
  for (const text of ["Brandbekämpfung", "Wasserversorgung", "Menschenrettung"])
    await page
      .getByRole("button", { name: `${text} beauftragen`, exact: true })
      .click();
  const s = app.db.all().get(owner)!,
    id = s.missions[0].id;
  for (const i of [0, 1, 2, 3])
    await page.locator(".dispatch-list input").nth(i).check();
  await page
    .getByRole("button", { name: "Alarmieren (4)", exact: true })
    .click();
  const destinations: SectionKind[] = ["fire", "water", "command", "rescue"];
  for (let i = 0; i < 4; i++)
    await page
      .getByLabel(`Abschnitt ${s.vehicles[i].name}`, { exact: true })
      .selectOption(destinations[i]);
  await expect
    .poll(() => app.db.all().get(owner)!.missions[0].major!.placements.length)
    .toBe(4);
  await page
    .getByLabel("Leitung Brandbekämpfung", { exact: true })
    .selectOption(s.vehicles[0].id);
  await expect
    .poll(
      () =>
        app.db
          .all()
          .get(owner)!
          .missions[0].major!.sections.find((x) => x.kind === "fire")!.leader
          ?.vehicle,
    )
    .toBe(s.vehicles[0].id);
  app.game.step(120);
  await expect(
    page.getByRole("region", { name: "Großlagenführung", exact: true }),
  ).not.toContainText("Einsatzleitung und Abschnittskräfte fehlen.");
  await page
    .getByRole("heading", { name: "Großbrand · Stufe 1" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("phase4-grossbrand.png"),
    fullPage: true,
  });
  for (
    let i = 0;
    i < 30 &&
    app.db
      .all()
      .get(owner)!
      .missions.some((m) => m.id === id);
    i++
  )
    app.game.step(30);
  await expect(
    page.getByText(
      "Dieser Einsatz ist abgeschlossen. Die Belohnung steht im Geldjournal.",
    ),
  ).toBeVisible();
  expect(
    app.db
      .all()
      .get(owner)!
      .archive.find((m) => m.id === id)!
      .control!.events.some((e) => e.type === "MAJOR_SECTION_LEADER"),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("MANV-Sichtung und frühe Transporte bleiben über Browser- und Serverneustart erhalten", async ({
  page,
}) => {
  const s = majorFixture(owner, "crash");
  app.db.save(owner, s);
  await enter(page);
  await page.locator(".mission-card").first().click();
  await page
    .getByRole("button", { name: "MANV ausrufen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "MANV · Stufe 1" }),
  ).toBeVisible();
  const id = s.missions[0].id;
  // Prepared scene arrival isolates the browser's MANV decisions; real dispatch is covered above.
  const state = app.db.all().get(owner)!;
  for (const v of state.vehicles) atScene(state, v);
  app.db.save(owner, state);
  for (const section of state.missions[0].major!.sections)
    command({
      type: "major-section",
      mission: id,
      section: section.kind,
      priority: 1,
    });
  for (const task of s.missions[0].organization!.tasks)
    command({ type: "organization-task", mission: id, task: task.kind });
  for (const [i, section] of [
    [0, "rescue"],
    [2, "command"],
    [5, "medical"],
    [6, "medical"],
    [7, "medical"],
    [8, "medical"],
    [9, "medical"],
    [10, "security"],
  ] as const)
    command({
      type: "major-assign",
      mission: id,
      vehicle: state.vehicles[i].id,
      section,
    });
  app.game.step(180);
  const row = page.locator(".major-triage").first();
  await row.getByRole("combobox").nth(0).selectOption("I");
  await row.getByRole("combobox").nth(1).selectOption("public");
  await row
    .getByRole("button", { name: "Sichtung und Ziel bestätigen" })
    .click();
  await expect(row).toContainText("gesichtet I");
  await page
    .getByRole("button", { name: "Priorisierte Transporte freigeben" })
    .click();
  await expect(
    page.getByRole("button", { name: "Neue Transporte anhalten" }),
  ).toBeVisible();
  const patient = app.db.all().get(owner)!.missions[0].dynamics!.patients[0].id;
  app.game.step(5);
  expect(
    app.db
      .all()
      .get(owner)!
      .missions[0].dynamics!.patients.find((p) => p.id === patient)!.transport,
  ).toBe("aboard");
  await app.close();
  app = compiled.startServer(config);
  await app.listen();
  await page.reload();
  await page
    .getByRole("button", { name: "Leitstelle öffnen", exact: true })
    .click();
  await page.locator(".mission-card").first().click();
  await expect(
    page.getByRole("button", { name: "Neue Transporte anhalten" }),
  ).toBeVisible();
  const restored = app.db
    .all()
    .get(owner)!
    .missions[0].dynamics!.patients.find((p) => p.id === patient)!;
  expect(restored.triage).toBe("I");
  expect(restored.hospital).toBe("public");
  expect(restored.transport).toBe("aboard");
});
test("mobile Hochwasserführung zeigt versetzte Meldungen, Priorisierung und getrennte Leitstellen", async ({
  page,
  browser,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  app.db.save(owner, majorFixture(owner, "cellar"));
  const context = await browser.newContext(),
    other = await context.newPage();
  try {
    await enter(other, "south");
    await enter(page);
    await page.getByRole("button", { name: /Einsätze \(/ }).click();
    await page.locator(".mission-card").first().click();
    await page
      .getByRole("button", {
        name: "Hochwasser / Katastrophenschutz ausrufen",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("region", { name: "Großlagenführung", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("heading", {
        name: "Hochwasser / Katastrophenschutz · Stufe 1",
      })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath("phase4-hochwasser-mobil.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Schließen", exact: true }).click();
    for (let i = 0; i < 10; i++) app.game.step(30);
    await expect(page.locator(".mission-card")).toHaveCount(2);
    await expect(
      page.getByRole("region", { name: "Großlagenübersicht" }),
    ).toContainText("2 Meldungen bisher");
    await expect(
      other.getByRole("region", { name: "Großlagenübersicht" }),
    ).toHaveCount(0);
    expect(app.game.view(peer, new Set()).network.requests).toHaveLength(0);
    expect(app.game.view(peer, new Set()).network.friends).toHaveLength(0);
    const first = app.db.all().get(owner)!.operations.campaign!.missions[0];
    await page.locator(".mission-card").first().click();
    await page
      .getByLabel("Dispositionspriorität", { exact: true })
      .selectOption("PRIORITÄT");
    await expect
      .poll(
        () =>
          app.db
            .all()
            .get(owner)!
            .missions.find((m) => m.id === first)!.control!.priority,
      )
      .toBe("PRIORITÄT");
  } finally {
    await context.close();
  }
});
