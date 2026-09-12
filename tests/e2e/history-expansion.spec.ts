import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Config } from "../../src/server/config";
import type { startServer } from "../../src/server/index";
import { priorities } from "../../src/simulation/priority";
import { activeMissionsFixture, historyFixture } from "../history-fixture";
import { createBrowserServer, listenBrowserServer } from "./server-helper";
import { expect, test } from "./test";
import { enterGame, openPanel, showIncidents } from "./ui-navigation";

const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
const password = "History-browser-password-284!";
let app: ReturnType<typeof startServer>, config: Config, owner: string;
test.beforeEach(async () => {
  config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-history-browser-")),
    secure: false,
    trustedProxies: [],
  };
  app = await listenBrowserServer(compiled.startServer, config);
  owner = await app.auth.create("archive-test", password, "Nord", "Nord");
  const s = activeMissionsFixture(owner, 73);
  s.archive = historyFixture(owner, 137).archive;
  s.completed = 137;
  s.missionWait = 600;
  s.vehicles[0].reserve = true;
  app.db.save(owner, s);
});
test.afterEach(async () => {
  await app.close();
});

test("73 aktive Einsätze, sechs Prioritäten, Reservehinweis und 137 dauerhaft paginierte Berichte", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(config.publicUrl);
  await page.getByLabel("Benutzername", { exact: true }).fill("archive-test");
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await enterGame(page);
  await showIncidents(page);
  const pagination = page.getByRole("navigation", { name: "Einsatzseiten" });
  await expect(pagination).toContainText("1/3 · 73 Einsätze");
  await expect(page.locator(".mission-card")).toHaveCount(25);
  await expect(
    page.locator(".mission-card .priority-badge").first(),
  ).toHaveText("NOTFALL");
  const seen = new Set<string>();
  for (let index = 0; index < 3; index++) {
    for (const priority of await page
      .locator(".mission-card .priority-badge")
      .allTextContents())
      seen.add(priority);
    if (index < 2)
      await pagination
        .getByRole("button", { name: "Weiter", exact: true })
        .click();
  }
  await expect(page.locator(".mission-card")).toHaveCount(23);
  await expect(
    pagination.getByRole("button", { name: "Weiter", exact: true }),
  ).toBeDisabled();
  expect([...seen].sort()).toEqual([...priorities].sort());
  await showIncidents(page);
  await page.locator(".mission-card").first().click();
  const priority = page.getByLabel("Priorität", { exact: true });
  await expect(priority.locator("option")).toHaveText([...priorities]);
  const reserve = page
    .locator(".dispatch-list label")
    .filter({ hasText: "HLF" })
    .first();
  await expect(reserve).toContainText("Reserve");
  await expect(reserve.locator("input")).toBeEnabled();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await openPanel(page, "Archiv");
  const archive = page.locator(".archive-console"),
    archivePages = page.getByRole("navigation", { name: "Archivseiten" });
  await expect(archive).toContainText("137 passende Berichte");
  await expect(page.locator(".archive-item")).toHaveCount(25);
  for (let index = 0; index < 5; index++) {
    await archivePages
      .getByRole("button", { name: "Weitere Berichte", exact: true })
      .click();
    await expect(archivePages).toContainText(`Seite ${index + 2}/6`);
  }
  await expect(page.locator(".archive-item")).toHaveCount(12);
  await page
    .locator(".archive-item")
    .last()
    .getByRole("button", { name: "Verlauf ansehen", exact: true })
    .click();
  const oldReport = page.getByRole("region", {
    name: "Archivierter Einsatzverlauf",
  });
  await expect(oldReport).toContainText(`history-${owner}-0000`);
  await expect(
    oldReport.getByRole("region", { name: "Einsatzbericht", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await oldReport
    .getByRole("button", { name: "Bericht als JSON", exact: true })
    .click();
  const document = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(JSON.stringify(document)).not.toContain('"secret"');
  expect(JSON.stringify(document)).not.toContain('"pending"');
  await oldReport
    .getByRole("button", { name: "Archivbericht schließen", exact: true })
    .click();
  await page
    .getByLabel("Einsatz, Stichwort oder Fahrzeug suchen")
    .fill("ARCHIV-SONDERFAHRZEUG");
  await expect(archive).toContainText("14 passende Berichte");
  await expect(page.locator(".archive-item")).toHaveCount(14);
  await page.screenshot({
    path: info.outputPath("archive-pagination-filter.png"),
    fullPage: true,
  });
  await app.close();
  app = await createBrowserServer(compiled.startServer, config);
  await app.listen();
  await page.reload();
  await enterGame(page);
  await page.keyboard.press("h");
  await expect(page.locator(".archive-console")).toContainText(
    "137 passende Berichte",
  );
  expect(app.db.all().get(owner)!.missions.length).toBe(73);
  expect(errors).toEqual([]);
});
