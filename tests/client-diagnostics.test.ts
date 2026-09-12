import { it, expect } from "vitest";
import {
  clientDiagnostics,
  recordClientDiagnostic,
} from "../src/client/client-diagnostics";
it("hält lokale Fehlercodes begrenzt, fasst Wiederholungen zusammen und nimmt keine Rohdaten an", () => {
  recordClientDiagnostic("UI_SCRIPT_FAILED", 100000);
  recordClientDiagnostic("UI_SCRIPT_FAILED", 101000);
  recordClientDiagnostic("secret-token", 102000);
  expect(clientDiagnostics()).toEqual([
    { at: new Date(100000).toISOString(), code: "UI_SCRIPT_FAILED", count: 2 },
  ]);
  for (let i = 0; i < 150; i++)
    recordClientDiagnostic("UI_PROMISE_FAILED", 200000 + i * 31000);
  expect(clientDiagnostics()).toHaveLength(100);
  const snapshot = clientDiagnostics();
  snapshot[0].code = "secret";
  expect(JSON.stringify(clientDiagnostics())).not.toContain("secret");
});
