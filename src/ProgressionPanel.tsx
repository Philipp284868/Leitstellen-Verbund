import { useEffect, useRef, useState } from "react";
import { buildings, vehicles, extensions, bt } from "./catalog";
import { progress } from "./progression";
import type { Save } from "./model";
import { formatMoney } from "./money";
const upcoming = [
  ...buildings.map((b) => ({
    id: "b-" + b.id,
    name: b.name,
    level: b.level,
    detail: formatMoney(b.price),
  })),
  ...vehicles.map((v) => ({
    id: "v-" + v.id,
    name: v.name,
    level: v.level,
    detail: `${formatMoney(v.price)} · ${bt(v.home).name} · automatische Besatzung${v.training ? ", " + v.training : ""}`,
  })),
  ...extensions.map((e) => ({
    id: "e-" + e.id,
    name: e.name,
    level: e.level,
    detail: `${formatMoney(e.price)} · ${bt(e.home).name}`,
  })),
].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "de"));

export function Progression({ s }: { s: Save }) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(0);
  const p = progress(s.xp),
    previous = useRef({ generation: s.generation, level: p.level });
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const old = previous.current;
    if (old.generation === s.generation && p.level > old.level)
      setNotice(
        `Stufe ${old.level} → ${p.level} erreicht. Neue Kaufmöglichkeiten im Katalog.`,
      );
    previous.current = { generation: s.generation, level: p.level };
  }, [p.level, s.generation]);
  const matches = upcoming.filter(
    (u) =>
      `${u.name} ${u.detail}`
        .toLocaleLowerCase("de")
        .includes(query.toLocaleLowerCase("de")) &&
      (filter === "all" ||
        (filter === "available" ? u.level <= p.level : u.level > p.level)),
  );
  const pages = Math.max(1, Math.ceil(matches.length / 15)),
    at = Math.min(page, pages - 1);
  return (
    <details className="progression-details">
      <summary>Fortschritt & Freischaltungen · Stufe {p.level}</summary>
      {notice && (
        <p role="status">
          {notice} <button onClick={() => setNotice("")}>Schließen</button>
        </p>
      )}
      <p>
        {s.xp.toLocaleString("de-DE")} Gesamt-XP · noch {p.required - p.current}{" "}
        bis Stufe {p.level + 1}
      </p>
      {!!s.progression?.compensation && (
        <p>
          Einmaliger Bestandsschutz: {s.progression.compensation} XP
          Migrationsausgleich. Erspielte XP bleiben erhalten.
        </p>
      )}
      <div className="report-filters">
        <label>
          Freischaltungen suchen
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Freigabestatus
          <select
            aria-label="Freigabestatus"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">Alle</option>
            <option value="available">Freigeschaltet</option>
            <option value="future">Nächste Stufen</option>
          </select>
        </label>
      </div>
      <p>{matches.length} passende Freischaltungen</p>
      <ol>
        {matches.slice(at * 15, (at + 1) * 15).map((u) => (
          <li key={u.id}>
            <strong>
              {u.level <= p.level ? "✓" : "Stufe " + u.level} · {u.name}
            </strong>
            <br />
            {u.detail}
          </li>
        ))}
      </ol>
      {!matches.length && (
        <p className="empty-state">
          Keine passende Freischaltung. Ändere Suche oder Freigabestatus.
        </p>
      )}
      {pages > 1 && (
        <nav className="inline" aria-label="Freischaltungsseiten">
          <button disabled={!at} onClick={() => setPage(at - 1)}>
            Vorherige Freischaltungen
          </button>
          <span>
            Seite {at + 1} / {pages}
          </span>
          <button disabled={at + 1 >= pages} onClick={() => setPage(at + 1)}>
            Weitere Freischaltungen
          </button>
        </nav>
      )}
      <p>
        Nach der letzten Freischaltung läuft der Level-Fortschritt weiter.
        Freischaltungen schenken keine Fahrzeuge.
      </p>
    </details>
  );
}
