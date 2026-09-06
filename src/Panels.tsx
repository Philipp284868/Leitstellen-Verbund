import { approach } from "./travel";
import { useState } from "react";
import { mt, capabilities, vt } from "./catalog";
import {
  type Save,
  type Mission,
  achievements,
  achievementProgress,
  level,
} from "./model";
import { act, change, emit, api, useGame, switchMode } from "./store";
import { readiness, capacity, missing } from "./engine";
import { useNetwork, chat, share, stopSharing } from "./network";
import {
  exportText,
  download,
  inspectImport,
  backups,
  persist,
  type RecordSave,
} from "./storage";
import { credits, statuses, playerColor } from "./ui";
import { SharedMission } from "./SharedMission";
export function MissionPanel({ s, m }: { s: Save; m: Mission }) {
  const { mode } = useGame();
  const [selected, setSelected] = useState<string[]>([]);
  const net = useNetwork(),
    t = mt(m.template),
    skills = capacity(s, m.id);
  for (const f of net.support.filter(
    (f) =>
      f.mission === m.id && f.round === m.round && f.vehicle.status === "scene",
  )) {
    for (const [k, n] of Object.entries(vt(f.vehicle.type).skills))
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
                  {!reason && <> · {approach(s, v, m.pos)}</>}
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
        {mode === "multi" && (
          <button
            onClick={() =>
              void share(m.id).catch((e) => emit({ error: String(e) }))
            }
          >
            {m.shared ? "Freigegeben" : "Mit Freunden teilen"}
          </button>
        )}
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
    [text, setText] = useState("");
  const { mode } = useGame();
  if (mode === "single")
    return (
      <section className="empty">
        <h3>Deine eigene Region</h3>
        <p>
          Im Einzelspieler bleiben Wachen, Fahrzeuge und Einsätze privat. Dein
          separater Multiplayer-Spielstand wartet im Hauptmenü auf dich.
        </p>
        <button onClick={() => void switchMode("multi")}>
          Zum Multiplayer wechseln
        </button>
      </section>
    );
  return (
    <section>
      <p>
        Alle Konten auf diesem Server sind automatisch verbunden. Ein
        geschlossener Browser beendet keinen Einsatz. Neue Einsätze werden
        automatisch freigegeben. Wachen bleiben sichtbar, auch wenn gerade kein
        Fahrzeug unterstützt. Bestehende private Einsätze kannst du einzeln
        freigeben.
      </p>
      {net.friends.map((f) => (
        <article className="friend" key={f.id}>
          <strong style={{ color: playerColor(f.id) }}>{f.name}</strong>
          <small>{f.status}</small>
        </article>
      ))}
      {!net.friends.length && (
        <p>
          Noch keine weiteren Konten. Teile die Spieladresse mit deinen
          Freunden. Jeder kann dort ohne Einladung ein eigenes Spielerkonto
          erstellen.
        </p>
      )}
      {net.friends.flatMap((f) =>
        f.missions.map((m) => (
          <SharedMission
            key={m.id}
            s={s}
            friend={f}
            m={m}
            friends={net.friends}
          />
        )),
      )}
      <h3>Verbundfunk</h3>
      <div className="chat-log">
        {net.chat.map((c, i) => (
          <p key={i}>
            <b>{c.name}</b> {c.text}
          </p>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            chat(text);
            setText("");
          } catch (e) {
            emit({ error: String(e) });
          }
        }}
      >
        <label>
          Chatnachricht
          <input
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button disabled={!text.trim()}>Senden</button>
      </form>
      <small>
        Textchat, höchstens zwei Nachrichten pro Sekunde. Keine dauerhafte
        Chatspeicherung.
      </small>
    </section>
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
        Der verbindliche Spielstand liegt auf dem Server. Exportdateien und
        freiwillige lokale Kopien bleiben möglich. Alte Dateien können nur vom
        Serverbetreiber nach Sicherung und Serverstopp übernommen werden, nicht
        von einem privilegierten Spielkonto.
      </p>
      <button
        disabled={!s}
        onClick={() =>
          s &&
          void api("export")
            .then((data) =>
              download(
                "leitstellen-verbund-spielstand.json",
                JSON.stringify(data, null, 2),
              ),
            )
            .catch((e) => setError(String(e)))
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
            Validierte Vorschau. Diese Datei verändert keinen Serverbesitz.
            Übergebe sie bei Bedarf dem Serverbetreiber; nur er kann sie nach
            Sicherung und Serverstopp ausdrücklich übernehmen.
          </p>
          <button
            onClick={() =>
              download("gepruefte-sicherung.json", exportText(preview))
            }
          >
            Geprüfte Datei exportieren
          </button>
        </article>
      )}
      <h3>Freiwillige lokale Sicherungen dieses Kontos</h3>
      <p>
        Auf gemeinsam genutzten Geräten besser nur eine Datei exportieren.
        Lokale Kopien bleiben nach Abmeldung auf diesem Gerät erhalten.
      </p>
      <button
        disabled={!s}
        onClick={() =>
          s &&
          void persist(s, true)
            .then(() => setError("Lokale Kopie gespeichert."))
            .catch((e) => setError(String(e)))
        }
      >
        Lokale Kopie anlegen
      </button>
      <button
        onClick={() =>
          void backups()
            .then((rows) =>
              setRows(
                rows.filter(
                  (r) =>
                    r.data.player.id === s?.player.id &&
                    r.data.generation === s?.generation,
                ),
              ),
            )
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
      <h3>Konto erstellen</h3>
      <p>
        Auf der Startseite „Neues Konto erstellen“ wählen und Benutzername,
        Passwort, Anzeigename und Leitstellenname festlegen. Jeder kann sich
        ohne Einladung registrieren. Es gibt ausschließlich normale
        Spielerkonten.
      </p>
      <h3>Deine Spielwelten</h3>
      <p>
        Einzelspieler und Multiplayer besitzen getrennte Wachen, Guthaben und
        Fortschritte. Wähle den Modus im Hauptmenü. Vorhandener Besitz bleibt im
        Multiplayer. Beide Welten laufen auf dem Server weiter.
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
      <h3>Serverzeit und Verbindung</h3>
      <p>
        Die Geschwindigkeit ist zwischen 1× und 32× wählbar. Neue Einsätze
        treffen unabhängig davon einzeln mit 90–210 echten Sekunden Abstand ein;
        höchstens zwei eigene offene Einsätze je Welt. Der Server simuliert
        deine Leitstelle auch bei geschlossenem Browser. Ohne Serververbindung
        können keine Aktionen bestätigt werden. Nach Serverstillstand werden
        höchstens vier Stunden nachberechnet.
      </p>
      <h3>Freunde und Belohnungen</h3>
      <p>
        Alle registrierten Konten erreichen denselben Server. Neue
        Multiplayer-Einsätze werden automatisch freigegeben; andere Spieler
        bieten ihre eigenen einsatzbereiten Fahrzeuge an. Fremde Wachen bleiben
        sichtbar. Der Einsatzgeber erhält bei bestätigter Unterstützung die
        Hälfte der Belohnung, die andere Hälfte teilen sich die tatsächlich
        angekommenen Helfer. Der Server speichert alle Gutschriften atomar.
      </p>
      <h3>Speichern und Wiederherstellen</h3>
      <p>
        Besitz und Spielaktionen werden in SQLite auf dem Server gespeichert.
        Mehrere Tabs im selben Modus sehen denselben Stand; Einzelspieler und
        Multiplayer bleiben getrennt. Exportdateien und freiwillige lokale
        Kopien stehen unter Sicherungen bereit. Die gesamte Datenbank wird
        regelmäßig automatisch gesichert. Wiederherstellung und Übernahme alter
        Browserdateien bleiben Wartungsaufgaben des Serverbetreibers außerhalb
        der Spielkonten.
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
