import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import { listenBrowserServer } from "./server-helper";

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
  if (save.economy) save.economy.fundingNextAt = 1e12;
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
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
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

test("Support behandelt tatsächlich verweigerte Clipboard-Berechtigung mit manuellem Fallback und kopiert nach Freigabe erfolgreich", async ({
  page,
  context,
  browserName,
}, info) => {
  // Chromium exposes a real deny/grant permission override. Firefox has no
  // equivalent Playwright/CDP API; the API-unavailable fallback is tested there below.
  test.skip(
    browserName !== "chromium",
    "Echte negative Clipboard-Berechtigung benötigt Chromiums Permission-Override.",
  );
  await login(page);
  await page.getByRole("button", { name: "Support", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Support", exact: true });
  const technical = dialog.getByRole("textbox", {
    name: "Technische Angaben",
    exact: true,
  });
  const cdp = await context.newCDPSession(page);
  const { targetInfo } = await cdp.send("Target.getTargetInfo");
  const scope = { origin, browserContextId: targetInfo.browserContextId };
  await cdp.send("Browser.setPermission", {
    ...scope,
    permission: { name: "clipboard-write" },
    setting: "denied",
  });
  expect(
    await page.evaluate(
      async () =>
        (
          await navigator.permissions.query({
            name: "clipboard-write" as PermissionName,
          })
        ).state,
    ),
  ).toBe("denied");
  await dialog
    .getByRole("button", { name: "Angaben kopieren", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Strg+C");
  await expect(
    dialog.getByText("Technische Angaben kopiert.", { exact: true }),
  ).toHaveCount(0);
  await expect(technical).toHaveAttribute("readonly", "");
  await technical.focus();
  await page.keyboard.press("Control+A");
  const selected = await technical.evaluate((input: HTMLTextAreaElement) =>
    input.value.slice(input.selectionStart, input.selectionEnd),
  );
  expect(selected).toContain("Leitstellen-Verbund");
  expect(selected).toContain("Browser:");
  expect(selected).not.toContain(username);
  expect(selected).not.toContain(owner);
  expect(selected).not.toContain(password);
  await page.screenshot({
    path: info.outputPath("support-clipboard-denied-fallback.png"),
  });
  await cdp.send("Browser.setPermission", {
    ...scope,
    permission: { name: "clipboard-write" },
    setting: "granted",
  });
  await cdp.send("Browser.setPermission", {
    ...scope,
    permission: { name: "clipboard-read" },
    setting: "granted",
  });
  const previous = await technical.inputValue();
  await dialog
    .getByRole("button", { name: "Angaben kopieren", exact: true })
    .click();
  await expect(
    dialog.getByText("Technische Angaben kopiert.", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard.split(/\r?\n/).slice(0, 4)).toEqual(
    previous.split(/\r?\n/).slice(0, 4),
  );
  expect(clipboard).not.toContain(owner);
  expect(clipboard).not.toContain(username);
  await page.screenshot({
    path: info.outputPath("support-clipboard-success.png"),
  });
  await cdp.send("Browser.setPermission", {
    ...scope,
    permission: { name: "clipboard-write" },
    setting: "denied",
  });
  await dialog
    .getByRole("button", { name: "Angaben kopieren", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Strg+C");
  await expect(
    dialog.getByText("Technische Angaben kopiert.", { exact: true }),
  ).toHaveCount(0);
  await cdp.detach();
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
    dialog.getByRole("link", { name: "Fehler im Projekt melden", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://github.com/Philipp284868/Leitstellen-Verbund/issues",
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
    const map = page.locator("svg.map");
    await expect(map).toBeVisible();
    const oldCamera = await map.getAttribute("viewBox");
    await page.mouse.move(1000, 440);
    await page.mouse.wheel(0, -240);
    await expect.poll(() => map.getAttribute("viewBox")).not.toBe(oldCamera);
    const camera = await map.getAttribute("viewBox");
    await page.getByRole("button", { name: "Hauptmenü", exact: true }).click();
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
    await expect(map).toHaveAttribute("viewBox", camera!);
    expect(app.auth.session(firstCookie)?.user_id).toBe(owner);
    const before = app.db.all().get(owner)!;
    const game = {
      money: before.money,
      xp: before.xp,
      buildings: before.buildings,
      vehicles: before.vehicles,
    };
    await page.getByRole("button", { name: "Hauptmenü", exact: true }).click();
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
      page.locator(".command-menu, .hud-budget, svg.map"),
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
