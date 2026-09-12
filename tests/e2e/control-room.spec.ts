import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../src/server/index";
import { phaseFixture } from "../dispatch-fixture";
import { listenBrowserServer } from "./server-helper";
import { test, expect } from "./test";
import { openPanel } from "./ui-navigation";
const { version } = JSON.parse(await readFile("package.json", "utf8")) as {
  version: string;
};
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, origin: string;
test.beforeAll(async () => {
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-control-room-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  origin = config.publicUrl;
  const owner = await app.auth.create(
    "control",
    "Control-room-password!",
    "Alex Berger",
    "Leitstelle Berlin",
  );
  const s = phaseFixture(owner);
  s.player.station = "Leitstelle Berlin";
  s.player.name = "Alex Berger";
  s.missionWait = 9999;
  app.db.save(owner, s);
});
test.afterAll(async () => {
  await app.close();
});

test("Hauptmenü und Rückkehr unterdrücken Anrufe, Spielansicht und zweiter Tab zählen unabhängig", async ({
  page,
  context,
}) => {
  const name = "presence-ui",
    owner = await app.auth.create(
      name,
      "Presence-ui-password!",
      "Anwesenheit",
      "Prüfleitstelle",
    );
  const save = phaseFixture(owner);
  save.missions = [];
  save.archive = [];
  save.missionWait = 0;
  save.nextMission = save.time;
  app.db.save(owner, save);
  const plays = new Map<string, boolean>();
  app.io.on("connection", (socket) => {
    socket.on("play:presence", (value) => plays.set(socket.id, !!value.active));
    socket.on("disconnect", () => plays.delete(socket.id));
  });
  await page.goto(origin);
  await page.getByLabel("Benutzername", { exact: true }).fill(name);
  await page
    .getByLabel("Passwort", { exact: true })
    .fill("Presence-ui-password!");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Spielen", exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 15; i++) app.game.step(60);
  expect(app.db.all().get(owner)!.missions).toHaveLength(0);
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect.poll(() => [...plays.values()].filter(Boolean).length).toBe(1);
  for (let i = 0; i < 10; i++) app.game.step(60);
  expect(app.db.all().get(owner)!.missions.length).toBeGreaterThan(0);
  const extra = await context.newPage();
  await extra.goto(origin);
  await extra.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect.poll(() => [...plays.values()].filter(Boolean).length).toBe(2);
  await openPanel(page, "Zurück zum Hauptmenü");
  await expect.poll(() => [...plays.values()].filter(Boolean).length).toBe(1);
  await extra.close();
  await expect.poll(() => [...plays.values()].filter(Boolean).length).toBe(0);
  const calls = () =>
    app.db
      .all()
      .get(owner)!
      .missions.flatMap((m) => m.control!.calls.map((c) => c.id));
  const before = calls();
  for (let i = 0; i < 15; i++) app.game.step(60);
  expect(calls()).toEqual(before);
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect.poll(() => [...plays.values()].filter(Boolean).length).toBe(1);
  app.game.step(1);
  expect(calls()).toEqual(before);
  await context.setOffline(true);
  await expect.poll(() => [...plays.values()].filter(Boolean).length).toBe(0);
  for (let i = 0; i < 10; i++) app.game.step(60);
  expect(calls()).toEqual(before);
  await context.setOffline(false);
});
for (const [width, height] of [
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
])
  test(`linker Arbeitsplatz, Textfunk und Menü ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(origin);
    await page.getByLabel("Benutzername", { exact: true }).fill("control");
    await page
      .getByLabel("Passwort", { exact: true })
      .fill("Control-room-password!");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Leaderboard", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".menu-footer,.menu-news,.menu-tutorial-link"),
    ).toHaveCount(0);
    await mkdir(".tools/screenshots/control-room", { recursive: true });
    await page.screenshot({
      path: `.tools/screenshots/control-room/menu-${width}.png`,
    });
    await page.getByRole("button", { name: "Spielen", exact: true }).click();
    const log = page.getByRole("region", { name: "Funk und Ereignisse" });
    await expect(log).toBeVisible();
    await expect(log.locator("input,textarea")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /Einsätze/ })).toBeVisible();
    await page.getByRole("tab", { name: /Notrufe/ }).click();
    await expect(page.locator(".left-call-list")).toBeVisible();
    await page.getByRole("tab", { name: /Einsätze/ }).click();
    const list = await page.locator(".mission-sidebar").boundingBox(),
      bounds = await log.boundingBox();
    expect(list!.y + list!.height).toBeLessThanOrEqual(bounds!.y);
    const identity = await page
        .locator(".control-topbar .hud-identity")
        .boundingBox(),
      menu = await page
        .getByRole("button", { name: "Leitstellenmenü", exact: true })
        .boundingBox();
    expect(menu!.x).toBeGreaterThanOrEqual(identity!.x + identity!.width);
    await page.screenshot({
      path: `.tools/screenshots/control-room/hud-${width}.png`,
    });
    await page
      .getByRole("button", { name: "Leitstellenmenü", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Zurück zum Hauptmenü", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Zurück zum Hauptmenü", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Spielen", exact: true }),
    ).toBeVisible();
  });

test("Leaderboard, sicherer Versionsverlauf, Berichtsvorschau und Offlineexport sind erreichbar", async ({
  page,
}) => {
  await page.goto(origin);
  await page.getByLabel("Benutzername", { exact: true }).fill("control");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill("Control-room-password!");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Leaderboard", exact: true }).click();
  await expect(page.locator(".leaderboard-row").first()).toContainText(
    "Alex Berger",
  );
  await page.screenshot({
    path: ".tools/screenshots/control-room/leaderboard.png",
  });
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Changelogs", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `Installierte Version ${version}` }),
  ).toBeVisible();
  await expect(page.locator(".changelog-panel article").first()).toBeVisible();
  await page
    .getByLabel("Änderungen suchen", { exact: true })
    .fill("Grundfinanzierung");
  await expect(page.locator(".changelog-panel article").first()).toContainText(
    "Grundfinanzierung",
  );
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Support", exact: true }).click();
  await expect(
    page.getByText("Direktversand nicht eingerichtet", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Titel", { exact: true })
    .fill("Fahrzeuganzeige fehlerhaft");
  await page
    .getByLabel("Beschreibung", { exact: true })
    .fill(
      "Meine Adresse ist person@example.com und der Server hat 192.168.1.1. @everyone",
    );
  await page
    .getByRole("button", { name: "Bereinigte Vorschau", exact: true })
    .click();
  const preview = page.getByRole("article", { name: "Berichtsvorschau" });
  await expect(preview).toBeVisible();
  await expect(preview).not.toContainText("person@example.com");
  await expect(preview).not.toContainText("192.168.1.1");
  await expect(
    preview.getByRole("button", {
      name: "Öffentlich veröffentlichen",
      exact: true,
    }),
  ).toBeDisabled();
  await page.screenshot({
    path: ".tools/screenshots/control-room/support.png",
  });
  await page.context().setOffline(true);
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Bereinigten Bericht herunterladen",
      exact: true,
    })
    .click();
  expect((await downloaded).suggestedFilename()).toBe(
    "leitstellen-fehlerbericht.txt",
  );
  await page.context().setOffline(false);
});

test("vergrößerte Bedienoberfläche behält Kartenfokus und Textprotokoll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(origin);
  await page.evaluate(() =>
    localStorage.setItem(
      "lv-device-v2",
      JSON.stringify({
        version: 2,
        scale: 120,
        pois: true,
        players: true,
        workspace: { side: "right" },
      }),
    ),
  );
  await page.reload();
  await page.getByLabel("Benutzername", { exact: true }).fill("control");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill("Control-room-password!");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
  await expect(page.locator(".event-log")).toBeVisible();
  await expect(
    page.locator(
      ".facility-map-controls,[data-testid=map-presence],.germany-pois",
    ),
  ).toHaveCount(0);
  const side = await page.locator(".mission-sidebar").boundingBox(),
    log = await page.locator(".event-log").boundingBox();
  expect(side!.y + side!.height).toBeLessThanOrEqual(log!.y);
  await page.screenshot({
    path: ".tools/screenshots/control-room/hud-scaled.png",
  });
});
