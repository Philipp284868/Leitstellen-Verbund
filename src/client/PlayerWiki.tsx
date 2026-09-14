import { useEffect, useRef, useState } from "react";
import { version } from "../../package.json";
import entry from "../../docs/wiki/Einstieg.md?raw";
import controls from "../../docs/wiki/Bedienung.md?raw";
import incidents from "../../docs/wiki/Einsatzablauf.md?raw";
import stations from "../../docs/wiki/Wachen-und-Personal.md?raw";
import progress from "../../docs/wiki/Fortschritt.md?raw";
import map from "../../docs/wiki/Karte-und-Fahrten.md?raw";
import audio from "../../docs/wiki/Audio-und-Einstellungen.md?raw";
import permissions from "../../docs/wiki/Berechtigungen.md?raw";
import "./PlayerWiki.css";
import { PlayerHelpArticle } from "./PlayerHelpArticle";
// Explicit player-only allowlist. No glob, arbitrary URL, HTML or repository proxy.
const pages = [
  ["Einstieg", entry],
  ["Bedienung", controls],
  ["Einsatzablauf", incidents],
  ["Wachen-und-Personal", stations],
  ["Fortschritt", progress],
  ["Karte-und-Fahrten", map],
  ["Audio-und-Einstellungen", audio],
  ["Berechtigungen", permissions],
] as const;
export function PlayerWiki() {
  const article = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<string>(pages[0][0]);
  useEffect(() => article.current?.focus({ preventScroll: true }), [selected]);
  const [query, setQuery] = useState("");
  const [trail, setTrail] = useState<string[]>([]);
  const select = (id: string) => {
    if (id !== selected) {
      setTrail([...trail, selected]);
      setSelected(id);
    }
  };
  const current = pages.find(([id]) => id === selected) ?? pages[0];
  const matches = pages.filter(([id, text]) =>
    `${id} ${text}`
      .toLocaleLowerCase("de")
      .includes(query.trim().toLocaleLowerCase("de")),
  );
  return (
    <section className="player-wiki" aria-label="Spieler-Wiki">
      <p>Spielerhilfe · Version {version} · lokal mitgeliefert</p>
      <button
        disabled={!trail.length}
        onClick={() => {
          setSelected(trail.at(-1)!);
          setTrail(trail.slice(0, -1));
        }}
      >
        Zur vorherigen Hilfeseite
      </button>
      <label>
        Wiki durchsuchen
        <input
          type="search"
          value={query}
          maxLength={120}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="wiki-layout">
        <nav aria-label="Wiki-Inhaltsübersicht">
          {matches.map(([id, text]) => (
            <button
              key={id}
              aria-current={selected === id ? "page" : undefined}
              onClick={() => select(id)}
            >
              {text.split("\n")[0].replace(/^# /, "")}
            </button>
          ))}
          {!matches.length && (
            <p role="status">Keine passende Seite gefunden.</p>
          )}
        </nav>
        <article
          key={selected}
          ref={article}
          tabIndex={-1}
          aria-label={current[0]}
        >
          <PlayerHelpArticle
            text={current[1]}
            pages={pages.map(([id]) => id)}
            onPage={select}
          />
        </article>
      </div>
    </section>
  );
}
