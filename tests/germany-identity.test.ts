import { describe, expect, it } from "vitest";
import { assertGraphRuntimeIdentity } from "../server/germany/identity";
const identity = {
  version: "11.0",
  import_date: "2026-09-08T22:27:30Z",
  data_date: "2026-09-07T20:21:20Z",
  bbox: [5, 47, 16, 56],
  profiles: [{ name: "car" }],
  elevation: false,
  encoded_values: {
    car_access: ["true", "false"],
    car_average_speed: [">number", "<number"],
  },
};
describe("Gebundene Routing-Laufzeitidentität", () => {
  it("erkennt denselben Import unabhängig von Objekt-Schlüsselreihenfolge", () => {
    expect(() =>
      assertGraphRuntimeIdentity(identity, {
        ...identity,
        encoded_values: {
          car_average_speed: [">number", "<number"],
          car_access: ["true", "false"],
        },
      }),
    ).not.toThrow();
  });
  it("weist fehlende, fremde oder anders konfigurierte Routingimporte zurück", () => {
    for (const actual of [
      undefined,
      {},
      { ...identity, import_date: "2026-09-08T23:00:00Z" },
      { ...identity, data_date: "2026-09-06T20:21:20Z" },
      { ...identity, profiles: [{ name: "foot" }] },
      { ...identity, elevation: true },
      { ...identity, encoded_values: { car_access: ["true", "false"] } },
    ])
      expect(() => assertGraphRuntimeIdentity(identity, actual)).toThrow(
        "Geodatenpaket",
      );
    expect(() => assertGraphRuntimeIdentity(undefined, identity)).toThrow(
      "Geodatenpaket",
    );
  });
});
