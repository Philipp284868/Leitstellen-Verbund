import { useEffect, useState } from "react";
import { version } from "../../package.json";
import type { Change } from "./changelog";
/** Text rendering deliberately prevents execution of HTML and embedded links. */
export function ProjectNewsPanel() {
  const [items, setItems] = useState<Change[]>([]),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [chosen, setChosen] = useState("");
  useEffect(() => {
    const c = new AbortController();
    void fetch("/changelog.json", { signal: c.signal })
      .then((r) => {
        if (!r.ok) throw Error("Versionsverlauf nicht erreichbar.");
        return r.json();
      })
      .then((v) => {
        if (v.installed !== version || !Array.isArray(v.items))
          throw Error("Versionsverlauf passt nicht zum installierten Spiel.");
        setItems(v.items);
      })
      .catch(() => {
        if (!c.signal.aborted)
          setError(
            "Versionsverlauf derzeit nicht erreichbar. Bitte später erneut öffnen.",
          );
      });
    return () => c.abort();
  }, []);
  const rows = items.filter(
    (x) =>
      (!chosen || x.id === chosen) &&
      (x.title + " " + x.body)
        .toLocaleLowerCase("de")
        .includes(query.toLocaleLowerCase("de")),
  );
  return (
    <section className="menu-flow changelog-panel" aria-label="Changelogs">
      <h2>Installierte Version {version}</h2>
      <p>
        Mit diesem Build ausgelieferter Verlauf aus CHANGELOG.md. Historische
        Einträge beschreiben den damaligen Stand. Fehlende historische
        Datumsangaben werden nicht ergänzt.
      </p>
      <div className="inline">
        <label>
          Änderungen suchen
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          Version
          <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
            <option value="">Alle Einträge</option>
            {items.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {rows.map((x) => (
        <article key={x.id}>
          <h3>
            {x.title}
            {x.version === version ? " · Installiert" : ""}
          </h3>
          <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {x.body}
          </div>
        </article>
      ))}
      {!items.length && !error && <p>Versionsverlauf wird geladen …</p>}
      {!!items.length && !rows.length && <p>Keine passenden Änderungen.</p>}
    </section>
  );
}
