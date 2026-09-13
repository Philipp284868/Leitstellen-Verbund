import { expect, it } from "vitest";
import { RouteFailures } from "../src/server/germany/route-failures";
import { GermanyRoutingError } from "../src/shared/germany/errors";

it("expires negative routes without extending rejection deadlines and never caches outages", () => {
  let now = 0;
  const cache = new RouteFailures(() => now),
    missing = new GermanyRoutingError("Missing", "no-route");
  cache.remember("a/b", missing);
  now = 29999;
  expect(cache.get("a/b")).toBe(missing);
  expect(cache.get("b/a")).toBeUndefined();
  now++;
  expect(cache.get("a/b")).toBeUndefined();
  for (const error of [
    new GermanyRoutingError("Offline", "unavailable"),
    new GermanyRoutingError("Closed", "blocked"),
    Error("Malformed"),
  ]) {
    cache.remember("a/b", error);
    expect(cache.get("a/b")).toBeUndefined();
  }
});
it("bounds failure entries independently of the country and number of players", () => {
  const cache = new RouteFailures(() => 0),
    error = new GermanyRoutingError("Missing", "no-route");
  for (let i = 0; i < 600; i++) cache.remember(String(i), error);
  expect(cache.get("87")).toBeUndefined();
  expect(cache.get("88")).toBe(error);
  expect(cache.get("599")).toBe(error);
});
