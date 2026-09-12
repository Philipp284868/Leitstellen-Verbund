import {
  Building2,
  ChevronRight,
  Clock,
  LifeBuoy,
  Newspaper,
  Play,
  Power,
  Settings,
  Shield,
  Siren,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { version } from "../package.json";
import { BrandMark } from "./BrandMark";
import "./MainMenu.css";
import { fleetReadiness } from "./fleet-view";
import { GermanyScene } from "./germany/GermanyScene";
import { modeName } from "./mode";
import type { Save } from "./model";
import { WORLD_NAME } from "./product";
import { progress } from "./progression";
import { useGame } from "./store";
import { credits } from "./ui";
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
  const available = fleetReadiness(s);
  const xp = progress(s.xp);
  const actions = [
    {
      name: "Spielen",
      text: "Mit der verbundenen Leitstelle spielen",
      icon: Play,
      action: onPlay,
      primary: true,
    },
    {
      name: "Leaderboard",
      text: "Rangliste und echte Spielstatistiken",
      icon: Users,
      action: () => onOpen("players"),
    },
    {
      name: "Changelogs",
      text: "Versionen, Verbesserungen und Fehlerkorrekturen",
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
      name: "Support",
      text: "Bedienung, Einsatzabläufe und Serverbetrieb",
      icon: LifeBuoy,
      action: () => onOpen("support"),
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
      <GermanyScene save={s} />
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
      <nav className="menu-actions" aria-label="Hauptmenü">
        {actions.map(({ name, text, icon: Icon, action, primary }) => (
          <button
            className={primary ? "menu-action primary" : "menu-action"}
            key={name}
            aria-label={name}
            disabled={primary && readonly}
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
            Deine Spielwelt <ChevronRight size={16} />
          </h2>
          <button className="last-save" onClick={onPlay}>
            <div className="save-preview">
              <GermanyScene save={s} miniature />
            </div>
            <div>
              <strong>{s.player.station}</strong>
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
              <span>{modeName(mode)}</span>
            </div>
          </button>
        </section>
        <section className="menu-panel">
          <h2>Meine Leitstelle</h2>
          <div className="station-identity">
            <Building2 />
            <div>
              <strong>{s.player.station}</strong>
              <small>
                {WORLD_NAME} · {modeName(mode)}
              </small>
            </div>
          </div>
          <dl className="menu-stats">
            {[
              [Siren, "Aktive Einsätze", s.missions.length],
              [
                Truck,
                "Verfügbare Fahrzeuge",
                s.vehicles.filter((v) => !available(v)).length,
              ],
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
        <section className="menu-panel discord-card">
          <span className="eyebrow">COMMUNITY</span>
          <h2>Gaminglive – Discord</h2>
          <p>Gemeinsam disponieren. Fragen stellen. Erfahrungen teilen.</p>
          <a
            className="discord-button"
            href="https://discord.gg/RgtUHaWpcQ"
            target="_blank"
            rel="noopener noreferrer"
          >
            Discord beitreten ↗
          </a>
        </section>
      </aside>
      <span className="menu-version">Version {version}</span>
    </main>
  );
}
