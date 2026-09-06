import { useState } from "react";
import { mt, capabilities, vt } from "./catalog";
import {
  type Save,
  type Mission,
  achievements,
  achievementProgress,
  level,
} from "./model";
import { act, change, emit, replaceSave } from "./store";
import { readiness, capacity, missing } from "./engine";
import {
  useNetwork,
  makeOffer,
  useSignal,
  cancel,
  disconnect,
  resync,
  chat,
  share,
  stopSharing,
  configureIce,
} from "./network";
import {
  exportText,
  download,
  inspectImport,
  backups,
  type RecordSave,
} from "./storage";
import { credits, statuses, playerColor } from "./ui";
import { SharedMission } from "./SharedMission";
export function MissionPanel({ s, m }: { s: Save; m: Mission }) {
  const [selected, setSelected] = useState<string[]>([]);
  const net = useNetwork(),
    t = mt(m.template),
    skills = capacity(s, m.id);
  for (const f of net.support.filter(
    (f) =>
      f.mission === m.id &&
      f.round === m.round &&
      f.vehicle.status === "scene" &&
      Date.now() - f.at < 6000,
  ))
    for (const [k, n] of Object.entries(vt(f.vehicle.type).skills))
      skills[k] = (skills[k] || 0) + n;
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
          Belohnung <b>{credits(t.reward)}</b>
        </span>
        <span>
          Patienten <b>{t.patients}</b>
        </span>
        <span>
          Stufe <b>{t.level}</b>
        </span>
      </div>
      <progress value={m.progress} max={t.seconds} />
      <p>
        {m.phase === "transport"
          ? "Patienten werden zum Klinikum gebracht"
          : needed.length
            ? "Wartet auf passende Kräfte am Einsatzort"
            : "Einsatz wird abgearbeitet"}{" "}
        · {Math.floor((m.progress / t.seconds) * 100)} %
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
      {net.support
        .filter((f) => f.mission === m.id && f.round === m.round)
        .map((f) => (
          <div className="person" key={f.assignment}>
            <span>
              {f.vehicle.name}
              <small>
                {net.friends.find((p) => p.id === f.peer)?.name} ·{" "}
                {Date.now() - f.at < 6000
                  ? statuses[f.vehicle.status]
                  : "Bestätigung veraltet"}
              </small>
            </span>
          </div>
        ))}
      <h3>Kräfte alarmieren</h3>
      <div className="inline">
        {s.templates.map((a, i) => (
          <button
            key={i}
            onClick={() => {
              const available = s.vehicles.filter((v) => !readiness(s, v));
              const ids: string[] = [];
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
                disabled={!!reason}
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
                </small>
              </span>
            </label>
          );
        })}
      </div>
      <div className="inline">
        <button
          className="primary"
          disabled={!selected.length}
          onClick={() => {
            void act({ type: "dispatch", mission: m.id, vehicles: selected });
            setSelected([]);
          }}
        >
          Alarmieren ({selected.length})
        </button>
        <button
          disabled={!selected.length}
          onClick={() => {
            const name = prompt("Name der Alarmierungsvorlage");
            if (name)
              void change((s) => {
                s.templates.push({
                  name,
                  types: selected.map(
                    (id) => vt(s.vehicles.find((v) => v.id === id)!.type).id,
                  ),
                });
              }).catch(() => {});
          }}
        >
          Vorlage speichern
        </button>
        <button
          onClick={() =>
            void share(m.id).catch((e) => emit({ error: String(e) }))
          }
        >
          {m.shared ? "Freigegeben" : "Mit Freunden teilen"}
        </button>
        {m.shared && (
          <button
            onClick={() => {
              if (
                confirm(
                  "Kooperationsrunde beenden? Unbestätigte fremde Beiträge entfallen. Eigene Kräfte bleiben zugeordnet.",
                )
              )
                void stopSharing(m.id).catch((e) => emit({ error: String(e) }));
            }}
          >
            Kooperation beenden
          </button>
        )}
      </div>
    </div>
  );
}
export function Friends({ s }: { s: Save }) {
  const net = useNetwork(),
    [input, setInput] = useState(""),
    [message, setMessage] = useState(""),
    [url, setUrl] = useState(""),
    [user, setUser] = useState(""),
    [password, setPassword] = useState("");
  return (
    <div className="friends-panel">
      <p className="banner">
        Lokale Profile · Vertrauensspiel für 2–4 Freunde. Keine Kamera, kein
        Mikrofon. Verbindungsinformationen können Netzwerkadressen offenlegen.
      </p>
      <h3>Direkte Verbindungen</h3>
      {net.friends.map((f) => (
        <article className="friend" key={f.id}>
          <span
            className="avatar"
            style={{ background: playerColor(f.id), color: "#12212a" }}
          >
            {f.name.slice(0, 1)}
          </span>
          <div>
            <b>{f.name}</b>
            <small>
              {f.status} · {f.vehicles.length} Fahrzeuge · {f.buildings.length}{" "}
              Wachen
            </small>
          </div>
          <button onClick={() => resync(f.id)}>Abgleichen</button>
          <button onClick={() => disconnect(f.id)}>Trennen</button>
        </article>
      ))}
      {!net.friends.length && (
        <p className="empty">
          Noch keine Freunde verbunden. Öffne auf beiden Geräten ein eigenes
          Spiel.
        </p>
      )}
      <details open>
        <summary>Verbindung hinzufügen</summary>
        <ol>
          <li>
            A erstellt ein Angebot und schickt den vollständigen Text an B.
          </li>
          <li>
            B fügt das Angebot ein, übernimmt es und schickt die erzeugte
            Antwort zurück.
          </li>
          <li>
            A fügt die Antwort ein und übernimmt sie. Erst „verbunden“ bestätigt
            den Datenkanal.
          </li>
        </ol>
        <p>
          Für drei oder vier Spieler wird jedes Paar einmal direkt verbunden.
          Bestehende Verbindungen bleiben unabhängig vom Einladenden.
        </p>
        <div className="inline">
          <button className="primary" onClick={() => void makeOffer()}>
            Angebot erstellen
          </button>
          <button onClick={cancel}>Abbrechen</button>
        </div>
        <p role="status">{net.status}</p>
        {net.error && (
          <p role="alert" className="error">
            {net.error}
          </p>
        )}
        <label>
          Verbindungstext zum Weitergeben
          <textarea
            aria-label="Verbindungstext zum Weitergeben"
            value={net.output}
            readOnly
            rows={4}
          />
        </label>
        <button
          disabled={!net.output}
          onClick={() =>
            navigator.clipboard.writeText(net.output).catch(() =>
              emit({
                error:
                  "Kopieren nicht erlaubt. Textfeld markieren und manuell kopieren.",
              }),
            )
          }
        >
          Text kopieren
        </button>
        <label>
          Angebot oder Antwort einfügen
          <textarea
            aria-label="Angebot oder Antwort einfügen"
            rows={4}
            maxLength={110000}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>
        <button
          onClick={() => {
            void useSignal(input);
            setInput("");
          }}
        >
          Verbindungstext übernehmen
        </button>
      </details>
      <details>
        <summary>Netzwerkeinstellungen · STUN / TURN</summary>
        <p>
          Standardmäßig kein externer Dienst. Für Internetverbindungen kannst du
          einen selbst bereitgestellten oder ausdrücklich zur Nutzung
          freigegebenen STUN-/TURN-Dienst eintragen. Ohne TURN scheitern manche
          NAT-Verbindungen. TURN leitet Daten weiter. Zugangsdaten bleiben nur
          im Arbeitsspeicher dieses Tabs.
        </p>
        <button
          onClick={() => {
            setUrl("stun:stun.cloudflare.com:3478");
            configureIce("stun:stun.cloudflare.com:3478", "", "");
            emit({
              notice:
                "Kostenloser Cloudflare-STUN-Dienst für neue Verbindungen aktiviert.",
            });
          }}
        >
          Kostenlosen Cloudflare-STUN-Dienst nutzen
        </button>
        <p>
          Externer Kontakt nur beim Verbindungsaufbau: stun.cloudflare.com, UDP
          3478. Cloudflare erhält dabei deine Netzwerkadresse.{" "}
          <a
            href="https://developers.cloudflare.com/realtime/turn/faq/"
            target="_blank"
            rel="noreferrer"
          >
            Dienstinformationen
          </a>
        </p>
        <label>
          Server-URL
          <input
            placeholder="stun:dein-server:3478"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label>
          TURN-Benutzername
          <input
            autoComplete="off"
            value={user}
            onChange={(e) => setUser(e.target.value)}
          />
        </label>
        <label>
          TURN-Passwort
          <input
            autoComplete="off"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          onClick={() => {
            try {
              configureIce(url, user, password);
              emit({
                notice:
                  "Netzwerkeinstellungen für neue Verbindungen übernommen.",
              });
            } catch (e) {
              emit({ error: String(e) });
            }
          }}
        >
          Übernehmen
        </button>
      </details>
      <h3>Freigegebene Einsätze</h3>
      {net.friends.flatMap((f) =>
        f.missions.map((m) => (
          <SharedMission
            key={f.id + m.id}
            s={s}
            friend={f}
            m={m}
            friends={net.friends}
          />
        )),
      )}
      <h3>Unterstützungsvorgänge</h3>
      {s.contributions
        .slice(-12)
        .reverse()
        .map((c) => (
          <div className="person" key={c.assignment}>
            <span>
              {s.vehicles.find((v) => v.id === c.vehicle)?.name || "Fahrzeug"}
              <small>
                {c.status === "cancelled"
                  ? "Abgebrochen"
                  : s.receipts.includes("coop:" + c.round + ":" + s.player.id)
                    ? "Belohnung bestätigt"
                    : c.status === "returned"
                      ? "Zurückgerufen · Abschlussbeleg gegebenenfalls ausstehend"
                      : "Unterstützung aktiv oder reserviert"}
              </small>
            </span>
          </div>
        ))}
      <h3>Gruppenfunk</h3>
      <div className="chat-log" aria-live="polite">
        {net.chat.map((c, i) => (
          <p key={i}>
            <b>{c.name}</b> {c.text}
          </p>
        ))}
      </div>
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault();
          chat(message);
          setMessage("");
        }}
      >
        <input
          aria-label="Chatnachricht"
          maxLength={500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Nachricht an verbundene Freunde …"
        />
        <button>Senden</button>
      </form>
    </div>
  );
}
export function BackupPanel({ s }: { s: Save | null }) {
  const [preview, setPreview] = useState<Save | null>(null),
    [backupDate, setBackupDate] = useState(0),
    [rows, setRows] = useState<RecordSave[]>([]),
    [error, setError] = useState("");
  return (
    <div>
      <p>
        Spielstände liegen ausschließlich in diesem Browser. Private Fenster und
        gelöschte Browserdaten können alles verlieren. Lokale Sicherungen
        ersetzen keine exportierte Datei.
      </p>
      <button
        disabled={!s}
        onClick={() =>
          s && download("leitstellen-verbund-spielstand.json", exportText(s))
        }
      >
        Spielstand exportieren
      </button>
      <label>
        Spielstanddatei importieren
        <input
          aria-label="Spielstanddatei importieren"
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            try {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 8 * 1024 * 1024)
                throw Error("Datei größer als 8 MB");
              const incoming = inspectImport(await file.text());
              setPreview(incoming.save);
              setBackupDate(incoming.exportedAt);
              setError("");
            } catch (err) {
              setPreview(null);
              setError(String(err));
            }
          }}
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {preview && (
        <article className="shop-card">
          <h3>Import prüfen: {preview.player.name}</h3>
          <p>Sicherungsdatum: {new Date(backupDate).toLocaleString("de-DE")}</p>
          <p>
            {preview.player.station} · Stufe {level(preview)} ·{" "}
            {credits(preview.money)} · {preview.buildings.length} Wachen ·{" "}
            {preview.vehicles.length} Fahrzeuge
          </p>
          <p>
            Der bisherige Spielstand wird zuerst lokal gesichert. Die Übernahme
            erzeugt eine neue Spielstandgeneration; es erfolgt keine
            Zusammenführung.
          </p>
          <button
            onClick={() =>
              void replaceSave(preview)
                .then(() => {
                  setPreview(null);
                  emit({ notice: "Spielstand übernommen." });
                })
                .catch((e) => setError(String(e)))
            }
          >
            Geprüften Spielstand übernehmen
          </button>
        </article>
      )}
      <h3>Rotierende lokale Sicherungen</h3>
      <button
        onClick={() =>
          void backups()
            .then(setRows)
            .catch((e) => setError(String(e)))
        }
      >
        Sicherungen anzeigen
      </button>
      {rows.map((r) => (
        <article className="person" key={r.id}>
          <span>
            {new Date(r.at).toLocaleString("de-DE")}
            <small>
              {r.data.player.name} · {credits(r.data.money)}
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
    </div>
  );
}
export function ProgressPanel({ s }: { s: Save }) {
  return (
    <div>
      <h3>Öffentlicher Bereitschaftsdienst</h3>
      <p>
        Jederzeit ohne Wache oder Fahrzeug möglich: 120 Spielsekunden
        Funkbereitschaft übernehmen und 1.500 Credits verdienen. Keine Kosten,
        keine parallelen Dienste.
      </p>
      <button
        disabled={s.reliefActive}
        onClick={() => void act({ type: "relief" })}
      >
        {s.reliefActive
          ? "Bereitschaftsdienst läuft …"
          : "Bereitschaftsdienst übernehmen"}
      </button>
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
      <h3>Die erste Schicht</h3>
      <ol>
        <li>
          Eine Feuerwache auf einer Straßenkreuzung bauen. Bauzeit abwarten.
        </li>
        <li>
          Zwei TSF-W kaufen. Je Fahrzeug sechs Mitarbeiter einstellen und im
          Fuhrpark „Besetzen“ wählen.
        </li>
        <li>
          Einen Einsatz auswählen, Anforderungen prüfen, Fahrzeuge markieren und
          alarmieren.
        </li>
        <li>
          Fahrzeuge fahren auf dem lokalen Straßennetz. Nur passende Fähigkeiten
          am Einsatzort lassen den Fortschritt steigen.
        </li>
        <li>
          Nach Abschluss werden Credits einmalig gebucht und Fahrzeuge kehren
          zurück.
        </li>
      </ol>
      <h3>Ausbauen und ausbilden</h3>
      <p>
        Ab Stufe 2 werden Rettungsdienst, Polizei und Ausbildung verfügbar; ab
        Stufe 3 THW und Wasserrettung, ab Stufe 4 Luftrettung. Pro Einsatz gibt
        es Erfahrung. Es gibt keine laufenden Pflichtkosten. Wachen erweitern
        ihre Stell- und Personalplätze. Spezialfahrzeuge brauchen passende
        Fachausbildung der gesamten Besatzung.
      </p>
      <h3>Patienten und Wasserrettung</h3>
      <p>
        Patienten werden nach der Versorgung mit einem Transportfahrzeug zum
        öffentlichen Klinikum gebracht. Behandelte Patienten geben Plätze wieder
        frei. Boote starten ausschließlich an Wasserzugängen und bewegen sich
        auf dem Wasserweg. Straßenfahrzeuge und Luftrettung folgen ihren eigenen
        Bewegungsregeln.
      </p>
      <h3>Zeit und Offline-Spiel</h3>
      <p>
        Die Geschwindigkeit ist zwischen 1× und 32× wählbar. Beim Wiederöffnen
        werden maximal vier Stunden Simulationszeit nachberechnet. Es entstehen
        offline keine neuen Einsätze und keine Strafkosten. Gemeinsame Einsätze
        schließen offline nicht automatisch ab.
      </p>
      <h3>Freunde und Belohnungen</h3>
      <p>
        Im Bereich Freunde erklärt der Assistent Angebot und Antwort. Verbinde
        jedes Spielerpaar direkt. Jeder verwaltet sein eigenes Geld und seine
        Fahrzeuge. Der Einsatzgeber erhält bei bestätigter Unterstützung die
        Hälfte der Belohnung; die andere Hälfte wird gleichmäßig unter den
        bestätigten Helfern geteilt und abgerundet. Lokale Eigentümer und
        Koordinatoren sind vertrauenswürdig zu behandeln, nicht technisch gegen
        Manipulation abgesichert.
      </p>
      <h3>Speichern und Wiederherstellen</h3>
      <p>
        Wichtige Änderungen werden sofort in IndexedDB gespeichert. Alle 60
        Sekunden entsteht eine lokale Sicherung, die letzten fünf bleiben
        erhalten. Exportiere zusätzlich eine Datei über „Sicherungen“. Ein
        zweiter Tab bleibt schreibgeschützt. Für Gerätewechsel Datei exportieren
        und auf dem anderen Gerät importieren; keine automatische
        Synchronisation.
      </p>
      <h3>Bedienung</h3>
      <p>
        Karte ziehen und mit Mausrad oder +/− zoomen. Gebäude und Einsätze
        anklicken oder mit Tab und Enter auswählen. Auf kleinen Displays
        zwischen Einsätzen und Karte wechseln. Menüs lassen sich mit Escape
        schließen.
      </p>
    </div>
  );
}
