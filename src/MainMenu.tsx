import {
  Radio,
  ArrowUpRight,
  TowerControl,
  Truck,
  Users,
  ChartNoAxesCombined,
  Settings,
  HelpCircle,
  Download,
  ChevronRight,
  Activity,
} from "lucide-react";
import type { Save } from "./model";
import { level } from "./model";
import { credits } from "./ui";
import { version } from "../package.json";
import "./MainMenu.css";

export function MainMenu({
  save: s,
  readonly,
  onPlay,
  onOpen,
}: {
  save: Save;
  readonly: boolean;
  onPlay: () => void;
  onOpen: (panel: string) => void;
}) {
  const shortcuts = [
    {
      id: "stations",
      icon: TowerControl,
      name: "Wachen",
      text: "Standorte verwalten und ausbauen",
      count: s.buildings.length,
    },
    {
      id: "fleet",
      icon: Truck,
      name: "Fuhrpark",
      text: "Fahrzeuge und Besatzungen organisieren",
      count: s.vehicles.length,
    },
    {
      id: "friends",
      icon: Users,
      name: "Mit Freunden spielen",
      text: "Kräfte teilen. Gemeinsam helfen.",
      count: null,
    },
    {
      id: "progress",
      icon: ChartNoAxesCombined,
      name: "Fortschritt",
      text: "Deine Erfolge und nächsten Ziele",
      count: `Stufe ${level(s)}`,
    },
  ];
  return (
    <main className="command-menu">
      <header className="menu-header">
        <div className="menu-brand">
          <Radio size={28} />
          <span>
            LEITSTELLEN<strong>VERBUND</strong>
          </span>
        </div>
        <span
          className={`menu-connection ${readonly ? "is-offline" : ""}`}
          role="status"
        >
          <i />
          {readonly ? "Verbindung unterbrochen" : "Mit Server verbunden"}
        </span>
        <button onClick={() => onOpen("settings")}>
          <Settings size={18} />
          <span>Konto & Einstellungen</span>
        </button>
      </header>
      <div className="menu-content">
        <section className="menu-hero" aria-labelledby="menu-title">
          <div className="menu-hero-copy">
            <span className="menu-kicker">
              REGION FALKENRIED / DEINE LEITSTELLE
            </span>
            <h1 id="menu-title">
              Deine nächste
              <br />
              <em>Schicht beginnt.</em>
            </h1>
            <p>
              Willkommen zurück, {s.player.name}.<br />
              Eine ganze Region zählt auf deine Entscheidungen.
            </p>
            <button className="primary menu-play" onClick={onPlay}>
              Leitstelle öffnen <ChevronRight size={22} />
            </button>
            <small>
              {readonly
                ? "Du kannst deine Übersicht öffnen. Spielaktionen sind bis zur Verbindung gesperrt."
                : "Disponieren, ausbauen und gemeinsam Einsätze meistern."}
            </small>
          </div>
          <div className="menu-region" aria-hidden="true">
            <svg viewBox="0 0 480 330" fill="none">
              <defs>
                <pattern
                  id="menu-grid"
                  width="32"
                  height="32"
                  patternUnits="userSpaceOnUse"
                >
                  <path d="M32 0H0V32" stroke="currentColor" opacity=".12" />
                </pattern>
              </defs>
              <rect width="480" height="330" fill="url(#menu-grid)" />
              <path
                d="M320 -20C240 90 405 120 295 205S280 310 200 360"
                stroke="#459eac"
                strokeWidth="38"
                opacity=".24"
              />
              <g stroke="currentColor" opacity=".35" strokeWidth="2">
                <path d="M-20 110L140 110 200 175 480 175M80 0V230L180 330M0 270L180 220 240 60 480 60M170 0L220 110H480M390 0V330M0 45L160 45 300 300H480" />
              </g>
              <path
                d="M80 110H140L200 175H390V240"
                stroke="#f09b76"
                strokeWidth="3"
                strokeDasharray="7 6"
              />
              <g fill="#f09b76">
                <circle cx="80" cy="110" r="7" />
                <circle cx="200" cy="175" r="7" />
                <circle cx="390" cy="240" r="7" />
              </g>
              <circle cx="200" cy="175" r="24" stroke="#f09b76" opacity=".5" />
              <circle cx="200" cy="175" r="48" stroke="#f09b76" opacity=".2" />
            </svg>
            <span className="menu-map-label">
              <Radio size={16} /> FALKENRIED
            </span>
            <span className="menu-map-caption">GEMEINSAM IN BEREITSCHAFT</span>
          </div>
        </section>
        <section
          className="menu-overview"
          aria-label="Deine Leitstelle im Überblick"
        >
          <div className="menu-station">
            <span className="menu-kicker">DEIN STANDORT</span>
            <h2>{s.player.station}</h2>
            <span>Leitstellenstufe {level(s)}</span>
          </div>
          <div>
            <span>Verfügbare Credits</span>
            <strong>{credits(s.money)}</strong>
          </div>
          <div>
            <span>Offene Einsätze</span>
            <strong>{s.missions.length.toLocaleString("de-DE")}</strong>
          </div>
          <div>
            <span>Fahrzeuge an Wache</span>
            <strong>
              {s.vehicles.filter((v) => v.status === "ready").length}
              <small> / {s.vehicles.length}</small>
            </strong>
          </div>
        </section>
        <section aria-labelledby="menu-manage-title">
          <div className="menu-section-heading">
            <h2 id="menu-manage-title">Deine Leitstelle im Griff.</h2>
            <span>VERWALTUNG & VERBUND</span>
          </div>
          <nav className="menu-shortcuts" aria-label="Hauptmenü">
            {shortcuts.map(({ id, icon: Icon, name, text, count }) => (
              <button key={id} onClick={() => onOpen(id)}>
                <div className="menu-shortcut-top">
                  <Icon size={25} />
                  {count !== null && <span>{count}</span>}
                  <ArrowUpRight size={18} />
                </div>
                <h3>{name}</h3>
                <p>{text}</p>
              </button>
            ))}
          </nav>
        </section>
        <section className="menu-bottom">
          <div className="menu-tip">
            <Activity size={24} />
            <div>
              <h3>
                {s.buildings.length
                  ? "Jeder Einsatz zählt."
                  : "Alles beginnt mit deiner ersten Wache."}
              </h3>
              <p>
                {s.buildings.length
                  ? `${s.completed} Einsätze abgeschlossen. Entdecke deine nächsten Ausbauziele.`
                  : "Baue eine Feuerwache, kaufe Fahrzeuge und stelle deine erste Mannschaft zusammen."}
              </p>
            </div>
            <button
              onClick={() => onOpen(s.buildings.length ? "progress" : "build")}
            >
              {s.buildings.length ? "Ziele ansehen" : "Wache bauen"}
              <ChevronRight size={17} />
            </button>
          </div>
          <nav className="menu-utilities" aria-label="Hilfe und Sicherungen">
            <button onClick={() => onOpen("help")}>
              <HelpCircle size={19} />
              Spielanleitung
            </button>
            <button onClick={() => onOpen("backups")}>
              <Download size={19} />
              Spielstände & Sicherungen
            </button>
          </nav>
        </section>
      </div>
      <footer className="menu-footer">
        <span>FALKENRIED · GEMEINSAM DISPONIEREN</span>
        <span>Version {version}</span>
      </footer>
    </main>
  );
}
