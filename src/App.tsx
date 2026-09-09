import { Progression } from "./ProgressionPanel";
import { GameHud } from "./GameHud";
import { MenuPanels } from "./MenuPanels";
import { WorkspaceSettings } from "./WorkspaceSettings";
import { ReconnectSummary } from "./ReconnectSummary";
import { Players } from "./Players";
import { BuildingIcon } from "./map-icons";
import { usePresence } from "./network";
import {
  parseWorkspace,
  shortcutFor,
  type WorkspacePreferences,
} from "./workspace";
import "./Workspace.css";
import { DynamicsPanel } from "./Dynamics";
import { MissionPanel } from "./Panels";
import { IncidentPanel, AAOPanel, FMSPanel, TeamPanel, History } from "./Desk";
import { AudioSession, SoundSettings } from "./Sound";
import { audio } from "./audio/controller";
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
import { Radio, ChevronRight } from "lucide-react";
import { useGame, emit, retryStorage, change } from "./store";
import { bt } from "./catalog";
import { level } from "./model";
import { BuildingShop, BuildingPanel, Fleet } from "./Resources";
import { BackupPanel, ProgressPanel, Help } from "./Panels";
import { Modal } from "./ui";
import { download } from "./storage";
import { updateApplication } from "./pwa";
export function App() {
  return (
    <>
      <AudioSession />
      <div className="desktop-required" role="status">
        <h1>Leitstellen-Verbund für PC</h1>
        <p>
          Bitte das Browserfenster auf mindestens 1100 × 650 Pixel vergrößern
          oder den Browser-Zoom verkleinern. Maus und Tastatur werden empfohlen.
        </p>
        <p>Der Server läuft weiter. Deine Daten bleiben erhalten.</p>
      </div>
      <GameApp />
    </>
  );
}
function GameApp() {
  const { save: s, loading, readonly, error, notice, user } = useGame();
  const presence = usePresence();
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

  const [screen, setScreen] = useState("start"),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState(""),
    [placing, setPlacing] = useState(""),
    [light, setLight] = useState<boolean | null>(null),
    [reduced, setReduced] = useState<boolean | null>(null);
  const [listOpen, setListOpen] = useState(false);
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
      if (e.key === "Escape" && !editing) {
        if (!modal && !placing && !selected) return;
        e.preventDefault();
        if (modal) {
          setModal("");
          setSelected("");
        } else if (placing) setPlacing("");
        else if (selected) setSelected("");
        return;
      }
      if (modal) return;
      const action = shortcutFor(e, layout.keys, editing);
      if (!action) return;
      e.preventDefault();
      if (action === "police" || action === "ems") {
        setFilter(action === "police" ? "Polizei" : "Rettungsdienst");
        setModal("");
        setListOpen(true);
      } else if (action === "missions") {
        setFilter("all");
        setModal("");
        setListOpen(true);
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
  }, [s, screen, selected, layout.keys, modal, placing]);
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
      className={`app command-hud ${screen === "game" ? "in-game" : ""} ${(light ?? s.settings.light) ? "light" : ""} ${(reduced ?? s.settings.reduced) ? "reduced" : ""}`}
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
        <GameHud
          s={s}
          selected={selected}
          open={open}
          setModal={setModal}
          placing={placing}
          setPlacing={setPlacing}
          readonly={readonly}
          notice={notice}
          onMenu={() => setScreen("start")}
          showDetail={modal === "mission"}
          onCloseDetailKeepSelection={() => setModal("")}
          onCloseDetail={() => {
            setModal("");
            setSelected("");
          }}
          search={search}
          setSearch={setSearch}
          filter={filter}
          setFilter={setFilter}
          sort={sort}
          setSort={setSort}
          userId={user?.id}
          tutorial={tutorial[s.tutorial]}
          listOpen={listOpen}
          setListOpen={setListOpen}
          activePanel={modal}
          detail={
            s.missions.find((m) => m.id === selected) ? (
              s.missions.find((m) => m.id === selected)!.control ? (
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
              )
            ) : (
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
            )
          }
        />
      )}
      {modal && !(screen === "game" && modal === "mission") && (
        <Modal
          title={
            (
              {
                catalog: "Einsatzkatalog",
                exit: "Spiel verlassen",
                news: "Neuigkeiten",
                credits: "Credits",
                privacy: "Datenschutz im Spiel",
                support: "Support",
                language: "Sprache",
                players: "Spieler dieser Serverwelt",
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
          onClose={() => {
            setModal("");
            setSelected("");
          }}
        >
          <MenuPanels
            panel={modal}
            s={s}
            onOpen={setModal}
            onPlay={() => {
              setScreen("game");
              setModal("");
            }}
          />
          {modal === "help" && (
            <>
              <p>
                <a
                  href="https://github.com/Philipp284868/Leitstellen-Verbund/wiki"
                  target="_blank"
                  rel="noreferrer"
                >
                  Wiki öffnen
                </a>
              </p>
              <button onClick={() => setModal("catalog")}>
                Einsatzkatalog
              </button>
              <Help />
            </>
          )}
          {modal === "backups" && <BackupPanel s={s} />}
          {modal === "settings" && (
            <>
              <nav
                className="hud-management"
                aria-label="Weitere Spielbereiche"
              >
                {[
                  ["aaos", "AAO"],
                  ["fms", "FMS"],
                  ["friends", "Freunde"],
                  ["progress", "Fortschritt"],
                  ["backups", "Sicherungen"],
                  ["help", "Hilfe"],
                ].map(([id, label]) => (
                  <button key={id} onClick={() => setModal(id)}>
                    {label}
                  </button>
                ))}
              </nav>
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
                      <BuildingIcon type={b.type} />
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
              {modal === "players" && (
                <Players
                  players={presence.players}
                  ownUserId={user?.id ?? ""}
                  ownDeskId={s.player.id}
                  connected={presence.connected}
                  ready={presence.ready}
                  onJump={(point) => {
                    setModal("");
                    setListOpen(false);
                    setSelected("");
                    window.dispatchEvent(
                      new CustomEvent("lv:map-focus", { detail: { point } }),
                    );
                  }}
                />
              )}
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
