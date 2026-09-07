import { Progression } from "./ProgressionPanel";
import { progress } from "./progression";
import { WorkspaceSettings } from "./WorkspaceSettings";
import { ReconnectSummary } from "./ReconnectSummary";
import {
  parseWorkspace,
  shortcutFor,
  missionList,
  type WorkspacePreferences,
} from "./workspace";
import "./Workspace.css";
import { DynamicsPanel } from "./Dynamics";
import { MissionPanel } from "./Panels";
import {
  DeskQueue,
  IncidentPanel,
  AAOPanel,
  FMSPanel,
  TeamPanel,
  History,
} from "./Desk";
import { AudioSession, SoundButton, SoundSettings } from "./Sound";
import { audio } from "./audio/controller";
import { districtAt } from "./world";
import { modeName } from "./mode";
import { MainMenu } from "./MainMenu";
import { AuthScreen, Account } from "./Account";
import {
  useState,
  useEffect,
  useRef,
  lazy,
  Suspense,
  type CSSProperties,
} from "react";
const ArchivePanel = lazy(() =>
  import("./Reports").then((m) => ({ default: m.ArchivePanel })),
);
const ReportPanel = lazy(() =>
  import("./Reports").then((m) => ({ default: m.ReportPanel })),
);
import {
  Radio,
  TowerControl,
  Truck,
  Users,
  ChartNoAxesCombined,
  Settings,
  HelpCircle,
  Download,
  Plus,
  MapPin,
  Activity,
  ChevronRight,
} from "lucide-react";
import { useGame, act, emit, retryStorage, change } from "./store";
import { useNetwork } from "./network";
import { mt, bt } from "./catalog";
import { level } from "./model";
import { MapView } from "./Map";
import { BuildingShop, BuildingPanel, Fleet } from "./Resources";
import { BackupPanel, ProgressPanel, Help } from "./Panels";
import { Modal, credits } from "./ui";
import { download } from "./storage";
import { updateApplication } from "./pwa";
export function App() {
  const { mode } = useGame();
  return (
    <>
      <AudioSession />
      <GameApp key={mode} />
    </>
  );
}
function GameApp() {
  const { save: s, mode, loading, readonly, error, notice, user } = useGame();
  const priorProgress = useRef<{ generation: string; level: number } | null>(
    null,
  );
  useEffect(() => {
    if (!s || readonly) return;
    const current = level(s),
      previous = priorProgress.current;
    if (previous?.generation === s.generation && current > previous.level)
      emit({
        notice: `Stufe ${previous.level} → ${current} erreicht. Neue Freischaltungen unter Fortschritt.`,
      });
    priorProgress.current = { generation: s.generation, level: current };
  }, [s, readonly]);

  const net = useNetwork();
  const [screen, setScreen] = useState("start"),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState(""),
    [placing, setPlacing] = useState(""),
    [light, setLight] = useState<boolean | null>(null),
    [reduced, setReduced] = useState<boolean | null>(null),
    [mobile, setMobile] = useState("map");
  useEffect(() => {
    audio.scene(screen === "game");
  }, [screen]);
  const [layout, setLayout] = useState(() => {
    try {
      return parseWorkspace(localStorage.getItem("lv-workspace-v1"));
    } catch {
      return parseWorkspace(null);
    }
  });
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("priority");
  const updateLayout = (next: WorkspacePreferences) => {
    setLayout(next);
    try {
      localStorage.setItem("lv-workspace-v1", JSON.stringify(next));
    } catch {
      /* Layout remains usable this visit. */
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!s || screen !== "game" || e.defaultPrevented) return;
      const editing =
        e.target instanceof Element &&
        !!e.target.closest("input,textarea,select,[contenteditable=true]");
      const action = shortcutFor(e, layout.keys, editing);
      if (!action) return;
      e.preventDefault();
      if (action === "police" || action === "ems") {
        setFilter(action === "police" ? "Polizei" : "Rettungsdienst");
        setMobile("missions");
        setModal("");
      } else if (action === "missions") {
        setFilter("all");
        setMobile("missions");
        setModal("");
      } else if (action === "call" || action === "alarm") {
        const mission =
          action === "call"
            ? s.missions.find((m) =>
                m.control?.calls.some((c) => c.state === "ringing"),
              )
            : (s.missions.find((m) => m.id === selected) ?? s.missions[0]);
        if (mission) {
          setSelected(mission.id);
          setModal("mission");
        }
      } else setModal(action);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [s, screen, selected, layout.keys]);
  const tutorial = [
    "Baue deine erste Feuerwache. Wähle „Wache bauen“ und einen Bauplatz auf der Karte.",
    "Öffne deine Wache, warte die Bauzeit ab und kaufe zwei TSF-W.",
    "Stelle pro TSF-W sechs Mitarbeiter ein. Öffne den Fuhrpark und wähle „Besetzen“.",
    "Nimm einen Notruf an, erfrage Ort und Meldebild und alarmiere passende Fahrzeuge.",
    "Verfolge die Anfahrt, nimm die erste Lagemeldung auf und fordere fehlende Kräfte nach.",
    "Erste Belohnung erhalten! Baue deinen Fuhrpark aus und erreiche Stufe 2.",
    "Tutorial abgeschlossen.",
  ];
  if (loading)
    return (
      <div className="loading">
        <Radio size={40} />
        <h1>Leitstelle wird geöffnet …</h1>
      </div>
    );
  if (!s && user && error)
    return (
      <main className="loading">
        <h1>Spielwelt konnte nicht geladen werden</h1>
        <p role="alert">{error}</p>
        <button
          onClick={() =>
            void retryStorage().catch((e) => emit({ error: String(e) }))
          }
        >
          Erneut verbinden
        </button>
      </main>
    );
  if (!s) return <AuthScreen />;
  const open = (id: string) => {
    if (id === "friends") {
      setModal("friends");
      return;
    }
    setSelected(id);
    if (s?.buildings.some((b) => b.id === id)) setModal("building");
    else if (s?.vehicles.some((v) => v.id === id)) setModal("");
    else setModal("mission");
  };
  return (
    <div
      style={{ "--desk-width": `${layout.width}px` } as CSSProperties}
      data-sidebar={layout.side}
      data-compact={layout.compact}
      data-queue-bottom={layout.queueBottom}
      data-stations-top={layout.stationsTop}
      className={`app ${screen === "game" ? "in-game" : ""} ${(light ?? s.settings.light) ? "light" : ""} ${(reduced ?? s.settings.reduced) ? "reduced" : ""}`}
    >
      <ReconnectSummary />
      {error && (
        <div className="global-error" role="alert">
          <strong>{error}</strong>
          <button
            onClick={() =>
              void retryStorage().catch((e) => emit({ error: String(e) }))
            }
          >
            Server erneut verbinden
          </button>
          <button onClick={() => setModal("backups")}>Wiederherstellung</button>
          <button
            onClick={() =>
              download(
                "leitstellen-diagnose.json",
                JSON.stringify(
                  {
                    app: "leitstellen-verbund",
                    version: 1,
                    storageError: !!error,
                    readonly,
                    buildings: s?.buildings.length,
                    vehicles: s?.vehicles.length,
                  },
                  null,
                  2,
                ),
              )
            }
          >
            Bereinigte Diagnose
          </button>
          <button onClick={() => emit({ error: "" })}>Schließen</button>
        </div>
      )}
      {readonly && (
        <div className="banner">
          Serververbindung unterbrochen. Aktionen sind gesperrt; deine
          Leitstelle wird auf dem Server weiter simuliert.
        </div>
      )}
      {screen === "start" ? (
        <MainMenu
          save={s}
          readonly={readonly}
          onPlay={() => setScreen("game")}
          onOpen={setModal}
        />
      ) : (
        s && (
          <>
            <header className="topbar">
              <button
                aria-label="Hauptmenü"
                className="brand"
                onClick={() => setScreen("start")}
              >
                <Radio />
                <span>
                  LEITSTELLEN<b>VERBUND</b>
                </span>
              </button>
              <span className="hud-mode">{modeName(mode)}</span>
              <div className="station-title">
                <span className="live-dot" />
                <div>
                  <strong>{s.player.station}</strong>
                  <small>Region Falkenried · {s.player.name}</small>
                </div>
              </div>
              <div className="money">
                <small>VERFÜGBARE CREDITS</small>
                <strong>{credits(s.money)}</strong>
              </div>
              <div className="level">
                <span>STUFE {level(s)}</span>
                <progress
                  value={progress(s.xp).current}
                  max={progress(s.xp).required}
                />
                <small>
                  {progress(s.xp).current} / {progress(s.xp).required} Erfahrung
                </small>
              </div>
              <SoundButton />
              <button
                aria-label="Einstellungen"
                onClick={() => setModal("settings")}
              >
                <Settings />
              </button>
            </header>
            <nav className="navrail">
              <button
                className={!modal ? "active" : ""}
                aria-label="Leitstelle"
                onClick={() => setModal("")}
              >
                <TowerControl />
                <span>Leitstelle</span>
              </button>
              <button
                className={modal === "stations" ? "active" : ""}
                aria-label="Wachen"
                onClick={() => setModal("stations")}
              >
                <MapPin />
                <span>Wachen</span>
              </button>
              <button
                className={modal === "fleet" ? "active" : ""}
                aria-label="Fuhrpark"
                onClick={() => setModal("fleet")}
              >
                <Truck />
                <span>Fuhrpark</span>
              </button>
              <button
                className={modal === "friends" ? "active" : ""}
                aria-label="Freunde"
                onClick={() => setModal("friends")}
              >
                <Users />
                <span>Freunde</span>
              </button>
              <button
                className={modal === "progress" ? "active" : ""}
                aria-label="Fortschritt"
                onClick={() => setModal("progress")}
              >
                <ChartNoAxesCombined />
                <span>Fortschritt</span>
              </button>
              <button
                className={modal === "backups" ? "active" : ""}
                aria-label="Sicherungen"
                onClick={() => setModal("backups")}
              >
                <Download />
                <span>Sicherung</span>
              </button>
              <button
                className={modal === "help" ? "active" : ""}
                aria-label="Hilfe"
                onClick={() => setModal("help")}
              >
                <HelpCircle />
                <span>Hilfe</span>
              </button>
            </nav>
            <div className="workspace">
              <div className="mobile-tabs">
                <button
                  aria-pressed={mobile === "missions"}
                  onClick={() => setMobile("missions")}
                >
                  Einsätze ({s.missions.length})
                </button>
                <button
                  aria-pressed={mobile === "map"}
                  onClick={() => setMobile("map")}
                >
                  Karte
                </button>
              </div>
              <aside
                className={`mission-sidebar ${mobile === "missions" ? "mobile-visible" : ""}`}
              >
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">EINSATZGESCHÄHEN</span>
                    <h2>
                      Offene Einsätze <span>{s.missions.length}</span>
                    </h2>
                  </div>
                  <Activity size={20} />
                </div>
                <div className="sidebar-summary">
                  <span>
                    <i className="live-dot" />{" "}
                    {s.vehicles.filter((v) => v.status === "ready").length} an
                    Wache
                  </span>
                  <span>
                    {s.vehicles.filter((v) => v.status !== "ready").length}{" "}
                    unterwegs
                  </span>
                </div>
                <div className="dispatch-pace">
                  <span>
                    {s.operations.campaign || s.missions.some((m) => m.major)
                      ? "GROSSLAGENFÜHRUNG"
                      : "RUHIGE EINSATZLAGE"}
                  </span>
                  <small>
                    {s.missions.length >= 2
                      ? "Erst laufende Einsätze abschließen. Neue Meldungen warten."
                      : "Neue Meldungen kommen einzeln und zeitlich versetzt."}
                  </small>
                </div>
                <div className="queue-slot">
                  <DeskQueue s={s} open={open} panel={setModal} />
                </div>
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
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
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
                <div className="mission-list">
                  {missionList(s, search, filter, sort, user?.id).map(
                    (m, i) => {
                      const t = mt(m.template);
                      return (
                        <button
                          key={m.id}
                          className={`mission-card ${selected === m.id ? "selected" : ""}`}
                          onClick={() => open(m.id)}
                        >
                          <div className="mission-number">
                            {String(i + 1).padStart(2, "0")}
                          </div>
                          <div>
                            <span className="eyebrow">
                              {t.org}
                              {m.major ? " · GROSSLAGE" : ""}
                              {m.shared ? " · VERBUND" : ""}
                            </span>
                            <h3>{t.name}</h3>
                            <p>
                              {m.control && !m.control.locationKnown
                                ? "Einsatzort noch erfragen"
                                : `Falkenried · ${districtAt(m.pos)}`}
                            </p>
                            <div className="mission-meta">
                              <span
                                className={
                                  m.phase === "offered"
                                    ? "status waiting"
                                    : "status"
                                }
                              >
                                {m.phase === "offered"
                                  ? "Kräfte benötigt"
                                  : m.phase === "working"
                                    ? "In Bearbeitung"
                                    : "Transport"}
                              </span>
                              <b>{credits(t.reward)}</b>
                            </div>
                            <progress value={m.progress} max={t.seconds} />
                          </div>
                        </button>
                      );
                    },
                  )}
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
                        Mit geeigneten Fahrzeugen gehen hier automatisch
                        passende Einsätze ein.
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
                            ["SENT", "ACCEPTED", "IN_PROGRESS"].includes(
                              r.state,
                            ),
                        ).length
                      }
                    </b>
                  </button>
                )}
                <button
                  className="archive-link"
                  onClick={() => setModal("archive")}
                >
                  Einsatzarchiv <span>{s.completed} abgeschlossen →</span>
                </button>
              </aside>
              <main
                className={`map-column ${mobile === "map" ? "mobile-visible" : ""}`}
              >
                <MapView
                  s={s}
                  selected={selected}
                  onSelect={open}
                  placing={placing}
                  readonly={readonly}
                  onCancelPlace={() => setPlacing("")}
                  onPlace={(pos) => {
                    void act({ type: "build", kind: placing, pos });
                    setPlacing("");
                  }}
                  friends={net.friends}
                />
                <section className="bottom-panel">
                  <div className="panel-heading">
                    <span className="eyebrow">DEINE BEREITSCHAFT</span>
                    <button
                      className="primary"
                      onClick={() => setModal("build")}
                    >
                      <Plus size={16} /> Wache bauen
                    </button>
                  </div>
                  <div className="station-strip">
                    {s.buildings.map((b) => (
                      <button
                        className="station-card"
                        key={b.id}
                        onClick={() => open(b.id)}
                      >
                        <span className={`org-icon ${b.type}`}>
                          <TowerControl size={22} />
                        </span>
                        <div>
                          <b>{b.name}</b>
                          <small>
                            {bt(b.type).org} · Stufe {b.level}
                          </small>
                          <span>
                            {s.vehicles.filter((v) => v.home === b.id).length}{" "}
                            Fahrzeuge ·{" "}
                            {s.people.filter((p) => p.home === b.id).length}{" "}
                            Personal
                          </span>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                    {!s.buildings.length && (
                      <p>
                        Der erste Schritt: eine Feuerwache für 55.000 Credits
                        bauen.
                      </p>
                    )}
                  </div>
                </section>
              </main>
            </div>
            <footer className="radio-bar">
              <span>
                <Radio size={17} /> FUNK
              </span>
              <p aria-live="polite">
                {notice ||
                  "Leitstelle betriebsbereit. Dein Spielstand wird auf dem Server gespeichert."}
              </p>
              <span className="save-indicator">
                {readonly ? "● Verbindung fehlt" : "● Server bestätigt"}
              </span>
              <span title="Eine Spielsekunde entspricht einer echten Sekunde">
                ◷ Echtzeit
              </span>
            </footer>
            {s.tutorial < 6 && (
              <details className="tutorial">
                <summary>Deine erste Schicht · Anleitung öffnen</summary>
                <span className="eyebrow">
                  DEINE ERSTE SCHICHT · {s.tutorial + 1}/6
                </span>
                <p>{tutorial[s.tutorial]}</p>
                <button
                  onClick={() =>
                    s.tutorial === 0
                      ? setModal("build")
                      : s.tutorial < 3
                        ? setModal("stations")
                        : s.tutorial === 3
                          ? setModal("fleet")
                          : setModal("help")
                  }
                >
                  Nächster Schritt →
                </button>
              </details>
            )}
          </>
        )
      )}
      {modal && (
        <Modal
          title={
            (
              {
                new: "Neue Leitstelle",
                build: "Wache bauen",
                stations: "Wachen verwalten",
                building: "Wachendetails",
                fleet: "Fuhrpark",
                mission: "Einsatzdisposition",
                friends: "Leitstellenverbund und Disponenten",
                aaos: "Alarm- und Ausrückeordnung",
                fms: "FMS und Alarmierungsprofile",
                backups: "Spielstände und Sicherungen",
                progress: "Fortschritt und Erfolge",
                archive: "Einsatzarchiv und Geldjournal",
                help: "Spielanleitung",
                settings: "Einstellungen",
              } as Record<string, string>
            )[modal]
          }
          onClose={() => setModal("")}
        >
          {modal === "help" && <Help />}
          {modal === "backups" && <BackupPanel s={s} />}
          {modal === "settings" && (
            <>
              <WorkspaceSettings value={layout} change={updateLayout} />
              <SoundSettings />
              <Account />
              <label>
                <input
                  type="checkbox"
                  checked={light ?? s.settings.light}
                  disabled={readonly || light !== null || reduced !== null}
                  onChange={(e) => {
                    const value = e.target.checked;
                    setLight(value);
                    if (s)
                      void change((s) => {
                        s.settings.light = value;
                      })
                        .catch(() => {})
                        .finally(() => setLight(null));
                  }}
                />{" "}
                Heller Modus
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={reduced ?? s.settings.reduced}
                  disabled={readonly || light !== null || reduced !== null}
                  onChange={(e) => {
                    const value = e.target.checked;
                    setReduced(value);
                    if (s)
                      void change((s) => {
                        s.settings.reduced = value;
                      })
                        .catch(() => {})
                        .finally(() => setReduced(null));
                  }}
                />{" "}
                Reduzierte Bewegung
              </label>
              <p>
                Kein Ton erforderlich. Alle Funkmeldungen werden als Text
                angezeigt. Alle Konten verbinden sich automatisch mit diesem
                Server.
              </p>
              <button
                onClick={() => {
                  void updateApplication().catch((e) =>
                    emit({ error: String(e) }),
                  );
                }}
              >
                Auf App-Update prüfen
              </button>
            </>
          )}
          {s && (
            <>
              {modal === "build" && (
                <BuildingShop
                  s={s}
                  onPlace={(type) => {
                    setPlacing(type);
                    setModal("");
                    setScreen("game");
                  }}
                />
              )}
              {modal === "stations" && (
                <>
                  <button className="primary" onClick={() => setModal("build")}>
                    Wache bauen
                  </button>
                  {s.buildings.map((b) => (
                    <button
                      className="station-card"
                      key={b.id}
                      onClick={() => open(b.id)}
                    >
                      <TowerControl />
                      <div>
                        <b>{b.name}</b>
                        <small>
                          {bt(b.type).name} · Stufe {b.level}
                        </small>
                      </div>
                      <ChevronRight />
                    </button>
                  ))}
                </>
              )}
              {modal === "building" &&
                s.buildings.find((b) => b.id === selected) && (
                  <BuildingPanel
                    key={selected}
                    s={s}
                    b={s.buildings.find((b) => b.id === selected)!}
                  />
                )}
              {modal === "fleet" && (
                <Fleet
                  s={s}
                  onSelect={(id) => {
                    setSelected(id);
                    setModal("");
                  }}
                />
              )}
              {modal === "mission" &&
                s.missions.find((m) => m.id === selected) &&
                (s.missions.find((m) => m.id === selected)!.control ? (
                  <IncidentPanel
                    key={selected}
                    s={s}
                    m={s.missions.find((m) => m.id === selected)!}
                  />
                ) : (
                  <MissionPanel
                    key={selected}
                    s={s}
                    m={s.missions.find((m) => m.id === selected)!}
                  />
                ))}
              {modal === "mission" &&
                !s.missions.some((m) => m.id === selected) && (
                  <>
                    <p>
                      Dieser Einsatz ist abgeschlossen. Die Belohnung steht im
                      Geldjournal.
                    </p>
                    {s.archive
                      .filter((m) => m.id === selected)
                      .map((m) => (
                        <div key={m.id}>
                          <Suspense fallback={<p>Bericht wird geladen …</p>}>
                            <ReportPanel m={m} />
                          </Suspense>
                          <DynamicsPanel s={s} m={m} />
                          <History s={s} m={m} />
                        </div>
                      ))}
                  </>
                )}
              {modal === "friends" && <TeamPanel />}
              {modal === "aaos" && <AAOPanel s={s} />}
              {modal === "fms" && <FMSPanel s={s} />}
              {modal === "progress" && (
                <>
                  <Progression s={s} />
                  <ProgressPanel s={s} />
                </>
              )}
              {modal === "archive" && (
                <Suspense fallback={<p>Auswertung wird geladen …</p>}>
                  <ArchivePanel s={s} open={open} />
                </Suspense>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
