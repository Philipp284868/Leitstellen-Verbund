// CDP deny/grant is Chromium-specific. Common clipboard fallback remains in account-support for both engines.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import { listenBrowserServer } from "./server-helper";
import { expect, test, type Page } from "./test";

const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
let app: ReturnType<typeof startServer>, origin: string, owner: string;
const username = "account-review",
  password = "Account-review-initial-284!";
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
test("Support behandelt tatsächlich verweigerte Clipboard-Berechtigung mit manuellem Fallback und kopiert nach Freigabe erfolgreich", async ({
  page,
  context,
}, info) => {
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
