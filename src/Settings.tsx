import { tutorialInteraction } from "./Tutorial";
import { useEffect, useRef, useState } from "react";
import { AudioSettingsEditor } from "./Sound";
import { audio, useSound } from "./audio/controller";
import { defaultSound } from "./audio/preferences";
import {
  applyDevicePreferences,
  defaultDevice,
  discardDevicePreferences,
  previewDevicePreferences,
  savedDevicePreferences,
  shortcutConflicts,
  type DevicePreferences,
} from "./device-preferences";
import { useDialogDirty } from "./dialog-state";
import { WorkspaceSettings } from "./WorkspaceSettings";
import { updateApplication } from "./pwa";
import "./Settings.css";

const categories = {
  audio: "Audio",
  display: "Anzeige & Karte",
  controls: "Steuerung",
  help: "Hinweise & Hilfe",
} as const;
export function Settings({
  onOpen,
  initialTab = "audio",
}: {
  onOpen: (id: string) => void;
  initialTab?: keyof typeof categories;
}) {
  const { filesDirty, filesBusy } = useSound();
  const [tab, setTab] = useState<keyof typeof categories>(initialTab);
  const [device, setDevice] = useState(savedDevicePreferences);
  const [sound, setSound] = useState(() => audio.savedPreferences());
  const baseline = useRef({
    device: JSON.stringify(device),
    sound: JSON.stringify(sound),
  });
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const dirty =
    filesDirty ||
    filesBusy ||
    JSON.stringify(device) !== baseline.current.device ||
    JSON.stringify(sound) !== baseline.current.sound;
  const conflicts = shortcutConflicts(device.workspace);
  useEffect(() => {
    audio.beginSettingsPreview();
    return () => {
      audio.endSettingsPreview();
      discardDevicePreferences();
    };
  }, []);
  const discard = () => {
    audio.discardPreferences();
    discardDevicePreferences();
  };
  useDialogDirty(dirty || busy, discard, busy);
  function changeDevice<K extends keyof DevicePreferences>(
    key: K,
    value: DevicePreferences[K],
  ) {
    const next = { ...device, [key]: value };
    setDevice(next);
    previewDevicePreferences(next);
    setMessage("");
  }
  const checkbox = (
    key: keyof DevicePreferences,
    label: string,
    description?: string,
  ) => (
    <label className="setting-row" key={key}>
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        aria-label={label}
        checked={device[key] === true}
        onChange={(e) => changeDevice(key, e.target.checked)}
      />
    </label>
  );
  const select = (
    key: "scale" | "markerSize" | "zoomSensitivity",
    label: string,
    values: number[],
  ) => (
    <label className="setting-row">
      <strong>{label}</strong>
      <select
        aria-label={label}
        value={device[key]}
        onChange={(e) => changeDevice(key, Number(e.target.value))}
      >
        {values.map((n) => (
          <option key={n} value={n}>
            {n} %
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="settings-view" data-tutorial="settings">
      <p className="view-intro">
        Dein Arbeitsplatz auf diesem Gerät. Änderungen werden als Vorschau
        angezeigt und mit „Übernehmen“ gespeichert. Spielregeln und
        Einstellungen anderer Disponenten bleiben davon unberührt.
      </p>
      <div
        className="section-tabs"
        role="tablist"
        aria-label="Einstellungskategorien"
      >
        {Object.entries(categories).map(([id, name]) => (
          <button
            key={id}
            role="tab"
            id={`settings-tab-${id}`}
            aria-controls={`settings-panel-${id}`}
            aria-selected={tab === id}
            onClick={() => setTab(id as keyof typeof categories)}
          >
            {name}
          </button>
        ))}
      </div>
      <fieldset
        disabled={busy}
        className="settings-content"
        role="tabpanel"
        id={`settings-panel-${tab}`}
        aria-labelledby={`settings-tab-${tab}`}
      >
        {tab === "audio" && (
          <AudioSettingsEditor
            draft={sound}
            onChange={(next) => {
              setSound(next);
              audio.previewPreferences(next);
              setMessage("");
            }}
          />
        )}
        {tab === "display" && (
          <>
            <h3>Lesbarkeit</h3>
            {select("scale", "Oberflächentext", [90, 100, 110, 120])}
            {select("markerSize", "Kartensymbole", [80, 100, 120, 140])}
            {checkbox("light", "Helle Oberfläche")}
            {checkbox(
              "reduced",
              "Bewegung reduzieren",
              "Kürzere Kamerabewegungen und weniger Animationen.",
            )}
            <h3>Kartenebenen</h3>
            {checkbox("labels", "Ortsbeschriftungen")}
            {checkbox("routes", "Fahrwege anzeigen")}
            {checkbox("pois", "Geografische Einrichtungen")}
            {checkbox("players", "Andere Leitstellen anzeigen")}
            {checkbox("friends", "Freigegebene Verbundobjekte")}
          </>
        )}
        {tab === "controls" && (
          <>
            {select(
              "zoomSensitivity",
              "Mausrad-Empfindlichkeit",
              [50, 75, 100, 125, 150],
            )}
            {checkbox(
              "follow",
              "Ausgewähltem Fahrzeug folgen",
              "Manuelles Verschieben beendet die Verfolgung.",
            )}
            <WorkspaceSettings
              value={device.workspace}
              change={(next) => changeDevice("workspace", next)}
            />
            {conflicts.length > 0 && (
              <p role="alert" className="error">
                Mehrfach belegte Tasten: {conflicts.join(", ").toUpperCase()}.
                Jede Taste darf nur eine Ansicht öffnen.
              </p>
            )}
          </>
        )}
        {tab === "help" && (
          <>
            {checkbox(
              "tutorialHints",
              "Tutorialhinweise einblenden",
              "Der gespeicherte Lernfortschritt bleibt beim Ausblenden erhalten.",
            )}
            {checkbox(
              "reconnectSummary",
              "Zusammenfassung nach Wiederverbindung",
            )}
            <h3>Hilfe und Konto</h3>
            <div className="action-grid">
              <button onClick={() => onOpen("tutorial")}>
                Interaktives Tutorial
              </button>
              <button onClick={() => onOpen("help")}>Spielanleitung</button>
              <button onClick={() => onOpen("account")}>
                Konto & Sicherheit
              </button>
              <button onClick={() => onOpen("backups")}>Sicherungen</button>
              <button onClick={() => onOpen("support")}>Support</button>
              <button
                onClick={() => {
                  setError("");
                  void updateApplication()
                    .then(() =>
                      setMessage("Aktualisierungsprüfung abgeschlossen."),
                    )
                    .catch((e) => setError(String(e)));
                }}
              >
                Auf App-Update prüfen
              </button>
            </div>
            <p>
              Tastenkürzel alarmieren nicht unmittelbar. Eingabefelder behalten
              ihre normalen Tastenfunktionen. Der Server simuliert in Echtzeit
              weiter.
            </p>
          </>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="good">
          {message}
        </p>
      )}
      <footer className="settings-actions">
        <span>
          {dirty ? "Ungespeicherte Vorschau" : "Gespeichert auf diesem Gerät"}
        </span>
        <button
          disabled={busy}
          onClick={() => {
            const next = structuredClone(defaultDevice),
              nextSound = structuredClone(defaultSound);
            setDevice(next);
            setSound(nextSound);
            previewDevicePreferences(next);
            audio.previewPreferences(nextSound);
            setMessage("Standardwerte als Vorschau. Zum Speichern übernehmen.");
          }}
        >
          Standardwerte
        </button>
        <button
          disabled={busy || !dirty}
          onClick={() => {
            discard();
            const next = savedDevicePreferences(),
              nextSound = audio.savedPreferences();
            setDevice(next);
            setSound(nextSound);
            setError("");
            setMessage("Änderungen verworfen.");
          }}
        >
          Verwerfen
        </button>
        <button
          className="primary"
          disabled={busy || filesBusy || !!conflicts.length}
          onClick={() => {
            if (busyRef.current) return;
            busyRef.current = true;
            setBusy(true);
            setError("");
            const oldDevice = savedDevicePreferences();
            void (async () => {
              applyDevicePreferences(device);
              try {
                await audio.applyPreferences(sound);
              } catch (reason) {
                try {
                  applyDevicePreferences(oldDevice);
                  previewDevicePreferences(device);
                } catch {
                  throw new Error(
                    `${String(reason)} Auch die Geräte-Rücknahme konnte nicht gespeichert werden; bitte den Browserspeicher prüfen.`,
                  );
                }
                throw reason;
              }
              baseline.current = {
                device: JSON.stringify(device),
                sound: JSON.stringify(sound),
              };
              setMessage("Alle Änderungen gespeichert.");
              tutorialInteraction("settings");
            })()
              .catch((reason) => setError(String(reason)))
              .finally(() => {
                busyRef.current = false;
                setBusy(false);
              });
          }}
        >
          {busy ? "Speichern …" : "Übernehmen"}
        </button>
      </footer>
    </div>
  );
}
