import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlayerHelpArticle } from "../src/client/PlayerHelpArticle";
import { readFileSync } from "node:fs";

it("rendert Überschriften, Preisvergleiche, Listen und nur ausdrücklich bekannte Hilfeseiten", () => {
  const html = renderToStaticMarkup(
    createElement(PlayerHelpArticle, {
      text: "# Hilfe\n\n1. Annehmen\n2. Alarmieren\n\n| Art | Preis |\n| --- | --- |\n| FF | 450.000 € |\n\n[[Einstieg]] [[Serverbetrieb]]",
      pages: ["Einstieg"],
      onPage: () => {},
    }),
  );
  expect(html).toContain("<ol>");
  expect(html).toContain("<table>");
  expect(html).toContain('scope="col"');
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).toContain("Serverbetrieb");
});
it("bösartige HTML-, Bild-, Script- und Traversalinhalte bleiben inaktive Texte ohne Netzwerkziele", () => {
  const html = renderToStaticMarkup(
    createElement(PlayerHelpArticle, {
      text: '<script>alert(1)</script>\n\n<img src="https://private.invalid/token" onerror="fetch(1)">\n\n[Login](javascript:alert(1))\n\n![Bild](https://private.invalid/)\n\n[[../../.env]] [[https://api.github.com/repos/private]]',
      pages: ["Einstieg"],
      onPage: () => {},
    }),
  );
  expect(html).not.toMatch(/<(script|img|iframe|a|button)\b/);
  expect(html).not.toMatch(/<[^>]*\s(?:href|src|onerror)=/);
  expect(html).toContain("&lt;script&gt;");
});
it("alle freigegebenen Wikiquerverweise sind lokal auflösbar und kein Betreiberartikel wird eingebunden", () => {
  const names = [
    "Einstieg",
    "Bedienung",
    "Einsatzablauf",
    "Wachen-und-Personal",
    "Fortschritt",
    "Karte-und-Fahrten",
    "Audio-und-Einstellungen",
    "Berechtigungen",
  ];
  for (const name of names) {
    const text = readFileSync(`docs/wiki/${name}.md`, "utf8");
    for (const match of text.matchAll(/\[\[([^\]]+)\]\]/g))
      expect(names, `${name}: ${match[1]}`).toContain(match[1]);
    expect(text).not.toMatch(
      /github\.com\/Philipp284868|\[\[Serverbetrieb\]\]/,
    );
  }
});
