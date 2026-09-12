import { SupportPanel } from "./Support";
import { useMemo, useState } from "react";
import { capabilities, missions } from "../shared/catalog";
import { IncidentIcon } from "./HudIcons";
import type { Save } from "../shared/model";
import { missionXp, progress } from "../shared/progression";
import { ProjectNewsPanel } from "./ProjectNews";
import { logout } from "./store";
import { ActionButton, credits, Disclosure } from "./ui";

export function ScenarioCatalog({
  s,
  onPlay,
}: {
  s: Save;
  onPlay: () => void;
}) {
  const [query, setQuery] = useState(""),
    [org, setOrg] = useState("Alle"),
    [available, setAvailable] = useState(false),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState("");
  const currentLevel = progress(s.xp).level;
  const filtered = useMemo(
    () =>
      missions.filter(
        (m) =>
          (org === "Alle" || m.org === org) &&
          (!available || m.level <= currentLevel) &&
          `${m.name} ${m.org} ${m.description}`
            .toLocaleLowerCase("de")
            .includes(query.trim().toLocaleLowerCase("de")),
      ),
    [org, available, currentLevel, query],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 24)),
    currentPage = Math.min(page, pages - 1),
    rows = filtered.slice(currentPage * 24, currentPage * 24 + 24),
    t = rows.find((m) => m.id === selected) ?? rows[0];
  return (
    <section className="scenario-catalog">
      <div className="view-heading">
        <p className="view-intro">
          {missions.length} Einsatzarten · Anforderungen, Freischaltungen und
          Vergütung
        </p>
        <Disclosure title="Hinweise zum Einsatzkatalog" className="view-help">
          <p>
            Anforderungen und Grundvergütung dienen der Vorbereitung; ein
            unbekannter echter Notruf verrät seine Vorlage nicht. Zusätzliche
            Lagemeldungen können den Kräftebedarf verändern.
          </p>
        </Disclosure>
      </div>
      <div className="resource-summary">
        <label>
          Einsatzart suchen
          <input
            value={query}
            maxLength={100}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Name, Organisation oder Stichwort …"
          />
        </label>
        <label>
          Organisation
          <select
            value={org}
            onChange={(e) => {
              setOrg(e.target.value);
              setPage(0);
            }}
          >
            <option>Alle</option>
            {[...new Set(missions.map((m) => m.org))].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => {
              setAvailable(e.target.checked);
              setPage(0);
            }}
          />
          Nur freigeschaltete Stufen
        </label>
      </div>
      <p role="status">
        {filtered.length} Treffer · Seite {currentPage + 1} von {pages}
      </p>
      {!rows.length ? (
        <div className="empty-state">
          <h3>Keine passenden Einsatzarten</h3>
          <p>
            Ein kürzerer Suchbegriff oder eine andere Organisation erweitert die
            Auswahl.
          </p>
          <button
            onClick={() => {
              setQuery("");
              setOrg("Alle");
              setAvailable(false);
              setPage(0);
            }}
          >
            Filter zurücksetzen
          </button>
        </div>
      ) : (
        <div className="scenario-layout">
          <nav aria-label="Szenarien">
            {rows.map((m) => (
              <button
                key={m.id}
                aria-pressed={m.id === t.id}
                onClick={() => setSelected(m.id)}
              >
                <IncidentIcon org={m.org} />
                <span>
                  {m.name}
                  <small>
                    {m.org} · Stufe {m.level}
                  </small>
                </span>
              </button>
            ))}
          </nav>
          <article>
            <div className="scenario-art" data-org={t.org}>
              <IncidentIcon org={t.org} />
            </div>
            <h3>{t.name}</h3>
            <p>{t.description}</p>
            <p>
              {t.org} ·{" "}
              {currentLevel >= t.level
                ? "Stufenvoraussetzung erfüllt"
                : `Ab Stufe ${t.level}`}
            </p>
            <h4>Grundanforderungen</h4>
            <ul>
              {Object.entries(t.requirements).map(([key, n]) => (
                <li key={key}>
                  {capabilities[key] ?? key}: {n}
                </li>
              ))}
            </ul>
            <p>
              Grundvergütung {credits(t.reward)} · {missionXp(t)} XP
            </p>
            <small>
              Das tatsächliche Ergebnis hängt vom bestätigten Einsatzabschluss
              ab. Hier wird kein Einsatz erzeugt und keine Belohnung gebucht.
            </small>
            <p>
              <button className="primary" onClick={onPlay}>
                Zur Leitstelle
              </button>
            </p>
          </article>
        </div>
      )}
      <nav className="inline" aria-label="Katalogseiten">
        <button
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          Vorherige Seite
        </button>
        <button
          disabled={currentPage + 1 >= pages}
          onClick={() => setPage(currentPage + 1)}
        >
          Nächste Seite
        </button>
      </nav>
    </section>
  );
}
export function MenuPanels({
  panel,
  s,
  onOpen,
  onPlay,
}: {
  panel: string;
  s: Save;
  onOpen: (panel: string) => void;
  onPlay: () => void;
}) {
  if (panel === "exit")
    return (
      <section className="menu-flow">
        <h3>Diese Sitzung verlassen?</h3>
        <p>
          Dein bestätigter Spielstand liegt auf dem Server. Fahrzeuge und
          Einsätze werden dort weiter simuliert, solange der Server läuft.
        </p>
        <div className="inline">
          <ActionButton className="danger" action={() => logout()}>
            Abmelden und Spiel verlassen
          </ActionButton>
          <button onClick={onPlay}>Zurück zum Spiel</button>
        </div>
        <small>Nach dem Abmelden kannst du diesen Browser-Tab schließen.</small>
      </section>
    );
  if (panel === "catalog") return <ScenarioCatalog s={s} onPlay={onPlay} />;
  if (panel === "news") return <ProjectNewsPanel />;
  if (panel === "credits")
    return (
      <section className="menu-flow">
        <h3>Leitstellen-Verbund</h3>
        <p>
          Eine Echtzeit-Leitstellensimulation auf der Deutschlandkarte.
          Geografische Grunddaten und simulierte Betriebsdaten sind getrennt.
        </p>
        <p>
          Oberfläche: React. Icons: Lucide. Echtzeitverbindung: Socket.IO.
          Weitere Komponenten und Versionen sind im Projektverzeichnis
          dokumentiert.
        </p>
        <p>
          Musik und Signale werden aus eigens komponierten Noten und
          Klangerzeugern lokal im Browser erstellt. Es werden keine echten
          Notruf- oder Funkaufnahmen verwendet. Die Deutschlandkarte verwendet
          OpenStreetMap-Daten; Herkunft und Kartenlizenzen sind an der Karte und
          im Projekt dokumentiert.
        </p>
        <ul>
          <li>
            <a
              href="https://github.com/Philipp284868/Leitstellen-Verbund/graphs/contributors"
              target="_blank"
              rel="noreferrer"
            >
              Mitwirkende am Quellcode
            </a>
          </li>
          <li>
            <a
              href="https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/LIZENZEN.md"
              target="_blank"
              rel="noreferrer"
            >
              Komponenten, Datenquellen und Lizenzen
            </a>
          </li>
          <li>
            <a
              href="https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/AUDIO.md"
              target="_blank"
              rel="noreferrer"
            >
              Musik und Klangerzeuger
            </a>
          </li>
        </ul>
        <a
          href="https://github.com/Philipp284868/Leitstellen-Verbund"
          target="_blank"
          rel="noreferrer"
        >
          Projekt und Quellcode
        </a>
      </section>
    );
  if (panel === "privacy")
    return (
      <section className="menu-flow">
        <h3>Deine Daten im Spiel</h3>
        <p>
          Konten, Sitzungen, Leitstellenstände und Spielaktionen werden auf dem
          verbundenen Spielserver verarbeitet. Dieser Browser verwendet lokale
          Einstellungen für Audio und Bedienung; freiwillige lokale Sicherungen
          und eigene Audiodateien bleiben auf diesem Gerät.
        </p>
        <p>
          Die Spielkarte benötigt keine externen Kartenkonten oder
          Kartendienste. Für Betrieb, Aufbewahrung und Löschung der Serverdaten
          ist der jeweilige Serverbetreiber zuständig.
        </p>
        <button onClick={() => onOpen("backups")}>
          Eigene Daten exportieren
        </button>
        <button onClick={() => onOpen("account")}>Konto und Sitzungen</button>
      </section>
    );
  if (panel === "support") return <SupportPanel onOpen={onOpen} />;
  if (panel === "language")
    return (
      <section className="menu-flow">
        <h3>Deutsch</h3>
        <p>
          Die Oberfläche und die Einsatzmeldungen stehen derzeit auf Deutsch zur
          Verfügung.
        </p>
        <p>
          Datums- und Zahlenangaben verwenden deutsche Schreibweise, Geldbeträge
          werden in Euro dargestellt. Derzeit gibt es keine weitere auswählbare
          Übersetzung.
        </p>
        <button onClick={() => onOpen("settings")}>
          Lesbarkeit und Darstellung einstellen
        </button>
      </section>
    );
  return null;
}
