import {
  Radio,
  Play,
  Users,
  Settings,
  Power,
  ChevronRight,
  Shield,
  Truck,
  Siren,
  Wallet,
  BookOpen,
  Globe,
  LifeBuoy,
  Clock,
  Building2,
  Newspaper,
} from "lucide-react";
import { useProjectNews } from "./ProjectNews";
import { BrandMark } from "./BrandMark";
import { SoundButton } from "./Sound";
import type { Save } from "./model";
import { progress } from "./progression";
import { credits } from "./ui";
import { useGame } from "./store";
import { modeName } from "./mode";
import { readiness } from "./engine";
import { RegionScene } from "./RegionScene";
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
  const { mode } = useGame();
  const xp = progress(s.xp);
  const news = useProjectNews()[0];
  const actions = [
    {
      name: "Spielen",
      text: "Mit der verbundenen Leitstelle spielen",
      icon: Play,
      action: onPlay,
      primary: true,
    },
    {
      name: "Leitstellen",
      text: "Disponenten, Einladungen und Nachbarleitstellen",
      icon: Users,
      action: () => onOpen("friends"),
    },
    {
      name: "Hilfe / Wiki",
      text: "Bedienung, Einsatzabläufe und Serverbetrieb",
      icon: BookOpen,
      action: () => onOpen("help"),
    },
    {
      name: "Neuigkeiten",
      text: "Freigegebene Änderungen und Community",
      icon: Newspaper,
      action: () => onOpen("news"),
    },
    {
      name: "Einstellungen",
      text: "Audio, Darstellung, Steuerung & Konto",
      icon: Settings,
      action: () => onOpen("settings"),
    },
    {
      name: "Abmelden",
      text: "Sitzung sicher verlassen",
      icon: Power,
      action: () => onOpen("exit"),
    },
  ];
  return (
    <main className="command-menu">
      <RegionScene save={s} />
      <div className="menu-vignette" />
      <header className="menu-brand">
        <BrandMark />
        <div>
          <h1>LEITSTELLEN-VERBUND</h1>
          <p>
            <i />
            EINSATZLEITUNG IN ECHTZEIT
          </p>
        </div>
      </header>
      <p className="menu-claim">
        SCHNELLER REAGIEREN.
        <br />
        SICHERER LEBEN.
      </p>
      <nav className="menu-actions" aria-label="Hauptmenü">
        {actions.map(({ name, text, icon: Icon, action, primary }) => (
          <button
            className={primary ? "menu-action primary" : "menu-action"}
            key={name}
            aria-label={name}
            onClick={action}
          >
            <Icon />
            <span>
              <strong>{name}</strong>
              <small>{text}</small>
            </span>
            <ChevronRight className="action-chevron" />
          </button>
        ))}
      </nav>
      <aside className="menu-intel" aria-label="Deine Leitstelle im Überblick">
        <button
          className="menu-panel menu-profile"
          onClick={() => onOpen("progress")}
        >
          <span className="profile-crest">
            <Shield />
          </span>
          <span>
            <small>Leitstellenleiter</small>
            <strong>{s.player.name}</strong>
            <span className="profile-xp">
              <span>Stufe {xp.level}</span>
              <span>
                {xp.current.toLocaleString("de-DE")} /{" "}
                {xp.required.toLocaleString("de-DE")} EP
              </span>
            </span>
            <progress value={xp.current} max={xp.required} />
          </span>
        </button>
        <section className="menu-panel">
          <h2>
            Verbundener Server <ChevronRight size={16} />
          </h2>
          <button className="last-save" onClick={onPlay}>
            <div className="save-preview">
              <RegionScene save={s} miniature />
            </div>
            <div>
              <strong>{s.player.station}</strong>
              <small>{window.location.host}</small>
              <span>
                <Clock size={14} />
                Stand{" "}
                {new Date(s.time * 1000).toLocaleString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span>
                <Siren size={14} />
                {s.missions.length} aktive Einsätze
              </span>
              <span>{modeName(mode)} · Autoritativer Server</span>
            </div>
          </button>
        </section>
        <section className="menu-panel">
          <h2>Meine Leitstelle</h2>
          <div className="station-identity">
            <Building2 />
            <div>
              <strong>{s.player.station}</strong>
              <small>Falkenried · {modeName(mode)}</small>
            </div>
          </div>
          <dl className="menu-stats">
            {[
              [Siren, "Aktive Einsätze", s.missions.length],
              [
                Truck,
                "Verfügbare Fahrzeuge",
                s.vehicles.filter((v) => !readiness(s, v)).length,
              ],
              [Users, "Einsatzkräfte gesamt", s.people.length],
              [Wallet, "Budget", credits(s.money)],
            ].map(([Icon, label, value]) => {
              const Symbol = Icon as typeof Siren;
              return (
                <div key={String(label)}>
                  <dt>
                    <Symbol />
                    {String(label)}
                  </dt>
                  <dd>{String(value)}</dd>
                </div>
              );
            })}
          </dl>
        </section>
        <section className="menu-panel menu-news">
          <h2>
            Neuigkeiten{" "}
            <button onClick={() => onOpen("news")}>Alle anzeigen</button>
          </h2>
          <div className="news-visual">
            <Radio />
            <span>
              DEINE REGION.
              <br />
              DEINE ENTSCHEIDUNGEN.
            </span>
          </div>
          <button className="news-copy" onClick={() => onOpen("news")}>
            <strong>{news?.title ?? "Projektinformationen"}</strong>
            <p>
              {news?.summary ?? "Veröffentlichte Meldungen auf GitHub ansehen."}
            </p>
            <span className="news-dots">
              ● <i>● ●</i>
            </span>
          </button>
        </section>
      </aside>
      <div className="menu-lower">
        <p>
          MENSCHEN · TECHNOLOGIE · SICHERHEIT
          <br />
          FÜR EINE STARKE REGION
        </p>
        <div className="menu-worlds" aria-label="Spielmodus">
          <span>PC · Multiplayer · Maus & Tastatur</span>
        </div>
        <span
          className={`menu-connection ${readonly ? "is-offline" : ""}`}
          role="status"
        >
          <i />
          {readonly
            ? "Verbindung unterbrochen · letzter bestätigter Stand"
            : "Mit Server verbunden"}
        </span>
      </div>
      <footer className="menu-footer">
        <span>Version {version}</span>
        <span className="footer-project">
          Eine Echtzeit-Simulation · Leitstellen-Verbund
        </span>
        <nav>
          <SoundButton />
          {[
            ["credits", BookOpen, "Credits"],
            ["privacy", Shield, "Datenschutz"],
            ["support", LifeBuoy, "Support"],
            ["language", Globe, "Deutsch"],
          ].map(([id, Icon, text]) => {
            const Symbol = Icon as typeof Newspaper;
            return (
              <button key={String(id)} onClick={() => onOpen(String(id))}>
                <Symbol />
                {String(text)}
              </button>
            );
          })}
        </nav>
      </footer>
    </main>
  );
}
