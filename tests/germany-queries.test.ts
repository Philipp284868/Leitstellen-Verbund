import { afterEach, describe, expect, it, vi } from "vitest";
import { GeoRequestCache } from "../src/client/germany/request-cache";
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("gemeinsame serverseitige Geodatenabfragen", () => {
  it("verwendet für Browser-fetch den globalen Empfänger statt des Cacheobjekts", async () => {
    vi.stubGlobal("fetch", function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(
        new Response(JSON.stringify({ text: "3,1 km · 4 min" })),
      );
    });
    const cache = new GeoRequestCache(),
      values: unknown[] = [];
    const release = cache.subscribe(
      "real-browser",
      "/api/geo/approach",
      (value) => values.push(value),
    );
    await flush();
    expect(values.at(-1)).toEqual({
      loading: false,
      data: { text: "3,1 km · 4 min" },
    });
    release();
  });
  it("teilt eine laufende Anfrage und bricht erst nach dem letzten Verbraucher ab", () => {
    const signals: AbortSignal[] = [];
    const request = vi.fn<typeof fetch>((_url, options) => {
      signals.push(options!.signal!);
      return new Promise<Response>(() => {});
    });
    const cache = new GeoRequestCache(request);
    const first = cache.subscribe(
      "same",
      "/api/geo/approach?vehicle=1",
      () => {},
    );
    const second = cache.subscribe(
      "same",
      "/api/geo/approach?vehicle=1",
      () => {},
    );
    expect(request).toHaveBeenCalledTimes(1);
    first();
    expect(signals[0].aborted).toBe(false);
    second();
    expect(signals[0].aborted).toBe(true);
  });
  it("liefert gespeicherte Antworten nur innerhalb der TTL und trennt Benutzer-/Modusschlüssel", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const request = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ text: "Reale Strecke" })),
    );
    const cache = new GeoRequestCache(request),
      values: unknown[] = [];
    const release = cache.subscribe(
      "player-a:single:path",
      "/api/geo/approach",
      (value) => values.push(value),
    );
    await flush();
    expect(values.at(-1)).toEqual({
      loading: false,
      data: { text: "Reale Strecke" },
    });
    release();
    cache.subscribe("player-a:single:path", "/api/geo/approach", () => {})();
    expect(request).toHaveBeenCalledTimes(1);
    cache.subscribe("player-a:multi:path", "/api/geo/approach", () => {});
    expect(request).toHaveBeenCalledTimes(2);
    vi.setSystemTime(17000);
    cache.subscribe("player-a:single:path", "/api/geo/approach", () => {});
    expect(request).toHaveBeenCalledTimes(3);
    await flush();
  });
  it("begrenzt parallele Routinganfragen und entfernt abgebrochene Warteschlangeneinträge", async () => {
    const resolve: ((response: Response) => void)[] = [];
    const request = vi.fn<typeof fetch>(
      () => new Promise<Response>((finish) => resolve.push(finish)),
    );
    const cache = new GeoRequestCache(request);
    const release = Array.from({ length: 10 }, (_, id) =>
      cache.subscribe(String(id), `/route/${id}`, () => {}),
    );
    expect(request).toHaveBeenCalledTimes(8);
    release[8]();
    resolve[0](new Response("{}"));
    await flush();
    expect(request).toHaveBeenCalledTimes(9);
    expect(request.mock.calls.at(-1)?.[0]).toBe("/route/9");
    release.forEach((stop) => stop());
  });
});
