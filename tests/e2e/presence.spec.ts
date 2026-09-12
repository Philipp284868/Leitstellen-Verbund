import { fixturePurchase } from "../fixtures/germany/facilities";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openPanel } from "./ui-navigation";
import { joinDesk } from "./desk-helpers";
import type { Config } from "../../src/server/config";
import type { startServer } from "../../src/server/index";
import { apply } from "../../src/shared/engine";
import { fresh } from "../../src/shared/model";
import { sites as nodes } from "../fixtures/germany/locations";
import { createBrowserServer, listenBrowserServer } from "./server-helper";
import { expect, test, type Page } from "./test";

const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
const password = "Presence-browser-test-284!";
let app: ReturnType<typeof startServer>,
  config: Config,
  owner: string,
  guest: string;
test.beforeEach(async () => {
  config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-presence-browser-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  owner = await app.auth.create(
    "presence-owner",
    password,
    "Anna Nord",
    "Leitstelle Nord",
  );
  guest = await app.auth.create(
    "presence-guest",
    password,
    "Ben Süd",
    "Leitstelle Süd",
  );
  const s = app.db.all().get(owner)!;
  s.missionWait = 100000;
  apply(s, fixturePurchase("fire", nodes[0]));
  s.buildings[0].name = "Echte Nordwache";
  app.db.save(owner, s);
});
test.afterEach(async () => {
  await app.close();
  await rm(config.dataDir, { recursive: true, force: true });
});
async function enter(page: Page, username: string) {
  await page.goto(config.publicUrl);
  await page.getByLabel("Benutzername", { exact: true }).fill(username);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Spielen", exact: true }).click();
}
async function openPlayers(page: Page) {
  await openPanel(page, "Leaderboard");
  await expect(
    page.getByRole("region", { name: "Leaderboard", exact: true }),
  ).toBeVisible();
}
async function board(page: Page) {
  return page.evaluate(async () => (await fetch("/api/leaderboard")).json());
}
test("Leaderboard zeigt getrennte Konten offline, gemeinsame Zuordnung, private Daten und Neustart", async ({
  page,
  browser,
}) => {
  await enter(page, "presence-owner");
  await openPlayers(page);
  await expect(page.locator(".leaderboard")).toContainText("Ben Süd");
  const before = await board(page);
  expect(before.total).toBe(2);
  expect(JSON.stringify(before)).not.toMatch(
    /password|cookie|csrf|latitude|Echte Nordwache/,
  );
  const second = await browser.newContext(),
    b = await second.newPage();
  try {
    await enter(b, "presence-guest");
    await joinDesk(page, b, "presence-guest");
    await openPlayers(page);
    const joined = await board(page);
    expect(joined.items.find((x: { id: string }) => x.id === guest).desk).toBe(
      "Leitstelle Nord",
    );
    expect(
      joined.items.find((x: { id: string }) => x.id === guest).shared,
    ).toEqual(joined.items.find((x: { id: string }) => x.id === owner).shared);
    const extra = await page.context().newPage();
    await extra.goto(config.publicUrl);
    await extra.getByRole("button", { name: "Spielen", exact: true }).click();
    expect((await board(page)).total).toBe(2);
    await extra.close();
    await second.setOffline(true);
    expect((await board(page)).total).toBe(2);
    await second.setOffline(false);
    await app.close();
    app = await createBrowserServer(compiled.startServer, config);
    await app.listen();
    await page.reload();
    await page.getByRole("button", { name: "Spielen", exact: true }).click();
    await openPlayers(page);
    await expect(page.locator(".leaderboard")).toContainText("Ben Süd");
    expect((await board(page)).items.map((x: { id: string }) => x.id)).toEqual(
      before.items.map((x: { id: string }) => x.id),
    );
  } finally {
    await second.close();
  }
});
test("Rangliste findet auch den letzten Offline-Spieler über Seiten und Suche", async ({
  page,
}) => {
  for (let i = 0; i < 34; i++) {
    const save = fresh(
      `Disponent ${String(i).padStart(2, "0")}`,
      `Weltleitstelle ${i}`,
      Date.now() / 1000,
    );
    app.db.sql
      .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
      .run(
        save.player.id,
        `batch-${i}`,
        "unused fixture",
        "player",
        Date.now() + i,
      );
    app.db.save(save.player.id, save);
  }
  await enter(page, "presence-owner");
  await openPlayers(page);
  const panel = page.locator(".leaderboard");
  await expect(panel.locator(".leaderboard-row")).toHaveCount(20);
  await expect(panel.getByRole("navigation")).toContainText("Seite 1 / 2");
  await panel.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(panel.locator(".leaderboard-row")).toHaveCount(16);
  await panel.getByLabel("Spieler oder Leitstelle suchen").fill("Disponent 33");
  await expect(panel.locator(".leaderboard-row")).toHaveCount(1);
  await expect(panel).toContainText("Weltleitstelle 33");
  await panel
    .getByLabel("Spieler oder Leitstelle suchen")
    .fill("nicht vorhanden");
  await expect(panel).toContainText("Keine passenden Spieler.");
  await panel
    .getByRole("button", { name: "Meine Position", exact: true })
    .click();
  await expect(panel.locator(".leaderboard-row[open]")).toContainText(
    "Anna Nord",
  );
});
