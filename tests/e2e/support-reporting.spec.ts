import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { startServer } from "../../server/index";
import { listenBrowserServer } from "./server-helper";
import { test, expect } from "./test";
const compiled = (await import(
  pathToFileURL(resolve("dist/server/index.js")).href
)) as { startServer: typeof startServer };
test("Support veröffentlicht nur die bestätigte Vorschau, zeigt einen dauerhaften Beleg und versendet beim Neuladen nichts erneut", async ({
  page,
}) => {
  const original = globalThis.fetch,
    posts: string[] = [];
  // Every GitHub request is intercepted in the server process. No real Issue or credential.
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://api.github.com/")) {
      expect(url).toBe(
        "https://api.github.com/repos/Philipp284868/Leitstellen-Verbund/issues",
      );
      expect(init?.method).toBe("POST");
      posts.push(String(init?.body));
      return Response.json({ number: 9876 }, { status: 201 });
    }
    return original(input, init);
  };
  const config = {
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-report-browser-")),
    secure: false,
    trustedProxies: [],
    githubIssuesToken: "github_pat_test_only_not_a_real_credential",
  };
  let app: ReturnType<typeof startServer> | undefined;
  try {
    app = await listenBrowserServer(compiled.startServer, config);
    await app.auth.create(
      "reporter",
      "Reporting-browser-password!",
      "Meldeprüfung",
      "Prüfleitstelle",
    );
    await page.goto(config.publicUrl);
    await page.getByLabel("Benutzername", { exact: true }).fill("reporter");
    await page
      .getByLabel("Passwort", { exact: true })
      .fill("Reporting-browser-password!");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await page.getByRole("button", { name: "Support", exact: true }).click();
    await page
      .getByLabel("Titel", { exact: true })
      .fill("Darstellung eines Fahrzeugs fehlerhaft");
    await page
      .getByLabel("Beschreibung", { exact: true })
      .fill(
        "Nach dem Öffnen erscheint ein Darstellungsfehler. token=private-secret @everyone person@example.com",
      );
    await page
      .getByRole("button", { name: "Bereinigte Vorschau", exact: true })
      .click();
    const preview = page.getByRole("article", { name: "Berichtsvorschau" }),
      publish = preview.getByRole("button", {
        name: "Öffentlich veröffentlichen",
        exact: true,
      });
    await expect(preview).not.toContainText("private-secret");
    await expect(preview).not.toContainText("person@example.com");
    await expect(publish).toBeDisabled();
    expect(posts).toHaveLength(0);
    await preview.getByRole("checkbox").check();
    await publish.click();
    await expect(
      preview.getByRole("link", { name: "GitHub-Issue #9876", exact: true }),
    ).toHaveAttribute(
      "href",
      "https://github.com/Philipp284868/Leitstellen-Verbund/issues/9876",
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]).not.toMatch(
      /private-secret|person@example|@everyone|github_pat/,
    );
    await page.reload();
    await page.getByRole("button", { name: "Support", exact: true }).click();
    await page
      .getByText("Meine gespeicherten Berichte", { exact: true })
      .click();
    await page
      .getByRole("button", { name: /Darstellung eines Fahrzeugs fehlerhaft/ })
      .click();
    await expect(
      page.getByRole("link", { name: "GitHub-Issue #9876", exact: true }),
    ).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(
      app.db.sql
        .prepare("SELECT count(*) n FROM game_events WHERE id LIKE 'report:%'")
        .get()!.n,
    ).toBe(1);
  } finally {
    await app?.close();
    globalThis.fetch = original;
  }
});
