import { it, expect } from "vitest";
import { Database } from "../src/server/database";
import { fresh } from "../src/shared/model";
import { BugReports, reportToken } from "../src/server/bug-reports";
import { cleanReport } from "../src/shared/bug-report";
const input = {
  title: "Fahrzeuganzeige bleibt stehen",
  description: "Nach der Disposition bleibt die Anzeige stehen.",
  steps: "Fahrzeug wählen und alarmieren",
  expected: "Aktuelle Fahrt",
  actual: "Alte Anzeige",
  technical: true,
};
function setup() {
  const db = new Database("", { memory: true });
  for (const id of ["reporter", "foreign"]) {
    db.sql
      .prepare("INSERT INTO users VALUES (?,?,?,?,?)")
      .run(id, id, "unused", "player", 0);
    const s = fresh(id, "Nord", 1000);
    s.player.id = id;
    db.save(id, s);
  }
  return db;
}
it("redigiert Zugangsdaten, persönliche Angaben, Links und Mentions vor dem Speichern", () => {
  const v = cleanReport({
    ...input,
    description:
      "@everyone mail@private.de 192.168.1.2 https://private.invalid?token=secret\nAuthorization: Bearer secret\nC:\\Users\\private\\secret.env",
  });
  expect(v.description).not.toMatch(/@|mail@|192\.168|https:|secret|C:\\Users/);
  expect(() => cleanReport({ ...input, token: "secret" })).toThrow();
  expect(() => reportToken("ghp_unscoped_secret")).toThrow();
});
it("behauptet ohne Token keinen Versand und beschränkt Zugriff und Warteschlange", async () => {
  const db = setup();
  try {
    const b = new BugReports(db.sql);
    const p = b.prepare("reporter", input);
    expect((await b.submit("reporter", p.id)).status).toBe("prepared");
    expect(b.configured()).toBe(false);
    expect(b.prepare("reporter", input).id).toBe(p.id);
    expect(() => b.read("foreign", p.id)).toThrow();
    for (let i = 1; i < 10; i++)
      b.prepare("reporter", { ...input, title: `Anderer Fehler ${i}` });
    expect(() =>
      b.prepare("reporter", { ...input, title: "Elfter Fehler" }),
    ).toThrow(/limit/);
    expect(b.list("foreign")).toEqual([]);
  } finally {
    db.close();
  }
});
it("veröffentlicht bei parallelen Doppelklicks genau einmal und behält den Beleg nach Neustart", async () => {
  const db = setup();
  let calls = 0;
  const request: typeof fetch = async (url, init) => {
    calls++;
    expect(String(url)).toBe(
      "https://api.github.com/repos/Philipp284868/Leitstellen-Verbund/issues",
    );
    expect(init?.redirect).toBe("error");
    expect(JSON.parse(String(init?.body)).body).not.toContain("@everyone");
    await new Promise((r) => setTimeout(r, 10));
    return Response.json({ number: 88 }, { status: 201 });
  };
  try {
    const b = new BugReports(db.sql, "test-injected", request);
    const p = b.prepare("reporter", input);
    const results = await Promise.all([
      b.submit("reporter", p.id),
      b.submit("reporter", p.id),
    ]);
    expect(calls).toBe(1);
    expect(results.every((r) => r.issue === 88)).toBe(true);
    const restarted = new BugReports(db.sql, "test-injected", request);
    expect((await restarted.submit("reporter", p.id)).issue).toBe(88);
    expect(calls).toBe(1);
  } finally {
    db.close();
  }
});
it("gleicht unklare Timeouts ab ohne einen zweiten POST und findet auch geschlossene Issues", async () => {
  const db = setup();
  let now = 100000,
    posts = 0,
    found = false;
  const request: typeof fetch = async (_url, init) => {
    if (init?.method === "POST") {
      posts++;
      throw Error("sensitive raw upstream");
    }
    return Response.json(
      found ? [{ number: 91, body: `<!-- lv-report:${id} -->` }] : [],
    );
  };
  let id = "";
  try {
    const b = new BugReports(db.sql, "test", request, () => now);
    id = b.prepare("reporter", input).id;
    expect((await b.submit("reporter", id)).status).toBe("uncertain");
    now += 61000;
    expect((await b.submit("reporter", id)).status).toBe("uncertain");
    expect(posts).toBe(1);
    now += 61000;
    found = true;
    expect((await b.submit("reporter", id)).issue).toBe(91);
    expect(posts).toBe(1);
  } finally {
    db.close();
  }
});
for (const status of [403, 429, 500, 401])
  it(`behandelt GitHub ${status} begrenzt und ohne Erfolgsmeldung`, async () => {
    const db = setup();
    let now = 0,
      posts = 0;
    const request: typeof fetch = async () => {
      posts++;
      return Response.json(
        { message: "upstream-secret" },
        { status, headers: { "retry-after": "120" } },
      );
    };
    try {
      const b = new BugReports(db.sql, "test", request, () => now);
      const p = b.prepare("reporter", input);
      const r = await b.submit("reporter", p.id);
      expect(r.status).toBe(
        status === 500 ? "uncertain" : status === 401 ? "blocked" : "retry",
      );
      expect(r.issue).toBeNull();
      expect(JSON.stringify(r)).not.toContain("upstream-secret");
      await b.submit("reporter", p.id);
      expect(posts).toBe(1);
      now += 3100000000;
      expect(b.list("reporter")).toHaveLength(1);
      new BugReports(db.sql, "test", request, () => now);
      expect(b.list("reporter")).toHaveLength(0);
    } finally {
      db.close();
    }
  });
