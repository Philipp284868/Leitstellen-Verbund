import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, expect, it } from "vitest";
import { publicSave } from "../src/simulation/incidents";
import { phaseFixture } from "./dispatch-fixture";
import type * as Client from "./fixtures/germany-client-staffing";

let client: typeof Client;
beforeAll(async () => {
  mkdirSync(".tools", { recursive: true });
  const outfile = resolve(`.tools/germany-client-staffing-${process.pid}.mjs`);
  await build({
    entryPoints: ["tests/fixtures/germany-client-staffing.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    loader: { ".css": "empty" },
  });
  client = await import(pathToFileURL(outfile).href);
});

it("öffnet ein älteres reguläres Personalprofil ohne Deutschland-Provider und ohne erfundene Privatknoten", () => {
  const s = phaseFixture("legacy-regular"),
    person = s.people[0];
  delete person.duty;
  const before = structuredClone(s);
  expect(() => client.germanyProvider()).toThrow(/noch nicht verfügbar/);
  const html = renderToStaticMarkup(
    createElement(client.PersonSettings, { s, person }),
  );
  expect(html).toContain(
    "Besetzung und Qualifikationen werden automatisch durch die Wache bereitgestellt.",
  );
  expect(html).not.toContain("Wohnort");
  expect(html).not.toContain("Personalprofil speichern");
  expect(s).toEqual(before);
});

it("stellt FF und Besatzungsbereitschaft ohne privaten Geo-Provider dar", () => {
  const s = phaseFixture("volunteer-client");
  s.buildings[0].organization!.kind = "ff";
  s.people.forEach((person) => {
    delete person.duty;
  });
  const html = renderToStaticMarkup(
    createElement(client.PersonSettings, { s, person: s.people[0] }),
  );
  expect(html).toContain("Besetzung und Qualifikationen werden automatisch");
  expect(html).not.toContain("Wohnort");
  const crew = renderToStaticMarkup(
    createElement(client.VehicleStaffing, { s, v: s.vehicles[0] }),
  );
  expect(crew).toContain("Betriebsbereit");
  expect(crew).not.toContain("Kräfte im Wachenpool");
  const station = renderToStaticMarkup(
    createElement(client.StationSettings, { s, b: s.buildings[0] }),
  );
  expect(station).toContain("Betriebsbereit");
  expect(station).not.toContain("Wohnort");
  expect(station).not.toContain("Personal einstellen");
});

it("liefert fehlende reguläre Standardprofile serverseitig ohne den Speicherstand zu verändern oder FF-Daten freizugeben", () => {
  const s = phaseFixture("legacy-snapshot");
  s.people.forEach((person) => {
    delete person.duty;
  });
  const before = structuredClone(s);
  const view = publicSave(s);
  expect(view.people.every((person) => person.duty?.shift === "24h")).toBe(
    true,
  );
  expect(
    view.people.every((person) => Number.isSafeInteger(person.duty?.homeNode)),
  ).toBe(true);
  expect(s).toEqual(before);
  s.buildings[0].organization!.kind = "ff";
  expect(publicSave(s).people.every((person) => !person.duty)).toBe(true);
});
