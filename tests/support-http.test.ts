import { it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./fixtures/germany/server";
it("schützt Berichtsvorschau und Veröffentlichung durch Sitzung, Origin, CSRF und feste Felder", async () => {
  const c = {
    dataDir: mkdtempSync(join(tmpdir(), "lv-reporter-http-")),
    port: 0,
    publicUrl: "http://127.0.0.1:0",
    host: "127.0.0.1",
    secure: false,
    trustedProxies: [],
  };
  const app = startServer(c);
  await app.listen();
  c.publicUrl = `http://127.0.0.1:${(app.http.address() as { port: number }).port}`;
  const post = (
    path: string,
    data: unknown,
    cookie = "",
    csrf = "",
    origin = c.publicUrl,
  ) =>
    fetch(c.publicUrl + "/api/" + path, {
      method: "POST",
      headers: {
        origin,
        cookie,
        "content-type": "application/json",
        "x-csrf-token": csrf,
      },
      body: JSON.stringify(data),
    });
  const input = {
    title: "Anzeige fehlerhaft",
    description: "Fehler bei der Fahrzeuganzeige.",
    steps: "",
    expected: "",
    actual: "",
    technical: true,
  };
  try {
    expect((await post("reports/preview", input)).status).toBe(401);
    const login = await post("register", {
      username: "report-http",
      password: "Reporting-test-password!",
      name: "Test",
      station: "Nord",
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const me = await (
      await fetch(c.publicUrl + "/api/me", { headers: { cookie } })
    ).json();
    expect((await post("reports/preview", input, cookie)).status).toBe(403);
    expect(
      (
        await post(
          "reports/preview",
          input,
          cookie,
          me.csrf,
          "https://evil.invalid",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await post(
          "reports/preview",
          { ...input, repository: "foreign/repo" },
          cookie,
          me.csrf,
        )
      ).status,
    ).toBe(400);
    const preview = await post("reports/preview", input, cookie, me.csrf);
    expect(preview.status).toBe(200);
    const p = await preview.json();
    expect(p.configured).toBe(false);
    expect(
      (
        await post(
          "reports/submit",
          { id: p.id, publish: false },
          cookie,
          me.csrf,
        )
      ).status,
    ).toBe(400);
    const noToken = await (
      await post("reports/submit", { id: p.id, publish: true }, cookie, me.csrf)
    ).json();
    expect(noToken.status).toBe("prepared");
    expect(noToken.url).toBeNull();
    expect(
      (
        await post(
          "reports/preview",
          { ...input, description: "x".repeat(40000) },
          cookie,
          me.csrf,
        )
      ).status,
    ).toBe(400);
    expect((await fetch(c.publicUrl + "/api/leaderboard")).status).toBe(401);
    const board = await (
      await fetch(c.publicUrl + "/api/leaderboard", { headers: { cookie } })
    ).json();
    expect(board.items).toHaveLength(1);
    expect(JSON.stringify(board)).not.toMatch(/password|csrf|cookie|session/);
  } finally {
    await app.close();
  }
});
