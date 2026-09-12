import { mkdtemp, rm } from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import { bt } from "../../src/catalog";
import { ECONOMY_PRICES } from "../../src/economy/prices";
import { formatMoney } from "../../src/money";
import { joinDesk } from "./desk-helpers";
import { listenBrowserServer } from "./server-helper";
import { expect, test, type Page } from "./test";
import { openPanel, showMapTools } from "./ui-navigation";

const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, origin: string, directory: string;
const password = "Isolated-http-browser-test-829!";
test.beforeAll(async () => {
  // Use a real non-loopback HTTP origin. localhost would conceal the browser restrictions.
  const address = Object.values(networkInterfaces())
    .flat()
    .find((entry) => entry?.family === "IPv4" && !entry.internal)?.address;
  if (!address)
    throw Error(
      "HTTP-Browserabnahme benötigt eine lokale Nicht-Loopback-IPv4-Adresse.",
    );
  directory = await mkdtemp(resolve(tmpdir(), "lv-http-browser-"));
  const port = 0;
  origin = `http://${address}:${port}`;
  const config = {
    host: address,
    port,
    publicUrl: origin,
    dataDir: directory,
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  origin = config.publicUrl;
});
test.afterAll(async () => {
  if (app) await app.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function register(page: Page, label: string) {
  await page.goto(origin);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  await expect(
    page.getByRole("button", { name: "Neues Konto erstellen", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Neues Konto erstellen", exact: true })
    .click();
  await page
    .getByLabel("Benutzername", { exact: true })
    .fill(label.toLowerCase() + "-" + crypto.randomUUID().slice(0, 8));
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByLabel("Dein Anzeigename").fill(label);
  await page.getByLabel("Name deiner Leitstelle").fill("Leitstelle " + label);
  await page
    .getByRole("button", { name: "Konto erstellen", exact: true })
    .click();
  await page.getByRole("button", { name: "Spielen", exact: false }).click();
  await expect(
    page.getByRole("button", { name: "Leitstellenmenü", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Serververbindung verloren. Bitte die Seite neu laden oder den Support kontaktieren.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".critical-events article")
      .filter({ hasText: "Serververbindung verloren." }),
  ).toHaveCount(0);
}

test("Echter HTTP-Ursprung: Registrierung, WebSocket, Kauf, Chat und manueller Reconnect ohne Lockerung des Servers", async ({
  browser,
}) => {
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  try {
    const a = await ca.newPage(),
      b = await cb.newPage();
    const errors: string[] = [];
    a.on("pageerror", (error) => errors.push(error.message));
    b.on("pageerror", (error) => errors.push(error.message));
    await register(a, "HttpAnna");
    await register(b, "HttpBen");
    await expect.poll(() => app.io.sockets.sockets.size).toBe(2);
    expect(
      [...app.io.sockets.sockets.values()].every(
        (socket) => socket.conn.transport.name === "websocket",
      ),
    ).toBe(true);
    expect(
      [...app.io.sockets.sockets.values()].every(
        (socket) => socket.handshake.headers.origin === origin,
      ),
    ).toBe(true);

    // Reproduce the old polling rejection: request without Origin/Fetch-Metadata remains forbidden.
    const legacy = await fetch(origin + "/socket.io/?EIO=4&transport=polling");
    expect(legacy.status).toBe(403);
    await expect(a.getByLabel("Spielgeschwindigkeit")).toHaveCount(0);
    await showMapTools(a);
    await a.getByLabel("Karte durchsuchen").fill("Straße des 17. Juni");
    await a
      .locator(".map-search-results")
      .getByRole("button", { name: "Straße des 17. Juni street", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          JSON.parse(
            (await a
              .getByTestId("germany-map-viewport")
              .getAttribute("data-camera"))!,
          ).zoom,
      )
      .toBe(14);
    await openPanel(a, "Standorte");
    await a
      .getByRole("button", { name: "Standort kaufen", exact: true })
      .click();
    await a.locator(".facility-result").first().click();
    await a.getByRole("button", { name: /^Kaufen ·/ }).click();
    await a
      .getByRole("button", { name: "Kauf verbindlich bestätigen" })
      .click();
    await expect(
      a.getByRole("button", { name: "Verwalten", exact: true }),
    ).toBeVisible();
    await a
      .getByRole("button", { name: "Standorte direkt auf der Karte auswählen" })
      .click();
    await expect(
      a.locator(
        "[data-testid=germany-map-viewport] [data-testid=map-station]:not(.friend)",
      ),
    ).toHaveCount(1);
    await expect(a.locator(".money-tile strong")).toHaveText(
      formatMoney(ECONOMY_PRICES.start - bt("fire").price),
    );
    await expect(
      b.locator(
        "[data-testid=germany-map-viewport] [data-testid=map-station]:not(.friend)",
      ),
    ).toHaveCount(0);
    await expect(b.locator(".money-tile strong")).toHaveText(
      formatMoney(ECONOMY_PRICES.start),
    );

    const target = String(
      app.db.sql
        .prepare("SELECT username FROM users WHERE username LIKE ?")
        .get("httpben-%")!.username,
    );
    await joinDesk(a, b, target);
    await openPanel(a, "Freunde");
    await openPanel(b, "Freunde");
    await a.getByLabel("Chatnachricht").fill("HTTP-Verbindung erfolgreich");
    await a.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(b.locator(".chat-log")).toContainText(
      "HTTP-Verbindung erfolgreich",
    );
    await a.getByRole("button", { name: "Schließen", exact: true }).click();

    // Simulate a stopped client connection without an automatic online event.
    await a.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(a.locator(".critical-events")).toContainText(
      "Serververbindung verloren.",
    );
    await openPanel(a, "Standorte");
    await a.locator(".station-card").click();
    const ownerState = () =>
      [...app.db.all().values()].find(
        (save) => save.player.name === "HttpAnna",
      )!;
    const originalName = ownerState().buildings[0].name;
    await a.getByRole("button", { name: "Name", exact: true }).click();
    await a
      .getByLabel("Neuer Wachenname", { exact: true })
      .fill("Offlineänderung");
    await a.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(a.getByRole("alert")).toContainText("Keine Serververbindung");
    expect(ownerState().buildings[0].name).toBe(originalName);
    await a.getByRole("button", { name: "Abbrechen", exact: true }).click();
    await a
      .getByRole("button", { name: "Schließen", exact: true })
      .last()
      .click();
    await a
      .getByRole("button", { name: "Seite neu laden", exact: true })
      .click();
    await a.getByRole("button", { name: "Spielen", exact: true }).click();
    await expect(
      a
        .locator(".critical-events article")
        .filter({ hasText: "Serververbindung verloren." }),
    ).toHaveCount(0);
    await expect(
      a.getByRole("button", { name: "Leitstellenmenü", exact: true }),
    ).toBeVisible();
    await expect(
      a.getByText(
        "Serververbindung verloren. Bitte die Seite neu laden oder den Support kontaktieren.",
        { exact: true },
      ),
    ).toHaveCount(0);
    await expect(a.locator(".control-topbar time")).toBeVisible();
    await expect
      .poll(
        () =>
          Array.from(app.db.all().values()).find(
            (save) => save.player.name === "HttpAnna",
          )?.speed,
      )
      .toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await ca.close();
    await cb.close();
  }
});
