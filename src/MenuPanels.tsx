import { ProjectNewsPanel } from "./ProjectNews";
import { useState } from "react";
import { missions, capabilities } from "./catalog";
import type { Save } from "./model";
import { logout, emit } from "./store";
import { missionXp, progress } from "./progression";
import { credits } from "./ui";
import { IncidentIcon } from "./HudIcons";

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
  const [query, setQuery] = useState("");
  const [scenario, setScenario] = useState(missions[0].id);
  const t = missions.find((m) => m.id === scenario)!;
  const leave = () => void logout().catch((e) => emit({ error: String(e) }));
  if (panel === "exit")
    return (
      <section className="menu-flow">
        <h3>Diese Sitzung verlassen?</h3>
        <p>
          Dein bestätigter Spielstand liegt auf dem Server. Fahrzeuge und
          Einsätze werden dort weiter simuliert, solange der Server läuft.
        </p>
        <div className="inline">
          <button className="danger" onClick={leave}>
            Abmelden und Spiel verlassen
          </button>
          <button onClick={onPlay}>Zurück zum Spiel</button>
        </div>
        <small>Nach dem Abmelden kannst du diesen Browser-Tab schließen.</small>
      </section>
    );
  if (panel === "catalog")
    return (
      <section className="scenario-catalog">
        <p>
          Der echte Einsatzkatalog dieser Region. Im laufenden Spiel entstehen
          passende Einsätze entsprechend deinen verfügbaren Fähigkeiten. Hier
          kannst du Anforderungen und Belohnungen vorab ansehen.
        </p>
        <label>
          Einsatzart suchen
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name oder Organisation …"
          />
        </label>
        <div className="scenario-layout">
          <nav aria-label="Szenarien">
            {missions
              .filter((m) =>
                `${m.name} ${m.org}`
                  .toLocaleLowerCase("de")
                  .includes(query.toLocaleLowerCase("de")),
              )
              .map((m) => (
                <button
                  key={m.id}
                  aria-pressed={m.id === scenario}
                  onClick={() => setScenario(m.id)}
                >
                  <IncidentIcon org={m.org} />
                  <span>
                    {m.name}
                    <small>{m.org}</small>
                  </span>
                </button>
              ))}
          </nav>
          <article>
            <div className="scenario-art" data-org={t.org}>
              <IncidentIcon org={t.org} />
            </div>
            <h3>{t.name}</h3>
            <p>
              {t.org} ·{" "}
              {progress(s.xp).level >= t.level
                ? "Stufenvoraussetzung erfüllt"
                : `Ab Stufe ${t.level}`}
            </p>
            <h4>Ursprüngliche Anforderungen</h4>
            <ul>
              {Object.entries(t.requirements).map(([k, n]) => (
                <li key={k}>
                  {capabilities[k] || k}: {n}
                </li>
              ))}
            </ul>
            <p>
              {credits(t.reward)} · {missionXp(t)} XP bei erfolgreichem
              Abschluss
            </p>
            <small>
              Lagemeldungen können zusätzliche Anforderungen ergeben. Ein
              eigenständiger Szenario-Spielmodus ist auf diesem Server nicht
              vorhanden.
            </small>
            <button className="primary" onClick={onPlay}>
              Zur Leitstelle
            </button>
          </article>
        </div>
      </section>
    );
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
        <button onClick={() => onOpen("settings")}>Konto und Sitzungen</button>
      </section>
    );
  if (panel === "support")
    return (
      <section className="menu-flow">
        <h3>Hilfe zur Leitstelle</h3>
        <p>
          Bedienung, Notrufe, Alarmierung, Kooperation und Sicherungen sind in
          der Spielanleitung erklärt.
        </p>
        <button onClick={() => onOpen("help")}>Spielanleitung öffnen</button>
        <p>
          <a
            href="https://github.com/Philipp284868/Leitstellen-Verbund/issues"
            target="_blank"
            rel="noreferrer"
          >
            Fehler im Projekt melden
          </a>
        </p>
        <small>
          Bitte keine Passwörter oder private Spielstanddateien öffentlich
          teilen.
        </small>
      </section>
    );
  if (panel === "language")
    return (
      <section className="menu-flow">
        <h3>Deutsch</h3>
        <p>
          Die Oberfläche und die Einsatzmeldungen stehen derzeit auf Deutsch zur
          Verfügung.
        </p>
      </section>
    );
  return null;
}
