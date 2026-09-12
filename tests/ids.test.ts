import { afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { createId } from "../src/client/ids";

afterEach(() => vi.unstubAllGlobals());
const format =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
it("verwendet vorhandenes natives randomUUID", () => {
  const randomUUID = vi.fn(() => "00112233-4455-4677-8899-aabbccddeeff");
  vi.stubGlobal("crypto", { randomUUID });
  expect(createId()).toBe("00112233-4455-4677-8899-aabbccddeeff");
  expect(randomUUID).toHaveBeenCalledOnce();
});
it("setzt UUID-Version und Variante auch ohne randomUUID korrekt", () => {
  vi.stubGlobal("crypto", {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(0),
  });
  expect(createId()).toBe("00000000-0000-4000-8000-000000000000");
});
it("nutzt im Fallback echte Zufallsbytes und liefert unterschiedliche Aktionskennungen", () => {
  vi.stubGlobal("crypto", {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
  });
  const ids = Array.from({ length: 1024 }, createId);
  expect(ids.every((id) => format.test(id))).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
});
it("verweigert IDs ohne sichere Zufallsquelle statt Math.random zu verwenden", () => {
  vi.stubGlobal("crypto", undefined);
  expect(createId).toThrow("sichere Zufallsquelle");
});
it("übergeht einen Fehler der Zufallsquelle nicht", () => {
  vi.stubGlobal("crypto", {
    getRandomValues: () => {
      throw Error("Zufallsquelle gestört");
    },
  });
  expect(createId).toThrow("Zufallsquelle gestört");
});
