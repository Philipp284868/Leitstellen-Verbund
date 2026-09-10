import { fixturePurchase } from "../fixtures/germany/facilities";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { io, type Socket } from "socket.io-client";
import type { Config } from "../../server/config";
import type { startServer } from "../../server/index";
import { apply } from "../../src/engine";
import { fresh } from "../../src/model";
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
const sockets: Socket[] = [];
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
  for (const socket of sockets.splice(0)) socket.disconnect();
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
  await page.getByRole("button", { name: "Spieler", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Spieler dieser Serverwelt" }),
  ).toBeVisible();
}
async function action(page: Page, action: unknown) {
  return page.evaluate(async (action) => {
    const me = await (await fetch("/api/me")).json();
    const response = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": me.csrf },
      body: JSON.stringify({ id: crypto.randomUUID(), action }),
    });
    return { status: response.status, data: await response.json() };
  }, action);
}

test("echte Präsenz: getrennte Konten, Standortsuche, Tabs, Grace, Berechtigungen und Neustart", async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const second = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
    }),
    b = await second.newPage();
  await page.setViewportSize({ width: 1600, height: 1000 });
  try {
    await enter(page, "presence-owner");
    await enter(b, "presence-guest");
    await openPlayers(page);
    await openPlayers(b);
    const panel = page.locator(".presence-panel"),
      guestPanel = b.locator(".presence-panel");
    await expect(panel.locator(".presence-heading")).toContainText(
      "2 Spieler · 2 Leitstellen",
    );
    await expect(guestPanel).toContainText("Anna Nord");
    await expect(panel.locator(".presence-own-desk")).toContainText(
      "Anna Nord",
    );
    await expect(
      panel.locator(".presence-desk").filter({ hasText: "Ben Süd" }),
    ).toContainText("Noch kein Wachenstandort gewählt");
    await expect(
      panel
        .locator(".presence-desk")
        .filter({ hasText: "Ben Süd" })
        .getByRole("button"),
    ).toHaveCount(0);
    await panel.getByLabel("Spieler suchen").fill("süd");
    await expect(panel.locator(".presence-desk")).toHaveCount(1);
    await panel.getByLabel("Spieler suchen").fill("");
    await panel.getByLabel("Spielerfilter").selectOption("unplaced");
    await expect(panel.locator(".presence-desk")).toHaveCount(1);
    await panel.getByLabel("Spielerfilter").selectOption("mine");
    await expect(panel.locator(".presence-desk")).toHaveCount(1);
    await panel.getByLabel("Spielerfilter").selectOption("all");
    await page.screenshot({
      path: info.outputPath("presence-two-real-accounts.png"),
    });
    const before = await b.evaluate(async () => {
      const v = await (await fetch("/api/me")).json();
      return {
        owner: v.save.player.id,
        buildings: v.save.buildings.length,
        vehicles: v.save.vehicles.length,
        friends: v.network.friends.length,
      };
    });
    expect(before).toEqual({
      owner: guest,
      buildings: 0,
      vehicles: 0,
      friends: 0,
    });
    const target = app.db.all().get(owner)!.buildings[0];
    expect(
      (await action(b, { type: "rename", id: target.id, name: "Unbefugt" }))
        .status,
    ).toBe(400);
    await b.evaluate(() =>
      window.addEventListener("lv:map-focus", (event) => {
        (
          window as unknown as { lastPresenceFocus: unknown }
        ).lastPresenceFocus = (event as CustomEvent).detail;
      }),
    );
    await guestPanel.getByRole("button", { name: /Auf Karte zeigen/ }).click();
    await expect(guestPanel).toHaveCount(0);
    expect(
      await b.evaluate(
        () =>
          (window as unknown as { lastPresenceFocus: unknown })
            .lastPresenceFocus,
      ),
    ).toEqual({ point: target.pos });
    expect(app.db.all().get(owner)!.buildings[0].name).toBe("Echte Nordwache");
    const extra = await page.context().newPage();
    await extra.goto(config.publicUrl);
    await extra.getByRole("button", { name: "Spielen", exact: true }).click();
    await expect(panel.locator(".presence-heading")).toContainText(
      "2 Spieler · 2 Leitstellen",
    );
    await extra.close();
    await expect(panel.locator(".presence-own-desk")).toContainText("Online");
    await second.setOffline(true);
    await expect(
      panel.locator(".presence-desk").filter({ hasText: "Ben Süd" }),
    ).toContainText("Verbindet neu");
    await second.setOffline(false);
    await expect(
      panel.locator(".presence-desk").filter({ hasText: "Ben Süd" }),
    ).toContainText("Online");
    expect(
      (
        await action(page, {
          type: "member-invite",
          username: "presence-guest",
        })
      ).status,
    ).toBe(200);
    expect((await action(b, { type: "member-accept", owner })).status).toBe(
      200,
    );
    await expect(panel.locator(".presence-heading")).toContainText(
      "2 Spieler · 1 Leitstelle",
    );
    await expect(panel.locator(".presence-own-desk")).toContainText("Ben Süd");
    expect(
      (await action(page, { type: "member-remove", user: guest })).status,
    ).toBe(200);
    await expect(panel.locator(".presence-heading")).toContainText(
      "2 Spieler · 2 Leitstellen",
    );
    await app.close();
    app = await createBrowserServer(compiled.startServer, config);
    await app.listen();
    await page.reload();
    await page.getByRole("button", { name: "Spielen", exact: true }).click();
    await openPlayers(page);
    await b.reload();
    await b.getByRole("button", { name: "Spielen", exact: true }).click();
    await expect(page.locator(".presence-heading")).toContainText(
      "2 Spieler · 2 Leitstellen",
    );
    await expect(page.locator(".presence-panel")).toContainText(
      "Echte Nordwache",
    );
    await b.evaluate(async () => {
      const me = await (await fetch("/api/me")).json();
      await fetch("/api/logout-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": me.csrf,
        },
        body: "{}",
      });
    });
    await expect(page.locator(".presence-heading")).toContainText(
      "1 Spieler · 1 Leitstelle",
    );
    await expect(
      b.getByRole("button", { name: "Anmelden", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await second.close();
  }
});

