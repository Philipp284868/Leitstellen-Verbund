import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

it("meldet den alten Offline-Worker ab und entfernt ausschließlich eigene Cacheeinträge", async () => {
  const handlers = new Map<string, (event?: unknown) => void>();
  const removed: string[] = [];
  let unregistered = false,
    waiting = false,
    completion: Promise<void> | undefined;
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: {
      addEventListener: (name: string, callback: () => void) =>
        handlers.set(name, callback),
      skipWaiting: () => {
        waiting = true;
      },
      registration: {
        unregister: async () => {
          unregistered = true;
        },
      },
    },
    caches: {
      keys: async () => [
        "leitstellen-verbund-v1",
        "other-application",
        "leitstellen-verbund-v2",
      ],
      delete: async (key: string) => {
        removed.push(key);
        return true;
      },
    },
  });
  handlers.get("install")!();
  handlers.get("activate")!({
    waitUntil: (promise: Promise<void>) => {
      completion = promise;
    },
  });
  await completion;
  expect(waiting).toBe(true);
  expect(unregistered).toBe(true);
  expect(removed).toEqual(["leitstellen-verbund-v1", "leitstellen-verbund-v2"]);
  expect([...handlers.keys()]).toEqual(["install", "activate"]);
});
