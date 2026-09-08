import { WORLD_NAME, IS_GERMANY } from "./world-choice";
import { useState, useRef, useEffect, type ReactNode } from "react";
import {
  Radio,
  TowerControl,
  Truck,
  Users,
  Settings,
  Layers,
  Map as MapIcon,
  Siren,
  NotebookTabs,
  Search,
  CloudRain,
  Sun,
  Cloud,
  CloudLightning,
  Wind,
  Snowflake,
  CloudFog,
  Wallet,
  Clock,
  ChevronRight,
  X,
  Crosshair,
} from "lucide-react";
import type { Save } from "./model";
import type { GameMode } from "./mode";
import { modeName } from "./mode";
import { useNetwork } from "./network";
import { mt } from "./catalog";
import { districtAt } from "./world";
import { credits } from "./ui";
import { act } from "./store";
import { MapView } from "./Map";
import { OperationsOverview } from "./Major";
import { DeskQueue } from "./Desk";
import { missionList } from "./workspace";
import { SoundButton } from "./Sound";
import { IncidentDock } from "./IncidentDock";
import { IncidentIcon } from "./HudIcons";
import { weatherNames } from "./simulation/weather";
type Props = {
  s: Save;
  mode: GameMode;
  selected: string;
  open: (id: string) => void;
  setModal: (panel: string) => void;
  placing: string;
  setPlacing: (kind: string) => void;
  readonly: boolean;
  notice: string;
  onMenu: () => void;
  detail: ReactNode;
  showDetail: boolean;
  onCloseDetail: () => void;
  search: string;
  setSearch: (value: string) => void;
  filter: string;
  setFilter: (value: string) => void;
  sort: string;
  setSort: (value: string) => void;
  userId?: string;
  tutorial: string;
};
export function GameHud({
  s,
  mode,
  selected,
  open,
  setModal,
  placing,
  setPlacing,
  readonly,
  notice,
  onMenu,
  detail,
  showDetail,
  onCloseDetail,
  search,
  setSearch,
  filter,
  setFilter,
  sort,
  setSort,
  userId,
  tutorial,
}: Props) {
  const net = useNetwork(),
    user = { id: userId };
  const [listOpen, setListOpen] = useState(true),
    [layers, setLayers] = useState(false);
  const [tab, setTab] = useState("details");
  const dock = useRef<HTMLElement>(null);
  const WeatherIcon = {
    sun: Sun,
    heat: Sun,
    cloud: Cloud,
    rain: CloudRain,
    "heavy-rain": CloudRain,
    storm: CloudLightning,
    gale: Wind,
    hurricane: Wind,
    fog: CloudFog,
    snow: Snowflake,
    ice: Snowflake,
    frost: Snowflake,
  }[s.environment?.kind ?? "cloud"];
  useEffect(() => setTab("details"), [selected]);
  const pendingRadio = s.missions.reduce(
    (n, m) =>
      n +
      (m.control?.radio.filter((r) => r.state === "open").length ?? 0) +
      (m.control?.calls.filter(
        (c) => c.state === "ringing" || c.state === "active",
      ).length ?? 0),
    0,
  );
  const focusSection = (section: string) => {
    setTab(section);
    const target = dock.current?.querySelector<HTMLElement>(
      `[data-hud-section="${section}"]`,
    );

    (
      target ??
      (section === "radio"
        ? dock.current?.querySelector<HTMLElement>(
            '[data-hud-section="arrival"]',
          )
        : null) ??
      dock.current?.querySelector<HTMLElement>(".incident-desk")
    )?.scrollIntoView({ block: "start", behavior: "instant" });
  };
  const choose = (id: string) => {
    open(id);
    setTab("details");
  };
  const alarm = () => {
    const m = s.missions.find((m) => m.id === selected) ?? s.missions[0];
    if (m) {
      open(m.id);
      requestAnimationFrame(() => focusSection("vehicles"));
    } else setModal("aaos");
  };
  return (
    <div
      className="hud-shell"
      data-list-open={listOpen}
      data-detail-open={showDetail}
      data-map-tools={layers}
    >
      <header className="topbar">
        <button
          className="hud-identity"
          aria-label="Hauptmenü"
          onClick={onMenu}
        >
          <Radio />
          <span>
            <strong>{s.player.station}</strong>
            <small>
              <span className="hud-mode">{modeName(mode)}</span> · Region{" "}
              {WORLD_NAME}
            </small>
          </span>
        </button>
        <div className="hud-clock">
          <small>
            {new Date(s.time * 1000).toLocaleDateString("de-DE", {
              weekday: "short",
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </small>
          <strong>
            {new Date(s.time * 1000).toLocaleTimeString("de-DE", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </strong>
        </div>
        <div className="hud-weather">
          <WeatherIcon />
          <span>
            <strong>
              {s.environment ? `${s.environment.temperature} °C` : "Wetterlage"}
            </strong>
            <small>
              {s.environment
                ? weatherNames[s.environment.kind]
                : "Wird ermittelt"}
            </small>
          </span>
        </div>
        <div className="hud-counter">
          <Siren />
          <span>
            <strong>{s.missions.length}</strong>
            <small>Aktive Einsätze</small>
          </span>
        </div>
        <div className="hud-budget">
          <Wallet />
          <span>
            <strong>{credits(s.money)}</strong>
            <small>Budget</small>
          </span>
        </div>
        <div className="hud-time-mode">
          <Clock />
          <span>
            Echtzeit <b>1×</b>
          </span>
        </div>
        <p className="hud-claim">
          Schneller reagieren.
          <br />
          Sicherer leben.
        </p>
      </header>
      <main className="map-column">
        <MapView
          s={s}
          selected={selected}
          onSelect={choose}
          placing={placing}
          readonly={readonly}
          onCancelPlace={() => setPlacing("")}
          onPlace={(pos) => {
            void act({ type: "build", kind: placing, pos });
            setPlacing("");
          }}
          friends={net.friends}
        />
      </main>
      <div className="hud-left-controls">
        <button
          aria-label={
            listOpen && !layers
              ? "Einsatzliste einklappen"
              : "Einsatzliste ausklappen"
          }
          onClick={() => {
            if (layers) {
              setLayers(false);
              setListOpen(true);
            } else setListOpen(!listOpen);
            if (innerWidth <= 700) onCloseDetail();
          }}
        >
          <Siren size={16} />
          <span>Einsätze ({s.missions.length})</span>
          {listOpen ? <X size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>
      <div className="workspace">
        <aside className="mission-sidebar">
          <OperationsOverview s={s} open={open} />
          <details className="queue-slot">
            <summary>
              Notrufe & Sprechwünsche <span>{pendingRadio}</span>
            </summary>
            <DeskQueue s={s} open={open} panel={setModal} />
          </details>
          <details className="mission-filters">
            <summary>Suchen, filtern und sortieren</summary>
            <label>
              Einsätze durchsuchen
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Einsatz, Ort, Fahrzeug, Patient …"
              />
            </label>
            <label>
              Einsatzfilter
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {[
                  ["all", "Alle Einsätze"],
                  ["Feuerwehr", "Feuerwehr"],
                  ["Rettungsdienst", "Rettungsdienst"],
                  ["Polizei", "Polizei"],
                  ["THW", "THW"],
                  ["critical", "Kritisch"],
                  ["major", "Großlagen / MANV"],
                  ["request", "Offene Sprechwünsche"],
                  ["mine", "Von mir angenommen"],
                ].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Einsatzsortierung
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {[
                  ["priority", "Priorität"],
                  ["time", "Älteste zuerst"],
                  ["distance", "Entfernung zur ersten Wache"],
                  ["escalation", "Eskalation"],
                  ["patients", "Patientenzahl"],
                ].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => {
                setSearch("");
                setFilter("all");
                setSort("priority");
              }}
            >
              Filter zurücksetzen
            </button>
          </details>
          <div className="org-filters" aria-label="Organisationen">
            {["all", "Feuerwehr", "Rettungsdienst", "Polizei"].map((org) => (
              <button
                key={org}
                aria-pressed={filter === org}
                onClick={() => setFilter(org)}
              >
                {org === "all"
                  ? "Alle"
                  : org === "Rettungsdienst"
                    ? "Rettung"
                    : org}
                <b>
                  {org === "all"
                    ? s.missions.length
                    : s.missions.filter((m) => mt(m.template).org === org)
                        .length}
                </b>
              </button>
            ))}
          </div>
          <div className="mission-list">
            {missionList(s, search, filter, sort, user?.id).map((m) => {
              const t = mt(m.template);
              return (
                <button
                  key={m.id}
                  className={`mission-card ${selected === m.id ? "selected" : ""}`}
                  onClick={() => open(m.id)}
                >
                  <span className="mission-number" data-org={t.org}>
                    <IncidentIcon org={t.org} />
                  </span>
                  <div>
                    <span className="eyebrow">
                      {t.org}
                      {m.major ? " · GROSSLAGE" : ""}
                      {m.shared ? " · VERBUND" : ""}
                    </span>
                    <h3>
                      {m.control && !m.control.reportedTemplate
                        ? "Ungeklärter Notruf"
                        : t.name}
                    </h3>
                    <p>
                      {m.control && !m.control.locationKnown
                        ? "Einsatzort noch erfragen"
                        : IS_GERMANY
                          ? m.control?.secret?.address ||
                            "Einsatzort auf der Deutschlandkarte"
                          : `${WORLD_NAME} · ${districtAt(m.pos)}`}
                    </p>
                    <div className="mission-meta">
                      <span
                        className={
                          m.phase === "offered" ? "status waiting" : "status"
                        }
                      >
                        {m.phase === "offered"
                          ? "Kräfte benötigt"
                          : m.phase === "working"
                            ? "In Bearbeitung"
                            : "Transport"}
                      </span>
                      <time>
                        {new Date(m.created * 1000).toLocaleTimeString(
                          "de-DE",
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </time>
                    </div>
                    <progress value={m.progress} max={t.seconds} />
                  </div>
                </button>
              );
            })}
            {!!s.missions.length &&
              !missionList(s, search, filter, sort, user?.id).length && (
                <p className="filter-empty">
                  Keine Einsätze passen zum Filter.
                </p>
              )}
            {!s.missions.length && (
              <div className="empty">
                <Radio size={32} />
                <h3>Bereitschaft herstellen</h3>
                <p>
                  Mit geeigneten Fahrzeugen gehen hier automatisch passende
                  Einsätze ein.
                </p>
                <button onClick={() => setModal("build")}>
                  Erste Wache bauen
                </button>
              </div>
            )}
          </div>
          {mode === "multi" && (
            <button
              className="shared-inbox"
              onClick={() => setModal("friends")}
            >
              <Users size={18} />
              <span>Leitstellenverbund und Disponenten</span>
              <b>
                {
                  net.requests.filter(
                    (r) =>
                      r.peer === s.player.id &&
                      ["SENT", "ACCEPTED", "IN_PROGRESS"].includes(r.state),
                  ).length
                }
              </b>
            </button>
          )}
          <button className="archive-link" onClick={() => setModal("archive")}>
            Einsatzarchiv <span>{s.completed} abgeschlossen →</span>
          </button>
        </aside>
      </div>
      {showDetail && (
        <IncidentDock
          mission={
            s.missions.find((m) => m.id === selected) ??
            s.archive.find((m) => m.id === selected)
          }
          dockRef={dock}
          tab={tab}
          onSection={focusSection}
          onClose={onCloseDetail}
          readonly={readonly}
        >
          {detail}
        </IncidentDock>
      )}
      <div className="hud-feed radio-bar" aria-live="polite">
        <span>
          <Radio size={14} />
          {new Date(s.time * 1000).toLocaleTimeString("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <p>
          {notice ||
            (readonly
              ? "Verbindung fehlt · letzter bestätigter Stand"
              : "Mit Spielserver verbunden. · Echtzeit")}
        </p>
      </div>
      {s.tutorial < 6 && (
        <details className="tutorial">
          <summary>Deine erste Schicht · Anleitung öffnen</summary>
          <p>{tutorial}</p>
          <button
            onClick={() => setModal(s.tutorial === 0 ? "build" : "stations")}
          >
            Nächster Schritt →
          </button>
        </details>
      )}
      <footer className="hud-bottom">
        <nav className="hud-resources" aria-label="Spielbereiche">
          <button
            aria-label="Karte"
            aria-pressed={!layers}
            onClick={() => {
              setLayers(false);
              setListOpen(false);
              onCloseDetail();
            }}
          >
            <MapIcon />
            <span>Karte</span>
          </button>
          <button aria-label="Fuhrpark" onClick={() => setModal("fleet")}>
            <Truck />
            <span>Fahrzeuge</span>
          </button>
          <button onClick={() => setModal("personnel")}>
            <Users />
            <span>Personal</span>
          </button>
          <button aria-label="Wachen" onClick={() => setModal("stations")}>
            <TowerControl />
            <span>Gebäude</span>
          </button>
          <button
            aria-label="Layer"
            aria-pressed={layers}
            onClick={() => setLayers(!layers)}
          >
            <Layers />
            <span>Layer</span>
            {s.vehicles.some(
              (v) => v.fault && v.fault.state !== "repaired",
            ) && (
              <b
                className="hud-fault-badge"
                title="Fahrzeugstörungen und Reparaturen in der Betriebsübersicht"
              >
                !
              </b>
            )}
          </button>
        </nav>
        <nav className="hud-dispatch" aria-label="Disposition">
          <button className="primary" onClick={alarm}>
            <Siren />
            <span>Alarmieren</span>
          </button>
          <button
            onClick={() => {
              const m = s.missions.find(
                (m) =>
                  m.control?.radio.some((r) => r.state === "open") ||
                  m.control?.calls.some((c) => c.state === "ringing"),
              );
              if (m) {
                open(m.id);
                requestAnimationFrame(() => focusSection("radio"));
              } else setModal("fms");
            }}
          >
            <Radio />
            <span>Funk{pendingRadio ? ` (${pendingRadio})` : ""}</span>
          </button>
          <button onClick={() => setModal("archive")}>
            <NotebookTabs />
            <span>Einsatzprotokoll</span>
          </button>
        </nav>
        <div className="hud-tools">
          <SoundButton />
          <button
            className="hud-search-toggle"
            onClick={() => {
              setLayers(true);
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLInputElement>(
                    '[aria-label="Karte durchsuchen"]',
                  )
                  ?.focus(),
              );
            }}
          >
            <Search />
            <span>Ort, Wache, Fahrzeug suchen …</span>
          </button>
          <button
            aria-label="Kartenauswahl zentrieren"
            disabled={
              !s.vehicles.some((v) => v.id === selected) &&
              !s.buildings.some((b) => b.id === selected) &&
              !s.missions.some(
                (m) =>
                  m.id === selected && (!m.control || m.control.locationKnown),
              )
            }
            onClick={() =>
              document
                .querySelector<HTMLButtonElement>("[data-center-selection]")
                ?.click()
            }
          >
            <Crosshair />
          </button>
          <button
            aria-label="Einstellungen"
            onClick={() => setModal("settings")}
          >
            <Settings />
          </button>
        </div>
      </footer>
    </div>
  );
}
