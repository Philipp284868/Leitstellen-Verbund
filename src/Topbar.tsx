import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Radio,
  Truck,
  Building2,
  Layers,
  Users,
  Search,
  Settings,
  Phone,
  Siren,
  Shield,
  Clock,
  Wallet,
  TriangleAlert,
  ChevronDown,
  X,
} from "lucide-react";
import type { Save } from "./model";
import { progress } from "./progression";
import { credits } from "./ui";
import { weatherNames } from "./simulation/weather";
import { WORLD_NAME } from "./world-choice";

export function Topbar({
  s,
  listOpen,
  layers,
  callCount,
  radioCount,
  aidCount,
  playerCount,
  readonly,
  onMenu,
  onMissions,
  onCall,
  onRadio,
  onLayers,
  onSearch,
  panel,
}: {
  s: Save;
  listOpen: boolean;
  layers: boolean;
  callCount: number;
  radioCount: number;
  aidCount: number;
  playerCount: number;
  readonly: boolean;
  onMenu: () => void;
  onMissions: () => void;
  onCall: () => void;
  onRadio: () => void;
  onLayers: () => void;
  onSearch: () => void;
  panel: (id: string) => void;
}) {
  const [menu, setMenu] = useState("");
  const root = useRef<HTMLElement>(null);
  const faults = s.vehicles.filter(
    (v) => v.fault && v.fault.state !== "repaired",
  ).length;
  const xp = progress(s.xp);
  const date = new Date(s.time * 1000);
  const action = (fn: () => void) => {
    setMenu("");
    fn();
  };
  useEffect(() => {
    if (!menu) return;
    const owner = root.current;
    const popup = owner?.querySelector<HTMLElement>(".topbar-popup");
    popup?.querySelector<HTMLElement>("button")?.focus();
    const outside = (e: PointerEvent) => {
      if (!owner?.contains(e.target as Node)) setMenu("");
    };
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setMenu("");
        owner?.querySelector<HTMLElement>(`[data-popup="${menu}"]`)?.focus();
      } else if (
        ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) &&
        popup?.contains(e.target as Node)
      ) {
        e.preventDefault();
        const buttons = [
          ...popup.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
        ];
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        buttons[
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                buttons.length
        ]?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", keyboard, true);
    };
  }, [menu]);
  const count = (n: number) =>
    n > 0 ? (
      <b className="topbar-count" title={String(n)}>
        {n > 99 ? "99+" : n}
      </b>
    ) : null;
  const popup = (
    id: string,
    label: string,
    icon: ReactNode,
    content: ReactNode,
    badge = 0,
  ) => (
    <div className="topbar-group">
      <button
        data-popup={id}
        aria-label={label}
        title={label}
        aria-expanded={menu === id}
        aria-controls={`topbar-${id}`}
        onClick={() => setMenu(menu === id ? "" : id)}
      >
        {icon}
        <span>{label}</span>
        {count(badge)}
        <ChevronDown className="topbar-chevron" />
      </button>
      {menu === id && (
        <section
          id={`topbar-${id}`}
          className="topbar-popup"
          aria-label={label}
          onBlur={(e) => {
            if (
              e.relatedTarget &&
              !e.currentTarget.parentElement?.contains(e.relatedTarget)
            )
              setMenu("");
          }}
        >
          {content}
        </section>
      )}
    </div>
  );
  return (
    <header className="topbar" ref={root}>
      <button
        className="hud-identity"
        aria-label="Hauptmenü"
        title={`${s.player.station} · ${window.location.host}`}
        onClick={() => action(onMenu)}
      >
        <Radio />
        <span>
          <strong>{s.player.station}</strong>
          <small>
            {WORLD_NAME} · {readonly ? "Verbindung fehlt" : "Verbunden"}
          </small>
        </span>
      </button>
      <nav className="topbar-navigation" aria-label="Spielbereiche">
        <button
          aria-label={
            listOpen ? "Einsatzliste einklappen" : "Einsatzliste ausklappen"
          }
          aria-expanded={listOpen}
          onClick={() => action(onMissions)}
        >
          <Siren />
          <span>Einsätze</span>
          {count(s.missions.length)}
        </button>
        <button
          className={callCount ? "needs-attention topbar-icon" : "topbar-icon"}
          aria-label={`Notrufe (${callCount})`}
          title="Nächsten Notruf öffnen"
          onClick={() => action(onCall)}
        >
          <Phone />
          {count(callCount)}
        </button>
        <button
          aria-label="Fuhrpark"
          title="Fahrzeuge und Einsatzbereitschaft"
          onClick={() => action(() => panel("fleet"))}
        >
          <Truck />
          <span>Fahrzeuge</span>
        </button>
        <button
          aria-label="Wachen"
          title="Gebäude, Bau und Ausbau"
          onClick={() => action(() => panel("stations"))}
        >
          <Building2 />
          <span>Gebäude</span>
        </button>
        {popup(
          "radio",
          "Funk",
          <Radio />,
          <>
            <button onClick={() => action(onRadio)}>
              Sprechwünsche {count(radioCount)}
            </button>
            <button onClick={() => action(() => panel("friends"))}>
              Verbund & Leitstellenfunk {count(aidCount)}
            </button>
            <button onClick={() => action(() => panel("fms"))}>
              FMS & Alarmierungsprofile
            </button>
          </>,
          radioCount + aidCount,
        )}
        <button
          aria-label="Karte"
          title="Kartenwerkzeuge, Ebenen und Legende"
          aria-expanded={layers}
          onClick={() => action(onLayers)}
        >
          <Layers />
          <span>Karte</span>
        </button>
        <button
          aria-label="Spieler"
          title="Spieler dieser Serverwelt"
          onClick={() => action(() => panel("players"))}
        >
          <Users />
          <span>Spieler</span>
          {count(playerCount)}
        </button>
        <button
          className="topbar-icon"
          aria-label="Kartensuche"
          title="Ort, Adresse oder Fahrzeug suchen"
          onClick={() => action(onSearch)}
        >
          <Search />
        </button>
      </nav>
      <div className="topbar-status">
        {(faults > 0 || readonly) &&
          popup(
            "warnings",
            "Warnungen",
            <TriangleAlert />,
            <>
              {readonly && (
                <p role="alert">
                  Verbindung unterbrochen. Aktionen sind gesperrt.
                </p>
              )}
              {faults > 0 && (
                <button onClick={() => action(() => panel("fleet"))}>
                  {faults} Fahrzeugstörungen · Fuhrpark öffnen
                </button>
              )}
              <button onClick={() => action(onLayers)}>
                Wetter & Betrieb ansehen
              </button>
            </>,
            faults + Number(readonly),
          )}
        <span
          className="hud-clock"
          title={`${date.toLocaleString("de-DE")} · Echtzeit · Simuliertes Wetter: ${s.environment ? `${weatherNames[s.environment.kind]}, ${s.environment.temperature} °C` : "wird ermittelt"}`}
        >
          <Clock />
          <time>
            {date.toLocaleTimeString("de-DE", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </span>
        <span className="hud-budget" title="Verfügbares Budget">
          <Wallet />
          <strong>{credits(s.money)}</strong>
        </span>
        <button
          className="hud-profile"
          aria-label="Fortschritt"
          title={`Stufe ${xp.level} · ${xp.current}/${xp.required} XP`}
          onClick={() => action(() => panel("progress"))}
        >
          <Shield />
          <span>{xp.level}</span>
          <progress value={xp.current} max={xp.required} />
        </button>
        <button
          className="topbar-icon"
          aria-label="Einstellungen"
          title="Einstellungen und Hilfe"
          onClick={() => action(() => panel("settings"))}
        >
          <Settings />
        </button>
      </div>
    </header>
  );
}

export function HudNotice({ message }: { message: string }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(false);
    if (!message) return;
    const timer = setTimeout(() => setHidden(true), 9000);
    return () => clearTimeout(timer);
  }, [message]);
  return message && !hidden ? (
    <div className="hud-notice" role="status">
      <Radio size={16} />
      <span>{message}</span>
      <button aria-label="Meldung schließen" onClick={() => setHidden(true)}>
        <X size={16} />
      </button>
    </div>
  ) : null;
}
