import { afterEach, expect, it, vi } from "vitest";
import { Database } from "../src/server/database";
import { Auth, hash } from "../src/server/auth";
import { RateLimitError } from "../src/server/rate-limit";
import { clientAddress, normalizeAddress } from "../src/server/client-address";
import type { IncomingMessage } from "node:http";
import { facilityResponse } from "../src/server/facilities/http";
import { facilityContext } from "../src/server/facilities/context";
import { fresh } from "../src/shared/model";
import { FacilityReader } from "../src/client/facilities/reader";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("a browser cooldown is shared within an account but cannot hold back a different account", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(3000000);
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ scope: "facility-search" }), {
        status: 429,
        headers: { "Retry-After": "5" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const a = new FacilityReader(vi.fn(), vi.fn(), {}, "a");
  const a2 = new FacilityReader(vi.fn(), vi.fn(), {}, "a");
  const b = new FacilityReader(vi.fn(), vi.fn(), {}, "b");
  try {
    a.request("q=one");
    await vi.advanceTimersByTimeAsync(300);
    a2.request("q=two");
    b.request("q=three");
    await vi.advanceTimersByTimeAsync(400);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe("/api/facilities?q=three");
  } finally {
    a.destroy();
    a2.destroy();
    b.destroy();
  }
});
it("keeps rate scopes/users independent, rejected requests do not extend the deadline", () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const db = new Database("unused", { memory: true }),
    auth = new Auth(db);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    auth.limit("facility-map:anna", 1, 1000);
    expect(() => auth.limit("facility-map:anna", 1, 1000)).toThrow(
      RateLimitError,
    );
    auth.limit("facility-map:ben", 1, 1000);
    auth.limit("facility-search:anna", 1, 1000);
    auth.limit("action:anna", 1, 1000);
    for (let i = 0; i < 10; i++)
      expect(() => auth.limit("facility-map:anna", 1, 1000)).toThrow(
        RateLimitError,
      );
    expect(
      db.sql
        .prepare("SELECT count,until_at FROM limits WHERE key=?")
        .get(hash("facility-map:anna")),
    ).toEqual({ count: 1, until_at: 101000 });
    vi.advanceTimersByTime(1001);
    auth.limit("facility-map:anna", 1, 1000);
  } finally {
    db.close();
  }
});
it("canonicalizes trusted immediate peers and validates single IP headers", () => {
  const request = (remote: string, real: string | string[]) =>
    ({
      socket: { remoteAddress: remote },
      headers: { "x-real-ip": real },
    }) as unknown as IncomingMessage;
  expect(normalizeAddress("0:0:0:0:0:ffff:c000:201")).toBe("192.0.2.1");
  expect(normalizeAddress("2001:0db8:0:0:0:0:0:1")).toBe("2001:db8::1");
  expect(
    clientAddress(request("::ffff:127.0.0.1", "192.0.2.1"), ["127.0.0.1"]),
  ).toBe("192.0.2.1");
  expect(clientAddress(request("127.0.0.2", "192.0.2.1"), ["127.0.0.1"])).toBe(
    "127.0.0.2",
  );
  for (const value of ["fake", "1.2.3.4, 5.6.7.8", ["1.2.3.4"], "fe80::1%eth0"])
    expect(clientAddress(request("127.0.0.1", value), ["127.0.0.1"])).toBe(
      "127.0.0.1",
    );
});
it("cluster response never asks for a private save; offers read just the authorized owner", () => {
  const unused = vi.fn(() => {
    throw Error("world view forbidden");
  });
  const result = facilityResponse(
    new URL("http://test/api/facilities?clusters=1&bbox=5,47,16,56&zoom=6"),
    unused,
  );
  expect(result).toHaveProperty("clusters");
  expect(unused).not.toHaveBeenCalled();
  const db = new Database("unused", { memory: true });
  try {
    db.sql
      .prepare("INSERT INTO users VALUES('owner','owner','unused','player',0)")
      .run();
    const save = fresh("Owner", "North", 1000);
    save.player.id = "owner";
    db.save("owner", save);
    vi.spyOn(db, "all").mockImplementation(() => {
      throw Error("all saves forbidden");
    });
    const context = facilityContext(db, "owner");
    expect(context).toEqual({ money: save.money, xp: save.xp, buildings: [] });
    expect(() => facilityContext(db, "stranger")).toThrow("Leitstelle");
    expect(context).not.toHaveProperty("missions");
  } finally {
    db.close();
  }
});
it("coalesces motion, serializes requests, discards stale data and keeps latest intent", async () => {
  vi.useFakeTimers();
  let complete!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          complete = r;
        }),
    )
    .mockResolvedValue(new Response(JSON.stringify({ value: 2 })));
  vi.stubGlobal("fetch", fetcher);
  const received = vi.fn(),
    reader = new FacilityReader(received, vi.fn());
  try {
    for (let i = 0; i < 100; i++) {
      reader.request(`q=${i}`);
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
    reader.request("q=final");
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    complete(new Response(JSON.stringify({ value: 1 })));
    await vi.advanceTimersByTimeAsync(300);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith({ value: 2 }, "q=final");
  } finally {
    reader.destroy();
  }
});
it("honors Retry-After for only the latest query and bounds repeated 429 retries", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000000);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ scope: "facility-search" }), {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
    ),
  );
  const reader = new FacilityReader(vi.fn(), vi.fn());
  try {
    reader.request("q=old");
    await vi.advanceTimersByTimeAsync(300);
    for (let i = 0; i < 20; i++) reader.request(`q=new${i}`);
    await vi.advanceTimersByTimeAsync(1700);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe("/api/facilities?q=new19");
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetch).toHaveBeenCalledTimes(3);
  } finally {
    reader.destroy();
  }
});
it("cancels a hidden/unmounted reader without replaying any read", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const reader = new FacilityReader(vi.fn(), vi.fn());
  reader.request("id=one");
  reader.destroy();
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetcher).not.toHaveBeenCalled();
});
