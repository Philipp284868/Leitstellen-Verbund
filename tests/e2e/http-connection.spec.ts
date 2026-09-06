import { test, expect, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";

const compiled = (await import(pathToFileURL(resolve("dist/server/index.js")).href)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, origin: string, directory: string;
const password = "Isolated-http-browser-test-829!";
test.beforeAll(async () => {
  // Use a real non-loopback HTTP origin. localhost would conceal the browser restrictions.
  const address = Object.values(networkInterfaces()).flat().find((entry) => entry?.family === "IPv4" && !entry.internal)?.address;
  if (!address) throw Error("HTTP-Browserabnahme benötigt eine lokale Nicht-Loopback-IPv4-Adresse.");
  directory = await mkdtemp(resolve(tmpdir(), "lv-http-browser-"));
  const port = 33000 + Math.floor(Math.random() * 20000);
  origin = `http://${address}:${port}`;
  app = compiled.startServer({ host: address, port, publicUrl: origin, dataDir: directory, secure: false, trustedProxies: [] });
  await app.listen();
});
test.afterAll(async () => {
  if (app) await app.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function register(page: Page, label: string) {
  await page.goto(origin);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  await page.getByRole("button", { name: "Neues Konto erstellen", exact: true }).click();
  await page.getByLabel("Benutzername", { exact: true }).fill(label.toLowerCase() + "-" + crypto.randomUUID().slice(0, 8));
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByLabel("Dein Anzeigename").fill(label);
  await page.getByLabel("Name deiner Leitstelle").fill("Leitstelle " + label);
  await page.getByRole("button", { name: "Konto erstellen", exact: true }).click();
  await page.getByRole("button", { name: "Leitstelle öffnen", exact: false }).click();
  await expect(page.locator(".radio-bar")).toContainText("Mit Spielserver verbunden");
  await expect(page.locator(".banner")).toHaveCount(0);
}

test("Echter HTTP-Ursprung: Registrierung, WebSocket, Kauf, Chat und manueller Reconnect ohne Lockerung des Servers", async ({ browser }) => {
  const ca = await browser.newContext(), cb = await browser.newContext();
  try {
    const a = await ca.newPage(), b = await cb.newPage();
    const errors: string[] = [];
    a.on("pageerror", (error) => errors.push(error.message));
    b.on("pageerror", (error) => errors.push(error.message));
    await register(a, "HttpAnna");
    await register(b, "HttpBen");
    await expect.poll(() => app.io.sockets.sockets.size).toBe(2);
    expect([...app.io.sockets.sockets.values()].every((socket) => socket.conn.transport.name === "websocket")).toBe(true);
    expect([...app.io.sockets.sockets.values()].every((socket) => socket.handshake.headers.origin === origin)).toBe(true);

    // Reproduce the old polling rejection: request without Origin/Fetch-Metadata remains forbidden.
    const legacy = await fetch(origin + "/socket.io/?EIO=4&transport=polling");
    expect(legacy.status).toBe(403);
    await a.getByLabel("Spielgeschwindigkeit").selectOption("32");
    await a.locator(".bottom-panel").getByRole("button", { name: "Wache bauen" }).click();
    await a.locator(".shop-card").filter({ has: a.getByRole("heading", { name: "Feuerwache", exact: true }) }).getByRole("button", { name: "Platzieren" }).click();
    await a.locator("svg.map").click({ position: { x: 80, y: 130 } });
    await expect(a.locator(".station-strip .station-card")).toHaveCount(1);
    await expect(a.locator(".money")).toContainText("195.000");
    await expect(b.locator(".station-strip .station-card")).toHaveCount(0);
    await expect(b.locator(".money")).toContainText("250.000");

    await a.getByRole("button", { name: "Freunde", exact: true }).click();
    await b.getByRole("button", { name: "Freunde", exact: true }).click();
    await a.getByLabel("Chatnachricht").fill("HTTP-Verbindung erfolgreich");
    await a.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(b.locator(".chat-log")).toContainText("HTTP-Verbindung erfolgreich");
    await a.getByRole("button", { name: "Schließen", exact: true }).click();

    // Simulate a stopped client connection without an automatic online event.
    await a.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(a.locator(".banner")).toBeVisible();
    await a.getByRole("button", { name: "Fortschritt", exact: true }).click();
    await a.getByRole("button", { name: "Bereitschaftsdienst übernehmen", exact: false }).click();
    await expect(a.getByRole("alert")).toContainText("Keine Serververbindung");
    await a.getByRole("button", { name: "Schließen", exact: true }).last().click();
    await a.getByRole("button", { name: "Server erneut verbinden", exact: true }).click();
    await expect(a.locator(".banner")).toHaveCount(0);
    await expect(a.locator(".radio-bar")).toContainText("Mit Spielserver verbunden");
    await a.getByLabel("Spielgeschwindigkeit").selectOption("16");
    await expect.poll(() => Array.from(app.db.all().values()).find((save) => save.player.name === "HttpAnna")?.speed).toBe(16);
    expect(errors).toEqual([]);
  } finally {
    await ca.close();
    await cb.close();
  }
});
