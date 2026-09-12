import { openPanel } from "./ui-navigation";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import { listenBrowserServer } from "./server-helper";
import { expect, test, type BrowserContext, type Page } from "./test";

const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, origin: string, owner: string;
const username = "account-review",
  password = "Account-review-initial-284!",
  replacement = "Account-review-changed-853!";
test.use({ viewport: { width: 1366, height: 768 }, actionTimeout: 12000 });
test.beforeEach(async () => {
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-account-support-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  origin = config.publicUrl;
  owner = await app.auth.create(
    username,
    password,
    "Testdisponent",
    "Leitstelle Kontoprüfung",
  );
  const save = app.db.all().get(owner)!;
  save.missions = [];
  save.missionWait = 100000;
  save.nextMission = save.time + 100000;
  app.db.save(owner, save);
});
test.afterEach(async () => await app.close());
async function login(page: Page, secret = password) {
  await page.goto(origin);
  await page.getByLabel("Benutzername", { exact: true }).fill(username);
  await page.getByLabel("Passwort", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.locator(".command-menu")).toBeVisible();
}
async function account(page: Page) {
  await openPanel(page, "Einstellungen");
  const settings = page.getByRole("dialog", {
    name: "Einstellungen",
    exact: true,
  });
  await settings
    .getByRole("tab", { name: "Hinweise & Hilfe", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "Konto & Sicherheit", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Konto & Sicherheit",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function cookie(context: BrowserContext) {
  return (await context.cookies(origin))
    .map((value) => `${value.name}=${value.value}`)
    .join("; ");
}
const countSessions = () =>
  Number(
    app.db.sql
      .prepare("SELECT count(*) AS n FROM sessions WHERE user_id=?")
      .get(owner)!.n,
  );

for (const operation of ["reset", "delete"] as const)
  test(`Kontoverwaltung: ${operation} mit Passwort, Vorschau, Text und widerrufener Sitzung`, async ({
    page,
  }, info) => {
    await login(page);
    const untrusted = await page.request.post(origin + "/api/account/prepare", {
      headers: { origin, "x-csrf-token": "invalid-csrf" },
      data: { operation, password },
    });
    expect(untrusted.status()).toBe(403);
    expect(app.db.all().has(owner)).toBe(true);
    const dialog = await account(page);
    await dialog
      .getByText("Spielstand zurücksetzen oder Konto löschen", { exact: true })
      .click();
    await dialog.getByLabel("Aktion", { exact: true }).selectOption(operation);
    await dialog
      .getByLabel("Passwort zur Identitätsprüfung", { exact: true })
      .fill(password);
    await dialog
      .getByRole("button", { name: "Betroffene Daten prüfen", exact: true })
      .click();
    const final = dialog.getByRole("button", {
      name: "Endgültig bestätigen",
      exact: true,
    });
    await expect(final).toBeDisabled();
    await dialog
      .getByLabel(/Zur Bestätigung exakt eingeben/)
      .fill(
        `${operation === "reset" ? "ZURÜCKSETZEN" : "LÖSCHEN"} ${username}`,
      );
    await expect(final).toBeDisabled();
    await dialog
      .getByLabel(
        "Ich habe den Umfang geprüft und möchte diese Daten endgültig entfernen.",
        { exact: true },
      )
      .check();
    await page.screenshot({
      path: info.outputPath(`account-${operation}.png`),
      fullPage: true,
    });
    await final.click();
    await expect(
      page.getByRole("button", { name: "Anmelden", exact: true }),
    ).toBeVisible();
    expect(countSessions()).toBe(0);
    const row = app.db.sql
      .prepare("SELECT id FROM users WHERE id=?")
      .get(owner);
    if (operation === "delete") expect(row).toBeUndefined();
    else {
      expect(row).toBeDefined();
      expect(app.db.all().get(owner)!.vehicles).toEqual([]);
      await login(page);
      await expect(page.locator(".command-menu")).toBeVisible();
    }
  });

test("Passwortdialog verhindert Mismatch, erhält Eingaben bei falschem Altpasswort und widerruft beim erfolgreichen Wechsel alle alten Sitzungen", async ({
  page,
  browser,
}, info) => {
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await login(page);
    await login(other);
    const firstCookie = await cookie(page.context()),
      secondCookie = await cookie(otherContext);
    expect(countSessions()).toBe(2);
    const before = app.db.sql
      .prepare("SELECT password FROM users WHERE id=?")
      .get(owner)!.password;
    const requests: number[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/password")) requests.push(1);
    });
    const dialog = await account(page);
    await expect(dialog).toContainText(username);
    await expect(dialog).toContainText("Spieler");
    const current = dialog.getByLabel("Aktuelles Passwort", { exact: true });
    const next = dialog.getByLabel("Neues Passwort", { exact: true });
    const repeat = dialog.getByLabel("Neues Passwort wiederholen", {
      exact: true,
    });
    const submit = dialog.getByRole("button", {
      name: "Passwort ändern und Sitzungen widerrufen",
      exact: true,
    });
    await current.fill("Incorrect-old-password-000!");
    await next.fill(replacement);
    await repeat.fill("Mismatch-other-password-111!");
    await expect(dialog.getByRole("alert")).toContainText(
      "stimmen noch nicht überein",
    );
    await expect(submit).toBeDisabled();
    await repeat.press("Enter");
    expect(requests).toHaveLength(0);
    expect(
      app.db.sql.prepare("SELECT password FROM users WHERE id=?").get(owner)!
        .password,
    ).toBe(before);
    await repeat.fill(replacement);
    await submit.click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Aktuelles Passwort stimmt nicht",
    );
    expect(requests).toHaveLength(1);
    await expect(current).toHaveValue("Incorrect-old-password-000!");
    await expect(next).toHaveValue(replacement);
    await expect(repeat).toHaveValue(replacement);
    expect(countSessions()).toBe(2);
    expect(
      app.db.sql.prepare("SELECT password FROM users WHERE id=?").get(owner)!
        .password,
    ).toBe(before);
    await page.screenshot({
      path: info.outputPath("account-password-correctable-error.png"),
    });
    await current.fill(password);
    await submit.click();
    await expect(
      page.getByLabel("Benutzername", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Passwort", { exact: true })).toHaveValue("");
    expect(requests).toHaveLength(2);
    expect(countSessions()).toBe(0);
    expect(app.auth.session(firstCookie)).toBeNull();
    expect(app.auth.session(secondCookie)).toBeNull();
    expect(
      app.db.sql.prepare("SELECT password FROM users WHERE id=?").get(owner)!
        .password,
    ).not.toBe(before);
    await other.reload();
    await expect(
      other.getByLabel("Benutzername", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Benutzername", { exact: true }).fill(username);
    await page.getByLabel("Passwort", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(".command-menu")).toHaveCount(0);
    await page.getByLabel("Passwort", { exact: true }).fill(replacement);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(page.locator(".command-menu")).toBeVisible();
    expect(countSessions()).toBe(1);
    expect(app.db.all().get(owner)!.player.id).toBe(owner);
  } finally {
    await otherContext.close();
  }
});

test("Passwortentwurf lässt sich weiter bearbeiten oder verwerfen; erneutes Öffnen enthält keine alten Geheimnisse", async ({
  page,
}, info) => {
  await login(page);
  const requests: number[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/password")) requests.push(1);
  });
  let dialog = await account(page);
  await dialog.getByLabel("Aktuelles Passwort", { exact: true }).fill(password);
  await dialog.getByLabel("Neues Passwort", { exact: true }).fill(replacement);
  await dialog
    .getByLabel("Neues Passwort wiederholen", { exact: true })
    .fill(replacement);
  await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
  const guard = page.getByRole("alertdialog", {
    name: "Ungespeicherte Änderungen",
    exact: true,
  });
  await expect(guard).toBeVisible();
  await guard
    .getByRole("button", { name: "Weiter bearbeiten", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Neues Passwort", { exact: true }),
  ).toHaveValue(replacement);
  await page.keyboard.press("Escape");
  await expect(guard).toBeVisible();
  await page.screenshot({ path: info.outputPath("account-draft-guard.png") });
  await guard
    .getByRole("button", { name: "Änderungen verwerfen", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  dialog = await account(page);
  for (const name of [
    "Aktuelles Passwort",
    "Neues Passwort",
    "Neues Passwort wiederholen",
  ])
    await expect(dialog.getByLabel(name, { exact: true })).toHaveValue("");
  expect(requests).toHaveLength(0);
  expect(countSessions()).toBe(1);
});

test("Support ohne Clipboard-API bietet weiterhin auswählbaren manuellen Text und löst keine Serveraktion aus", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    }),
  );
  await login(page);
  const actions: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") actions.push(request.url());
  });
  await page.getByRole("button", { name: "Support", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Support", exact: true });
  await dialog
    .getByRole("button", { name: "Angaben kopieren", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Strg+C");
  await expect(
    dialog.getByRole("textbox", { name: "Technische Angaben", exact: true }),
  ).toHaveValue(/Leitstellen-Verbund/);
  await expect(
    dialog.getByRole("link", { name: "Normaler GitHub-Meldeweg", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://github.com/Philipp284868/Leitstellen-Verbund/issues/new/choose",
  );
  expect(actions).toEqual([]);
});

test("Spiel verlassen kann zur Karte zurückkehren; bestätigte Abmeldung widerruft nur diese Sitzung und erhält den Spielstand", async ({
  page,
  browser,
}, info) => {
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await login(page);
    await login(other);
    const firstCookie = await cookie(page.context()),
      otherCookie = await cookie(otherContext);
    await page.getByRole("button", { name: "Spielen", exact: true }).click();
    const map = page.locator("[data-testid=germany-map-viewport]");
    await expect(map).toBeVisible();
    const oldCamera = await map.getAttribute("data-camera");
    await page.mouse.move(1000, 440);
    await page.mouse.wheel(0, -240);
    await expect
      .poll(() => map.getAttribute("data-camera"))
      .not.toBe(oldCamera);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(localStorage)
            .filter((k) => k.startsWith("lv-germany-camera-v1:"))
            .map((k) => JSON.parse(localStorage.getItem(k)!))
            .some((c) => c.zoom > 6),
        ),
      )
      .toBe(true);
    await expect(map).toHaveAttribute("data-camera-moving", "false");
    const camera = await map.getAttribute("data-camera");
    await openPanel(page, "Zurück zum Hauptmenü");
    await page.getByRole("button", { name: "Abmelden", exact: true }).click();
    const exit = page.getByRole("dialog", {
      name: "Spiel verlassen",
      exact: true,
    });
    await expect(exit).toBeVisible();
    expect(countSessions()).toBe(2);
    await exit
      .getByRole("button", { name: "Zurück zum Spiel", exact: true })
      .click();
    await expect(exit).toHaveCount(0);
    await expect(map).toHaveAttribute("data-camera", camera!);
    expect(app.auth.session(firstCookie)?.user_id).toBe(owner);
    const before = app.db.all().get(owner)!;
    const game = {
      money: before.money,
      xp: before.xp,
      buildings: before.buildings,
      vehicles: before.vehicles,
    };
    await openPanel(page, "Zurück zum Hauptmenü");
    await page.getByRole("button", { name: "Abmelden", exact: true }).click();
    await page.screenshot({ path: info.outputPath("exit-confirmation.png") });
    await exit
      .getByRole("button", {
        name: "Abmelden und Spiel verlassen",
        exact: true,
      })
      .click();
    await expect(
      page.getByLabel("Benutzername", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(
        ".command-menu, .money-tile, [data-testid=germany-map-viewport]",
      ),
    ).toHaveCount(0);
    expect(app.auth.session(firstCookie)).toBeNull();
    expect(app.auth.session(otherCookie)?.user_id).toBe(owner);
    expect(countSessions()).toBe(1);
    const after = app.db.all().get(owner)!;
    expect({
      money: after.money,
      xp: after.xp,
      buildings: after.buildings,
      vehicles: after.vehicles,
    }).toEqual(game);
    await other.reload();
    await expect(other.locator(".command-menu")).toBeVisible();
    await login(page);
    expect(app.db.all().get(owner)!.player.id).toBe(owner);
  } finally {
    await otherContext.close();
  }
});
