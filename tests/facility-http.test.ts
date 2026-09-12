import { expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { startServer } from "./fixtures/germany/server";
import { fresh } from "../src/shared/model";
import { hash } from "../src/server/auth";

it("HTTP facilities bypass Game.view, isolate NAT users and return typed non-cacheable 429; purchases stay limited", async () => {
  const app = startServer({
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1",
    dataDir: await mkdtemp(resolve(tmpdir(), "lv-facility-http-")),
    secure: false,
    trustedProxies: [],
  });
  try {
    await app.listen();
    const address = app.http.address();
    if (!address || typeof address === "string") throw Error("port missing");
    const origin = `http://127.0.0.1:${address.port}`;
    for (const id of ["anna", "ben"]) {
      app.db.sql
        .prepare("INSERT INTO users VALUES(?,?,?,'player',0)")
        .run(id, id, "unused");
      const save = fresh(id, id, 1000);
      save.player.id = id;
      app.db.save(id, save);
    }
    const a = app.auth.issue("anna"),
      b = app.auth.issue("ben");
    const request = (query: string, value = a.value, extra = {}) =>
      fetch(`${origin}/api/facilities?${query}`, {
        headers: { cookie: `lv_session=${value}`, ...extra },
      });
    vi.spyOn(app.game, "view").mockImplementation(() => {
      throw Error("world view forbidden");
    });
    const query = "clusters=1&bbox=5,47,16,56&zoom=6";
    const response = await request(query);
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toMatch(/^W\//);
    expect(
      (
        await request(query, a.value, {
          "if-none-match": response.headers.get("etag")!,
        })
      ).status,
    ).toBe(304);
    app.db.sql
      .prepare("INSERT OR REPLACE INTO limits VALUES(?,?,?)")
      .run(hash("facility-map:anna"), 240, Date.now() + 60000);
    const limited = await request(query);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(limited.headers.get("cache-control")).toBe("no-store");
    const payload = await limited.json();
    expect(payload).toMatchObject({
      code: "RATE_LIMITED",
      scope: "facility-map",
    });
    expect(JSON.stringify(payload)).not.toContain("anna");
    expect((await request(query, b.value)).status).toBe(200);
    expect((await request("q=Berlin")).status).toBe(200);
    expect((await request("id=fixture:fire:0")).status).toBe(200);
    app.db.sql
      .prepare("INSERT OR REPLACE INTO limits VALUES(?,?,?)")
      .run(hash("action:anna"), 60, Date.now() + 1000);
    const write = await fetch(`${origin}/api/action`, {
      method: "POST",
      headers: {
        cookie: `lv_session=${a.value}`,
        origin: "http://127.0.0.1",
        "x-csrf-token": a.csrf,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: "unchanged-purchase-limit",
        action: { type: "purchase-facility", facility: "fixture:fire:0" },
      }),
    });
    expect(write.status).toBe(429);
    expect(app.db.all().get("anna")!.buildings).toHaveLength(0);
  } finally {
    vi.restoreAllMocks();
    await app.close();
  }
});