test("vollständige Spielerübersicht bleibt bei vielen echten Verbindungen suchbar und blätterbar", async ({
  page,
}, info) => {
  await enter(page, "presence-owner");
  for (let index = 0; index < 34; index++) {
    const save = fresh(
        `Disponent ${String(index).padStart(2, "0")}`,
        `Weltleitstelle ${String(index).padStart(2, "0")}`,
        Date.now() / 1000,
      ),
      id = save.player.id;
    save.missionWait = 100000;
    app.db.sql
      .prepare(
        "INSERT INTO users(id,username,password,role,created) VALUES(?,?,?,'player',?)",
      )
      .run(
        id,
        `batch-${index}`,
        "No login allowed in synthetic account fixture",
        Date.now(),
      );
    app.db.save(id, save);
    const session = app.auth.issue(id),
      socket = io(config.publicUrl, {
        autoConnect: false,
        transports: ["websocket"],
        reconnection: false,
        extraHeaders: {
          Origin: config.publicUrl,
          Cookie: `lv_session=${session.value}`,
        },
        auth: { csrf: session.csrf, mode: "multi" },
      });
    sockets.push(socket);
    await new Promise<void>((done, reject) => {
      socket.once("presence", () => done());
      socket.once("connect_error", reject);
      socket.connect();
    });
  }
  await openPlayers(page);
  const panel = page.locator(".presence-panel");
  await expect(panel.locator(".presence-heading")).toContainText(
    "35 Spieler · 35 Leitstellen",
  );
  await expect(panel.locator(".presence-desk")).toHaveCount(16);
  await expect(panel.getByRole("navigation")).toContainText("Seite 1 von 3");
  await panel.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(panel.getByRole("navigation")).toContainText("Seite 2 von 3");
  await panel.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(panel.locator(".presence-desk")).toHaveCount(3);
  await panel.getByLabel("Spieler suchen").fill("Disponent 33");
  await expect(panel.locator(".presence-desk")).toHaveCount(1);
  await expect(panel.locator(".presence-results")).toContainText(
    "1 von 35 Spielern",
  );
  await expect(panel).toContainText("Weltleitstelle 33");
  await page.screenshot({
    path: info.outputPath("presence-last-player-search.png"),
  });
  await panel.getByLabel("Spieler suchen").fill("Nicht vorhanden");
  await expect(panel).toContainText("Keine Spieler passen zur Suche.");
});
