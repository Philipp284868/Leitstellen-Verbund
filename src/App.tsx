import {
  TutorialHome,
  TutorialCoach,
  TutorialEvents,
  tutorialInteraction,
} from "./Tutorial";
const Progression = lazy(() =>
  import("./ProgressionPanel").then((m) => ({ default: m.Progression })),
);
const GameHud = lazy(() =>
  import("./GameHud").then((m) => ({ default: m.GameHud })),
);
const MenuPanels = lazy(() =>
  import("./MenuPanels").then((m) => ({ default: m.MenuPanels })),
);
const Settings = lazy(() =>
  import("./Settings").then((m) => ({ default: m.Settings })),
);
import { navigation } from "./navigation";
import { WORLD_NAME } from "./world-choice";
import { useDevicePreferences } from "./device-preferences";
import { requestDialogTransition } from "./dialog-state";
import { ReconnectSummary } from "./ReconnectSummary";
const Players = lazy(() =>
  import("./Players").then((m) => ({ default: m.Players })),
);
import { BuildingIcon } from "./map-icons";
import { usePresence } from "./network";
import { shortcutFor } from "./workspace";
import "./Workspace.css";
import "./Settings.css";
import { DynamicsPanel } from "./Dynamics";
import { MissionPanel } from "./Panels";
import { IncidentPanel, AAOPanel, FMSPanel, TeamPanel, History } from "./Desk";
import { AudioSession } from "./Sound";
import { audio } from "./audio/controller";
import { MainMenu } from "./MainMenu";
import { AuthScreen, Account } from "./Account";
import {
  useState,
  useCallback,
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
import { useGame, emit, retryStorage } from "./store";
import { bt } from "./catalog";
import { level } from "./model";
import { BuildingShop, BuildingPanel, Fleet } from "./Resources";
import { BackupPanel, ProgressPanel, Help } from "./Panels";
import { ActionButton, Modal } from "./ui";
import { download } from "./storage";
export function App() {
  useEffect(() => {
    document.title = `${WORLD_NAME} · Leitstellen-Verbund`;
  }, []);
  return (
    <>
      <AudioSession />
      <TutorialEvents />
      <div className="desktop-required" role="status">
        <h1>Leitstellen-Verbund für PC</h1>
        <p>
          Bitte das Browserfenster auf mindestens 1100 × 650 Pixel vergrößern
          oder den Browser-Zoom verkleinern. Maus und Tastatur werden empfohlen.
        </p>
        <p>Der Server läuft weiter. Deine Daten bleiben erhalten.</p>
      </div>
      <Suspense
        fallback={
          <div className="loading" role="status">
            Leitstelle wird geladen …
          </div>
        }
      >
        <GameApp />
      </Suspense>
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
    [modal, setModalRaw] = useState(""),
    [selected, setSelected] = useState(""),
    [placing, setPlacing] = useState("");
  const setModal = useCallback(
    (id: string) => requestDialogTransition(() => setModalRaw(id)),
    [],
  );
  const preferences = useDevicePreferences();
  const layout = preferences.workspace;
  const [listOpen, setListOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<
    "audio" | "display" | "controls" | "help"
  >("audio");
  useEffect(() => {
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || !navigation.some((item) => item.id === detail.id)) return;
      requestDialogTransition(() => {
        if (["audio", "display", "controls", "help"].includes(detail.tab))
          setSettingsTab(detail.tab);
        setModalRaw(detail.id);
      });
    };
    window.addEventListener("lv:open-panel", navigate);
    return () => window.removeEventListener("lv:open-panel", navigate);
  }, []);
  useEffect(() => {
    audio.scene(screen === "game");
  }, [screen]);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("priority");
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
          requestDialogTransition(() => {
            setModalRaw("");
            setSelected("");
          });
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
  useEffect(() => {
    if (modal === "archive") tutorialInteraction("budget");
    if (modal === "building") tutorialInteraction("staff");
    if (modal === "fleet") tutorialInteraction("withdraw");
    if (modal === "friends") tutorialInteraction("cooperation");
    if (modal === "help") tutorialInteraction("finish");
  }, [modal]);
  useEffect(() => {
    setSelected("");
    setModalRaw("");
    setPlacing("");
  }, [s?.generation]);
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
  const open = (id: string) =>
    requestDialogTransition(() => {
      if (id === "friends") {
        setModalRaw("friends");
        return;
      }
      setSelected(id);
      if (s?.buildings.some((b) => b.id === id)) setModalRaw("building");
      else if (s?.vehicles.some((v) => v.id === id)) setModalRaw("");
      else setModalRaw("mission");
    });
  return (
    <div
      style={
        {
          "--desk-width": `${layout.width}px`,
          "--ui-scale": preferences.scale / 100,
          "--marker-scale": preferences.markerSize / 100,
        } as CSSProperties
      }
      data-sidebar={layout.side}
      data-compact={layout.compact}
      data-queue-bottom={layout.queueBottom}
      data-stations-top={layout.stationsTop}
      className={`app command-hud ${screen === "game" ? "in-game" : ""} ${preferences.light ? "light" : ""} ${preferences.reduced ? "reduced" : ""}`}
    >
      <ReconnectSummary />
      {error && (
        <div className="global-error" role="alert">
          <strong>{error}</strong>
          <ActionButton action={retryStorage}>
            Server erneut verbinden
          </ActionButton>
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
          {!error && (
            <ActionButton action={retryStorage}>
              Server erneut verbinden
            </ActionButton>
          )}
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
          onCloseDetail={() =>
            requestDialogTransition(() => {
              setModalRaw("");
              setSelected("");
            })
          }
          search={search}
          setSearch={setSearch}
          filter={filter}
          setFilter={setFilter}
          sort={sort}
          setSort={setSort}
          userId={user?.id}
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
      {screen === "game" && (
        <TutorialCoach
          onOverview={() => setModal("tutorial")}
          onOpen={(panel) => {
            if (!panel) {
              document
                .querySelector<HTMLButtonElement>('[aria-label="Kartensuche"]')
                ?.click();
              return;
            }
            if (panel === "building") {
              const home = s.buildings.find((b) => b.type === "fire");
              if (home) open(home.id);
              else setModal("stations");
            } else if (panel === "mission") {
              const mission = s.missions[0];
              if (mission) open(mission.id);
              else setModal("archive");
            } else setModal(panel);
          }}
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
                credits: "Mitwirkende",
                account: "Konto & Sicherheit",
                tutorial: "Interaktives Tutorial",
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
          onClose={() =>
            requestDialogTransition(() => {
              setModalRaw("");
              setSelected("");
            })
          }
        >
          <Suspense
            fallback={
              <p className="view-intro" role="status">
                Ansicht wird geladen …
              </p>
            }
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
                <div className="action-grid">
                  <button onClick={() => setModal("tutorial")}>
                    Interaktives Tutorial
                  </button>
                  <button onClick={() => setModal("aaos")}>
                    AAO verwalten
                  </button>
                  <button onClick={() => setModal("fms")}>
                    FMS & Alarmierung
                  </button>
                  <button onClick={() => setModal("account")}>
                    Konto & Sicherheit
                  </button>
                </div>
                <Help />
              </>
            )}
            {modal === "backups" && <BackupPanel s={s} />}
            {modal === "settings" && (
              <Settings onOpen={setModal} initialTab={settingsTab} />
            )}
            {modal === "account" && <Account />}
            {modal === "tutorial" && (
              <TutorialHome
                onEnter={() => {
                  setModalRaw("");
                  setSelected("");
                  setScreen("game");
                }}
              />
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
                    <button
                      className="primary"
                      onClick={() => setModal("build")}
                    >
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
                {modal === "building" &&
                  !s.buildings.some((b) => b.id === selected) && (
                    <section className="empty-state">
                      <h3>Standort nicht mehr vorhanden</h3>
                      <p>
                        Der Standort wurde verkauft oder gehört nicht mehr zur
                        geöffneten Leitstelle.
                      </p>
                      <button onClick={() => setModal("stations")}>
                        Wachenübersicht öffnen
                      </button>
                    </section>
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
          </Suspense>
        </Modal>
      )}
    </div>
  );
}
