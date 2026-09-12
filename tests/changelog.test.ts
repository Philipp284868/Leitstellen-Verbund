import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseChangelog } from "../src/changelog";
import { requireChangeNotes } from "../scripts/check-changelog.mjs";
import { version } from "../package.json";
it("liefert sämtliche tatsächlichen Versionen und erfindet keine Datumsangaben", () => {
  const source = readFileSync("CHANGELOG.md", "utf8"),
    rows = parseChangelog(source);
  expect(rows.some((r) => r.version === version)).toBe(true);
  expect(rows).toHaveLength([...source.matchAll(/^## /gm)].length);
  expect(rows.length).toBeGreaterThan(0);
  expect(parseChangelog("## 1.0.0")).toMatchObject([
    { version: "1.0.0", body: "" },
  ]);
  expect(
    parseChangelog(
      "# Verlauf\n## 1.0.0\nText\n### Details\n<script>no()</script>\n## Korrektur · 12.09.2026\nKlein",
    ),
  ).toMatchObject([
    { version: "1.0.0", date: null, body: expect.stringContaining("<script>") },
    { version: null, date: "12.09.2026" },
  ]);
});
it("CI verlangt echte Notizen und erlaubt nur begründete Wartungsausnahmen", () => {
  expect(() => requireChangeNotes(["src/App.tsx"])).toThrow();
  expect(() =>
    requireChangeNotes(["src/App.tsx", "CHANGELOG.md"]),
  ).not.toThrow();
  expect(() =>
    requireChangeNotes(
      ["scripts/build.mjs", "docs/CHANGELOG-AUSNAHME.md"],
      "Begründete Wartung: " +
        "nur interne Formatierung und Prüfmittel. ".repeat(3),
    ),
  ).not.toThrow();
  expect(() =>
    requireChangeNotes(
      ["src/App.tsx", "docs/CHANGELOG-AUSNAHME.md"],
      "x".repeat(100),
    ),
  ).toThrow();
  expect(() =>
    requireChangeNotes(
      ["scripts/build.mjs", "docs/CHANGELOG-AUSNAHME.md"],
      "kurz",
    ),
  ).toThrow();
});
