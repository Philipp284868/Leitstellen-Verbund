import { modeName } from "./mode";
import { MainMenu } from "./MainMenu";
import { AuthScreen, Account } from "./Account";
import { useState } from "react";
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
import {
  MissionPanel,
  Friends,
  BackupPanel,
  ProgressPanel,
  Help,
} from "./Panels";
import { Modal, credits } from "./ui";
import { download } from "./storage";
import { updateApplication } from "./pwa";
export function App() {
  const { mode } = useGame();
  return <GameApp key={mode} />;
}
function GameApp() {
  const { save: s, mode, loading, readonly, error, notice, user } = useGame();
  const net = useNetwork();
  const [screen, setScreen] = useState("start"),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState(""),
    [placing, setPlacing] = useState(""),
    [light, setLight] = useState(false),
    [reduced, setReduced] = useState(false),
    [mobile, setMobile] = useState("map");
  const tutorial = [
    "Baue deine erste Feuerwache. Wähle „Wache bauen“ und einen Bauplatz auf der Karte.",
    "Öffne deine Wache, warte die Bauzeit ab und kaufe zwei TSF-W.",
    "Stelle pro TSF-W sechs Mitarbeiter ein. Öffne den Fuhrpark und wähle „Besetzen“.",
    "Wähle einen Einsatz, markiere geeignete Fahrzeuge und alarmiere sie.",
    "Verfolge Anfahrt und Einsatz. Sobald alle Fähigkeiten vor Ort sind, beginnt die Abarbeitung.",
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
    else setModal("mission");
  };
  return (
    <div
      className={`app ${screen === "game" ? "in-game" : ""} ${(s?.settings.light ?? light) ? "light" : ""} ${(s?.settings.reduced ?? reduced) ? "reduced" : ""}`}
    >
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
                <progress value={s.xp % 150} max={150} />
                <small>{s.xp % 150} / 150 Erfahrung</small>
              </div>
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
                  <span>RUHIGE EINSATZLAGE</span>
                  <small>
                    {s.missions.length >= 2
                      ? "Erst laufende Einsätze abschließen. Neue Meldungen warten."
                      : "Neue Meldungen kommen einzeln und zeitlich versetzt."}
                  </small>
                </div>
                <div className="mission-list">
                  {s.missions.map((m, i) => {
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
                            {m.shared ? " · VERBUND" : ""}
                          </span>
                          <h3>{t.name}</h3>
                          <p>
                            Falkenried · Planquadrat {Math.round(m.pos.x / 95)}/
                            {Math.round(m.pos.y / 85)}
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
                  })}
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
                    <span>Verbund-Einsätze</span>
                    <b>
                      {net.friends.reduce((n, f) => n + f.missions.length, 0)}
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
                  placing={!!placing}
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
              <select
                aria-label="Spielgeschwindigkeit"
                value={s.speed}
                onChange={(e) =>
                  void act({ type: "speed", value: Number(e.target.value) })
                }
              >
                {[1, 4, 8, 16, 32].map((x) => (
                  <option key={x} value={x}>
                    {x}× Tempo
                  </option>
                ))}
              </select>
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
                friends: "Mit Freunden spielen",
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
              <Account />
              <label>
                <input
                  type="checkbox"
                  checked={s?.settings.light ?? light}
                  onChange={(e) => {
                    const value = e.target.checked;
                    setLight(value);
                    if (s)
                      void change((s) => {
                        s.settings.light = value;
                      }).catch(() => {});
                  }}
                />{" "}
                Heller Modus
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={s?.settings.reduced ?? reduced}
                  onChange={(e) => {
                    const value = e.target.checked;
                    setReduced(value);
                    if (s)
                      void change((s) => {
                        s.settings.reduced = value;
                      }).catch(() => {});
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
              {modal === "fleet" && <Fleet s={s} />}
              {modal === "mission" &&
                s.missions.find((m) => m.id === selected) && (
                  <MissionPanel
                    key={selected}
                    s={s}
                    m={s.missions.find((m) => m.id === selected)!}
                  />
                )}
              {modal === "mission" &&
                !s.missions.some((m) => m.id === selected) && (
                  <p>
                    Dieser Einsatz ist abgeschlossen. Die Belohnung steht im
                    Geldjournal.
                  </p>
                )}
              {modal === "friends" && <Friends s={s} />}
              {modal === "progress" && <ProgressPanel s={s} />}
              {modal === "archive" && (
                <>
                  <h3>
                    {s.completed} Einsätze abgeschlossen · {s.treated} Patienten
                    behandelt
                  </h3>
                  {s.archive.map((m) => (
                    <article className="person" key={m.id}>
                      <span>{mt(m.template).name}</span>
                      <b>Abgeschlossen</b>
                    </article>
                  ))}
                  <h3>Geldjournal</h3>
                  {s.journal.map((j) => (
                    <article className="person" key={j.id}>
                      <span>{j.text}</span>
                      <b className={j.amount > 0 ? "good" : ""}>
                        {j.amount > 0 ? "+" : ""}
                        {credits(j.amount)}
                      </b>
                    </article>
                  ))}
                </>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
