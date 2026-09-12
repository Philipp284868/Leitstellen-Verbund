import { ApproachText } from "./germany/GeoQueries";
import { useState, useRef } from "react";
import { mt, capabilities } from "./catalog";
import {
  type Save,
  type Mission,
  achievements,
  achievementProgress,
  level,
} from "./model";
import { command, api, useGame } from "./store";
import { readiness, capacity, missing } from "./engine";
import { useNetwork, share, stopSharing } from "./network";
import {
  exportText,
  read,
  download,
  inspectImport,
  backups,
  persist,
  type RecordSave,
} from "./storage";
import { credits, statuses, ActionButton, ConfirmAction } from "./ui";
import { useDialogDirty } from "./dialog-state";
import { missionPresentation, missionProgress } from "./mission-presentation";
import { effectiveSkills } from "./simulation/major-resources";
export function MissionPanel({ s, m }: { s: Save; m: Mission }) {
  const { mode, readonly } = useGame();
  const [selected, setSelected] = useState<string[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false),
    [templateName, setTemplateName] = useState(""),
    [busy, setBusy] = useState(false),
    lock = useRef(false);
  useDialogDirty(
    selected.length > 0 || templateName.trim().length > 0,
    () => {
      setSelected([]);
      setTemplateName("");
      setTemplateOpen(false);
    },
    busy,
  );
  const perform = async (operation: () => Promise<void>) => {
    if (lock.current) throw Error("Bitte die laufende Aktion abwarten.");
    lock.current = true;
    setBusy(true);
    try {
      await operation();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const presentation = missionPresentation(m),
    work = missionProgress(m);
  const net = useNetwork(),
    t = mt(presentation.id),
    skills = capacity(s, m.id);
  for (const f of net.support.filter(
    (f) =>
      f.mission === m.id && f.round === m.round && f.vehicle.status === "scene",
  )) {
    for (const [k, n] of Object.entries(effectiveSkills(m, f.vehicle)))
      skills[k] = (skills[k] || 0) + n;
  }
  const needed = missing(m, skills);
  return (
    <div className="mission-panel">
      <span className="eyebrow">
        {t.org} · {m.shared ? "Gemeinsamer Einsatz" : "Eigener Einsatz"}
      </span>
      <h2>{t.name}</h2>
      <p>{t.description}</p>
      <div className="stat-row">
        <span>
          Grundvergütung{" "}
          <b>
            {presentation.confirmed
              ? credits(m.paymentCents ?? t.reward)
              : "Nach Lagemeldung"}
          </b>
        </span>
        <span>
          Patienten{" "}
          <b>{presentation.confirmed ? t.patients : "Noch nicht bestätigt"}</b>
        </span>
        <span>
          Lage{" "}
          <b>
            {presentation.confirmed
              ? "Bestätigt"
              : presentation.known
                ? "Telefonisch gemeldet"
                : "Ungeklärt"}
          </b>
        </span>
      </div>
      {work && (
        <progress value={work.value} max={work.max} aria-label={work.label} />
      )}
      <p>
        {m.phase === "transport"
          ? "Patienten werden zum Klinikum gebracht"
          : needed.length
            ? "Wartet auf passende Kräfte am Einsatzort"
            : "Einsatz wird abgearbeitet"}{" "}
        {work && ` · ${Math.floor((work.value / work.max) * 100)} %`}
      </p>
      <h3>Benötigte Fähigkeiten</h3>
      <div className="requirements">
        {Object.entries(t.requirements).map(([k, n]) => (
          <div key={k} className={(skills[k] || 0) >= n ? "fulfilled" : ""}>
            <span>
              {(skills[k] || 0) >= n ? "✓" : "○"} {capabilities[k]}
            </span>
            <b>
              {skills[k] || 0} / {n}
            </b>
          </div>
        ))}
      </div>
      <h3>Bestätigte Unterstützung</h3>
      {!net.support.some((f) => f.mission === m.id && f.round === m.round) && (
        <p>Es sind keine Unterstützungskräfte für diesen Einsatz bestätigt.</p>
      )}
      {net.support
        .filter((f) => f.mission === m.id && f.round === m.round)
        .map((f) => (
          <div className="person" key={f.assignment}>
            <span>
              {f.vehicle.name}
              <small>
                {net.friends.find((p) => p.id === f.peer)?.name} ·{" "}
                {statuses[f.vehicle.status]}
              </small>
            </span>
          </div>
        ))}
      <h3>Kräfte alarmieren</h3>
      <div className="inline">
        {s.templates.map((a, i) => (
          <button
            key={i}
            disabled={busy || readonly}
            onClick={() => {
              const available = s.vehicles.filter((v) => !readiness(s, v)),
                ids: string[] = [];
              for (const type of a.types) {
                const v = available.find(
                  (v) => v.type === type && !ids.includes(v.id),
                );
                if (v) ids.push(v.id);
              }
              setSelected(ids);
            }}
          >
            {a.name}
          </button>
        ))}
      </div>
      <div className="dispatch-list">
        {s.vehicles.map((v) => {
          const reason = readiness(s, v);
          return (
            <label
              key={v.id}
              className={selected.includes(v.id) ? "selected" : ""}
            >
              <input
                type="checkbox"
                disabled={!!reason || busy || readonly}
                checked={selected.includes(v.id)}
                onChange={(e) =>
                  setSelected((a) =>
                    e.target.checked
                      ? [...a, v.id]
                      : a.filter((x) => x !== v.id),
                  )
                }
              />
              <span>
                <b>{v.name}</b>
                <small>
                  {reason || "Einsatzbereit"} · {statuses[v.status]}
                  {!reason && (
                    <>
                      {" "}
                      · <ApproachText s={s} vehicle={v} target={m.pos} />
                    </>
                  )}
                </small>
              </span>
            </label>
          );
        })}
      </div>
      <div className="inline">
        <ActionButton
          className="primary"
          disabled={!selected.length || busy || readonly}
          action={() =>
            perform(async () => {
              await command({
                type: "dispatch",
                mission: m.id,
                vehicles: selected,
              });
              setSelected([]);
            })
          }
        >
          Alarmieren ({selected.length})
        </ActionButton>
        <button
          disabled={
            !selected.length || busy || readonly || s.templates.length >= 12
          }
          onClick={() => setTemplateOpen(true)}
        >
          Vorlage speichern
        </button>
        {mode === "multi" && (
          <ActionButton
            disabled={busy || readonly || m.shared}
            action={() => perform(() => share(m.id))}
          >
            {m.shared ? "Freigegeben" : "Mit Freunden teilen"}
          </ActionButton>
        )}
        {m.shared && (
          <ConfirmAction
            disabled={busy || readonly}
            message="Kooperation beenden? Der Server prüft, ob bestätigte Unterstützung und Patientenbindungen sicher beendet werden können. Eigene Kräfte bleiben zugeordnet."
            onConfirm={() => perform(() => stopSharing(m.id))}
          >
            Kooperation beenden
          </ConfirmAction>
        )}
      </div>
      {!s.vehicles.length && (
        <p className="empty-state">
          Noch keine Fahrzeuge vorhanden. Baue eine Wache und kaufe ein
          passendes Einstiegsfahrzeug.
        </p>
      )}
      {templateOpen && (
        <form
          className="shop-card"
          aria-label="Alarmierungsvorlage speichern"
          onSubmit={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              if (!busy) {
                setTemplateOpen(false);
                setTemplateName("");
              }
            }
          }}
        >
          <label>
            Name der Alarmierungsvorlage
            <input
              value={templateName}
              maxLength={48}
              disabled={busy}
              onChange={(e) => setTemplateName(e.target.value)}
            />
          </label>
          <p>
            {selected.length} ausgewählte Fahrzeuge · maximal zwölf Vorlagen
          </p>
          <div className="inline">
            <ActionButton
              disabled={
                readonly ||
                busy ||
                !templateName.trim() ||
                !selected.length ||
                selected.length > 30 ||
                s.templates.length >= 12
              }
              action={() =>
                perform(async () => {
                  const types = selected.map(
                    (id) => s.vehicles.find((v) => v.id === id)?.type,
                  );
                  if (types.some((type) => !type))
                    throw Error(
                      "Ein ausgewähltes Fahrzeug ist nicht mehr vorhanden. Auswahl prüfen.",
                    );
                  await command({
                    type: "template",
                    name: templateName.trim(),
                    types: types as string[],
                  });
                  setTemplateName("");
                  setTemplateOpen(false);
                })
              }
            >
              Vorlage übernehmen
            </ActionButton>
            <button
              disabled={busy}
              onClick={() => {
                setTemplateName("");
                setTemplateOpen(false);
              }}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
export function BackupPanel({ s }: { s: Save | null }) {
  const [preview, setPreview] = useState<Save | null>(null),
    [backupDate, setBackupDate] = useState(0),
    [rows, setRows] = useState<RecordSave[]>([]),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const budget = (save: Save) =>
    save.economy
      ? credits(save.money)
      : "Euro-Prüfung bei Wiederherstellung erforderlich";
  return (
    <section>
      <p className="view-intro">
        Der verbindliche Spielstand liegt auf dem Server. Export und freiwillige
        lokale Kopien sichern deinen bestätigten Stand. Diese Ansicht kann eine
        Datei prüfen; sie importiert keinen Besitz. Eine tatsächliche
        Wiederherstellung ist eine gesicherte Wartungsaufgabe des
        Serverbetreibers außerhalb der Spielkonten.
      </p>
      <div className="action-grid">
        <ActionButton
          disabled={!s}
          action={async () => {
            const data = await api("export");
            download(
              "leitstellen-verbund-spielstand.json",
              JSON.stringify(data, null, 2),
            );
            setMessage("Spielstanddatei zum Download bereitgestellt.");
          }}
        >
          Spielstand exportieren
        </ActionButton>
        <ActionButton
          action={async () => {
            const data = await api("archive-export");
            download(
              "einzelspieler-archiv.json",
              JSON.stringify(data, null, 2),
            );
            setMessage("Archivdatei zum Download bereitgestellt.");
          }}
        >
          Alten Einzelspielerstand als Archiv exportieren
        </ActionButton>
        <ActionButton
          action={async () => {
            const row = await read();
            if (!row) throw Error("Keine alte Browserkopie vorhanden.");
            download(
              "browser-archiv.json",
              JSON.stringify(
                {
                  format: "leitstellen-verbund-archive",
                  version: 1,
                  source: "browser-archive",
                  exportedAt: Date.now(),
                  save: row.data,
                },
                null,
                2,
              ),
            );
            setMessage(
              "Vorhandene Browserkopie als unverändertes Archiv bereitgestellt.",
            );
          }}
        >
          Vorhandene Browserkopie als Archiv exportieren
        </ActionButton>
      </div>
      <p>
        Alte Einzelspielerarchive bleiben unverändert. Sie können weder gespielt
        noch in die Multiplayer-Wirtschaft importiert werden.
      </p>
      <h3>Datei prüfen</h3>
      <label>
        Spielstanddatei importieren
        <input
          aria-label="Spielstanddatei importieren"
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              if (file.size > 8 * 1024 * 1024)
                throw Error("Datei größer als 8 MB.");
              const incoming = inspectImport(await file.text());
              setPreview(incoming.save);
              setBackupDate(incoming.exportedAt);
            } catch (reason) {
              setPreview(null);
              setError(String(reason));
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {busy && <p role="status">Datei wird lokal geprüft …</p>}
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
      {preview && (
        <article className="shop-card">
          <h3>Import prüfen: {preview.player.name}</h3>
          <p>Sicherungsdatum: {new Date(backupDate).toLocaleString("de-DE")}</p>
          <p>
            {preview.player.station} · Stufe {level(preview)} ·{" "}
            {budget(preview)} · {preview.buildings.length} Wachen ·{" "}
            {preview.vehicles.length} Fahrzeuge
          </p>
          <p>
            Validierte Vorschau. Diese Datei verändert keinen Serverbesitz. Der
            Betreiber muss Weltkompatibilität, Geldmigration und
            Wiederherstellung prüfen.
          </p>
          <div className="inline">
            <button
              onClick={() =>
                download("gepruefte-sicherung.json", exportText(preview))
              }
            >
              Geprüfte Datei exportieren
            </button>
            <button onClick={() => setPreview(null)}>Vorschau schließen</button>
          </div>
        </article>
      )}
      <h3>Freiwillige lokale Sicherungen dieses Kontos</h3>
      <p>
        Auf gemeinsam genutzten Geräten ist ein Dateiexport vorzuziehen. Lokale
        Kopien bleiben nach der Abmeldung auf diesem Gerät erhalten.
      </p>
      <div className="inline">
        <ActionButton
          disabled={!s}
          action={async () => {
            if (!s) throw Error("Bitte anmelden.");
            await persist(s, true);
            setMessage("Lokale Kopie gespeichert.");
            setRows(
              (await backups()).filter(
                (r) =>
                  r.data.player.id === s.player.id &&
                  r.data.generation === s.generation,
              ),
            );
            setLoaded(true);
          }}
        >
          Lokale Kopie anlegen
        </ActionButton>
        <ActionButton
          disabled={!s}
          action={async () => {
            const list = await backups();
            setRows(
              list.filter(
                (r) =>
                  r.data.player.id === s?.player.id &&
                  r.data.generation === s?.generation,
              ),
            );
            setLoaded(true);
          }}
        >
          Sicherungen anzeigen
        </ActionButton>
      </div>
      {loaded && !rows.length && (
        <p className="empty-state">
          Keine lokalen Sicherungen für dieses Konto und diese Spielwelt
          vorhanden.
        </p>
      )}
      {rows.map((r) => (
        <article className="person" key={r.id}>
          <span>
            {new Date(r.at).toLocaleString("de-DE")}
            <small>
              {r.data.player.name} · {budget(r.data)}
            </small>
          </span>
          <button
            onClick={() => {
              setPreview(r.data);
              setBackupDate(r.at);
            }}
          >
            Wiederherstellung prüfen
          </button>
        </article>
      ))}
    </section>
  );
}
export function ProgressPanel({ s }: { s: Save }) {
  return (
    <div>
      <h3>Finanzen</h3>
      <p>
        Einmaliges Startgeld ermöglicht den Einstieg. Abgeschlossene Einsätze
        und geleistete Unterstützung bringen weitere Einnahmen. Anschaffungen,
        Wartung und Bereitschaftskosten stehen im Geldjournal.
      </p>
      <p>
        Aktuelles Budget: <strong>{credits(s.money)}</strong>
      </p>
      <h3>Ausbauziele</h3>
      {[
        {
          name: "Grundschutz aufbauen",
          steps: [
            s.buildings.some((b) => b.type === "fire"),
            s.vehicles.length >= 2,
            s.completed >= 5,
          ],
        },
        {
          name: "Rettungskette erweitern",
          steps: [
            s.buildings.some((b) => b.type === "ems"),
            s.vehicles.some((v) => v.type === "rtw"),
            s.treated >= 5,
          ],
        },
        {
          name: "Regionaler Verbund",
          steps: [
            level(s) >= 3,
            new Set(s.buildings.map((b) => b.type)).size >= 5,
            s.buildings.some((b) => b.level >= 3),
          ],
        },
      ].map((goal) => (
        <article className="shop-card" key={goal.name}>
          <b>{goal.name}</b>
          <progress max={3} value={goal.steps.filter(Boolean).length} />
          <small>{goal.steps.filter(Boolean).length} von 3 Etappen</small>
        </article>
      ))}
      <h3>Erfolge</h3>
      <div className="shop-grid">
        {achievements.map(([name, target], i) => (
          <article key={name} className="shop-card">
            <span>
              {achievementProgress(s, i) >= target
                ? "◆ Erreicht"
                : "◇ In Arbeit"}
            </span>
            <h3>{name}</h3>
            <progress value={achievementProgress(s, i)} max={target} />
            <small>
              {Math.min(target, achievementProgress(s, i))} / {target}
            </small>
          </article>
        ))}
      </div>
    </div>
  );
}
export function Help() {
  return (
    <div className="help">
      <p>
        Leitstellen-Verbund ist ein fiktives Aufbauspiel, keine reale
        Einsatzplanungssoftware.
      </p>
      <details>
        <summary>Konto erstellen</summary>
        <p>
          Auf der Startseite „Neues Konto erstellen“ wählen und Benutzername,
          Passwort, Anzeigename und Leitstellenname festlegen. Jeder kann sich
          ohne Einladung registrieren. Es gibt ausschließlich normale
          Spielerkonten.
        </p>
      </details>
      <details open>
        <summary>Dein Multiplayer-Server</summary>
        <p>
          Melde dich am gewünschten Spielserver an und öffne deine berechtigte
          Leitstelle mit Spielen. Der Server verwaltet Welt, Besitz und
          Fortschritt. Unter Leitstellen findest du Einladungen zur gemeinsamen
          Disposition.
        </p>
      </details>
      <details>
        <summary>Die erste Schicht</summary>
        <ol>
          <li>
            Unter Standorte eine reale Feuerwache mit geklärter Zufahrt suchen
            und den Kauf bestätigen. Die passende Spielbesetzung wird bei der
            Inbetriebnahme automatisch bereitgestellt.
          </li>
          <li>
            Ein geeignetes Einstiegsfahrzeug wie das TSF kaufen. Preis,
            Fähigkeiten und Stellplatzbedarf vor dem Kauf prüfen. Kein separates
            Einstellen, Besetzen oder Ausbilden ist zum Ausrücken erforderlich.
          </li>
          <li>
            Notruf annehmen, Ort und Meldebild erfragen. Mit AAO oder freier
            Auswahl geeignete Fahrzeuge alarmieren.
          </li>
          <li>
            Ausrücken und FMS auf dem lokalen Straßennetz verfolgen. Nach
            Ankunft die erste Lagemeldung aufnehmen und fehlende Kräfte
            nachfordern.
          </li>
          <li>
            Nach Abschluss wird die Euro-Vergütung einmalig gebucht und
            Fahrzeuge kehren zurück.
          </li>
        </ol>
      </details>
      <details>
        <summary>Ausbauen und Fähigkeiten erweitern</summary>
        <p>
          Die gemeinsame Fortschrittsansicht zeigt alle aktuellen
          Freischaltungen. Eine freigeschaltete Organisation bietet ein
          passendes Einstiegsfahrzeug zum Kauf; Freischaltung schenkt weder
          Fahrzeuge noch Wachen. Die Personal- und Ausbildungskapazität gehört
          zum Betrieb und Ausbau des Gebäudes. XP gibt es für abgeschlossene
          Einsätze; Zeit, zusätzliche Fahrzeuge und wiederholte Meldungen
          erhöhen die Belohnung nicht.
        </p>
      </details>
      <details>
        <summary>Patienten und Wasserrettung</summary>
        <p>
          Patienten werden nach der Versorgung mit einem Transportfahrzeug zum
          öffentlichen Klinikum gebracht. Behandelte Patienten geben Plätze
          wieder frei. Auf der Deutschlandkarte erreichen Bootsgespanne einen
          geprüften Uferzugang über echte Straßen. Eine frei befahrbare
          Wasserroute wird derzeit nicht simuliert. Hubschrauber nutzen ihre
          eigene Luftfahrtlogik.
        </p>
      </details>
      <details>
        <summary>Serverzeit und Verbindung</summary>
        <p>
          Das Spiel läuft fest in Echtzeit. Neue Notrufe treffen einzeln ein.
          Sobald deine erste Wache fertig und ein Fahrzeug alarmierbar ist,
          beginnt der Einstieg mit fünf bis acht Minuten Abstand. Das gilt auch
          nachts und bei ruhiger Weltlage. Die ersten drei Einsätze kommen
          nacheinander; solange ein Einsatz offen oder kein Fahrzeug alarmierbar
          ist, wartet der nächste Notruf. Eine ausgebaute Leitstelle kann mehr
          parallele Aufgaben erhalten. Der Server simuliert deine Leitstelle
          auch bei geschlossenem Browser. Ohne Serververbindung können keine
          Aktionen bestätigt werden. Nach Serverstillstand werden höchstens vier
          Stunden nachberechnet.
        </p>
      </details>
      <details>
        <summary>Freunde und Belohnungen</summary>
        <p>
          Unter Leitstellen können bestehende Benutzer als Disponenten derselben
          Leitstelle eingeladen werden. Nach Annahme arbeiten sie am gemeinsamen
          Bestand. Andere Leitstellen sehen neue Einsätze und Wachen nicht.
          Unter Leitstellen gezielte Unterstützungsanfragen an
          Nachbarleitstellen stellen; erst eine ausdrückliche Zusage alarmiert
          fremde Kräfte. Laufende alte Unterstützungen werden weitergeführt.
        </p>
      </details>
      <details>
        <summary>Speichern und Wiederherstellen</summary>
        <p>
          Besitz und Spielaktionen werden in SQLite auf dem Server gespeichert.
          Mehrere Tabs sehen denselben bestätigten Serverstand. Alte
          Einzelspielerstände bleiben inaktive Archive. Exportdateien und
          freiwillige lokale Kopien stehen unter Sicherungen bereit. Die gesamte
          Datenbank wird regelmäßig automatisch gesichert. Wiederherstellung und
          Übernahme alter Browserdateien bleiben Wartungsaufgaben des
          Serverbetreibers außerhalb der Spielkonten.
        </p>
      </details>
      <details>
        <summary>Bedienung</summary>
        <p>
          Karte ziehen und mit Mausrad oder +/− zoomen. Gebäude und Einsätze
          anklicken oder mit Tab und Enter auswählen. Einsatzliste und
          Kartenwerkzeuge lassen sich einklappen. Menüs lassen sich mit Escape
          schließen.
        </p>
      </details>
      <details>
        <summary>Dein Arbeitsplatz und Audio</summary>
        <p>
          Alle dauerhaften Zugänge liegen in der oberen Leiste. Ansichten öffnen
          nur bei Bedarf; nach dem Schließen bleibt die Karte frei. Hauptmenü
          und Spiel verwenden dieselben Einstellungen. Lautstärke, Darstellung
          und Bedienung werden zuerst als Vorschau geändert und mit „Übernehmen“
          lokal gespeichert. „Verwerfen“ stellt die vorherigen Werte wieder her.
          Audio startet erst nach Interaktion; Musik, Umgebung, Telefon, Funk
          und Alarmierung besitzen eigene Regler. Ein Audioproblem stoppt keine
          Serveraktion.
        </p>
      </details>
    </div>
  );
}
