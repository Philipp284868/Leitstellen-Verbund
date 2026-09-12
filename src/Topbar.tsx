import { Menu, Radio, Clock, Wallet, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Save } from "./model";
import { progress } from "./progression";
import { credits } from "./ui";
import { useNetwork } from "./network";
import { situationNames, situationLevel } from "./simulation/world-situation";
import { WorldSituationView, PublicAlarmList } from "./WorldSituationView";
import { requestDialogTransition } from "./dialog-state";
const groups = [
  [
    "Disposition",
    [
      ["calls", "Notrufarbeitsplatz"],
      ["fleet", "Fuhrpark"],
      ["facilities", "Standorte kaufen"],
      ["stations", "Standorte verwalten"],
      ["aaos", "AAO"],
      ["fms", "FMS & Alarmierung"],
    ],
  ],
  [
    "Zusammenarbeit",
    [
      ["friends", "Kooperation & Disponenten"],
      ["situation", "Gemeinsame Einsatzlagen"],
      ["civil", "Katastrophenbereitschaft"],
    ],
  ],
  [
    "Auswertung",
    [
      ["archive", "Archiv & Statistik"],
      ["progress", "Fortschritt"],
      ["players", "Leaderboard"],
      ["news", "Changelogs"],
    ],
  ],
  [
    "Arbeitsplatz",
    [
      ["search", "Suche"],
      ["settings", "Einstellungen"],
      ["account", "Konto & Sicherheit"],
      ["backups", "Sicherungen"],
      ["support", "Support"],
    ],
  ],
] as const;
export function Topbar({
  s,
  onMenu,
  panel,
  onSearch,
}: {
  s: Save;
  onMenu: () => void;
  panel: (id: string) => void;
  onSearch: () => void;
}) {
  const [popup, setPopup] = useState("");
  const root = useRef<HTMLElement>(null);
  const { alarms } = useNetwork();
  const xp = progress(s.xp);
  const act = (fn: () => void) =>
    requestDialogTransition(() => {
      setPopup("");
      fn();
    });
  useEffect(() => {
    if (!popup) return;
    const anchor = document.activeElement as HTMLElement;
    const el = root.current?.querySelector<HTMLElement>(".topbar-popup");
    el?.querySelector<HTMLElement>("button")?.focus();
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setPopup("");
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setPopup("");
        anchor?.focus();
      } else if (
        ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) &&
        el?.contains(e.target as Node)
      ) {
        e.preventDefault();
        const buttons = [...el.querySelectorAll<HTMLButtonElement>("button")];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                buttons.length
        ]?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key, true);
    };
  }, [popup]);
  const toggle = (id: string) => setPopup(popup === id ? "" : id);
  return (
    <header className="topbar control-topbar" ref={root}>
      <div className="hud-identity">
        <Radio />
        <strong title={s.player.station}>{s.player.station}</strong>
      </div>
      <div className="control-menu-anchor">
        <button
          className="control-menu-button"
          aria-label="Leitstellenmenü"
          aria-expanded={popup === "navigation"}
          aria-controls="control-menu"
          onClick={() => toggle("navigation")}
        >
          <Menu />
          <span>Menü</span>
          <ChevronDown size={14} />
        </button>
        {popup === "navigation" && (
          <nav
            id="control-menu"
            className="topbar-popup control-menu"
            aria-label="Leitstellenmenü"
          >
            <button className="return-menu" onClick={() => act(onMenu)}>
              Zurück zum Hauptmenü
            </button>
            {groups.map(([title, items]) => (
              <section key={title}>
                <h3>{title}</h3>
                {items.map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() =>
                      act(() => (id === "search" ? onSearch() : panel(id)))
                    }
                  >
                    {label}
                  </button>
                ))}
              </section>
            ))}
          </nav>
        )}
      </div>
      <div className="status-tile time-tile">
        <Clock />
        <span>
          <small>Ortszeit</small>
          <time>
            {new Date(s.time * 1000).toLocaleTimeString("de-DE", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </span>
      </div>
      <button
        className="status-tile money-tile"
        aria-label="Budget und Geldjournal"
        onClick={() => act(() => panel("archive"))}
      >
        <Wallet />
        <span>
          <small>Budget</small>
          <strong>{credits(s.money)}</strong>
        </span>
      </button>
      <button
        className="status-tile level-tile"
        aria-label="Fortschritt"
        onClick={() => act(() => panel("progress"))}
      >
        <b>{xp.level}</b>
        <span>
          <small>
            Level · {xp.current.toLocaleString("de-DE")} /{" "}
            {xp.required.toLocaleString("de-DE")} XP
          </small>
          <progress value={xp.current} max={xp.required} />
        </span>
      </button>
      <div className="status-tile situation-tile">
        <button
          aria-label={`Welt- & Wetterlage ${s.worldSituation ? situationNames[s.worldSituation.profile] : "Wird geladen"} ${s.worldSituation ? situationLevel(s.worldSituation) : ""}`.trim()}
          aria-expanded={popup === "situation"}
          onClick={() => toggle("situation")}
        >
          <small>Welt- & Wetterlage</small>
          <strong>
            {s.worldSituation
              ? situationNames[s.worldSituation.profile]
              : "Wird geladen"}
          </strong>
          <span>
            {s.worldSituation ? situationLevel(s.worldSituation) : ""}
          </span>
        </button>
        {popup === "situation" && (
          <section className="topbar-popup status-popup">
            <WorldSituationView s={s} />
            <button onClick={() => act(() => panel("situation"))}>
              Lagedetails öffnen
            </button>
          </section>
        )}
      </div>
      <div className="status-tile alarm-tile" data-alarm={alarms.length > 0}>
        <button
          aria-expanded={popup === "alarm"}
          onClick={() => toggle("alarm")}
        >
          <small>Katastrophenalarm</small>
          <strong>
            {alarms.length
              ? alarms.length === 1
                ? alarms[0].name
                : `${alarms.length} Leitstellen`
              : "Kein Katastrophenalarm"}
          </strong>
        </button>
        {popup === "alarm" && (
          <section className="topbar-popup status-popup">
            <PublicAlarmList alarms={alarms} />
            <button onClick={() => act(() => panel("civil"))}>
              Eigene Bereitschaft verwalten
            </button>
          </section>
        )}
      </div>
    </header>
  );
}
