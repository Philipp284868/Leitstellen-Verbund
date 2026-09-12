import { ledgerBalance } from "./economy/ledger";
import { useState, useEffect } from "react";
import { api } from "./store";
import { QualityReport } from "./QualityReport";
import type { Save, Mission } from "./model";
import { mt } from "./catalog";
import { buildReport } from "./simulation/reports";
import { timingKeys } from "./simulation/report-schema";
import {
  timeLabels,
  reportDocument,
  reportsCSV,
  saveFile,
} from "./reports/export";
import { duration, kilometers } from "./travel";
import { credits } from "./ui";
import "./Reports.css";

export function Replay({ m }: { m: Mission }) {
  const events = m.control?.events ?? [];
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setIndex((i) => Math.min(events.length - 1, i + 1)),
      800,
    );
    return () => clearInterval(timer);
  }, [playing, events.length]);
  useEffect(() => {
    if (index >= events.length - 1) setPlaying(false);
  }, [index, events.length]);
  if (!events.length)
    return (
      <p>Für diesen älteren Einsatz ist kein Ereigniszeitstrahl vorhanden.</p>
    );
  const visible = events.slice(0, index + 1),
    current = events[index];
  const fms = new Map<string, string>();
  for (const event of visible)
    if (event.vehicle && event.type === "FMS_CHANGED")
      fms.set(event.vehicle, event.text);
  return (
    <section className="replay" aria-label="Einsatz-Replay">
      <h3>Ereignis-Replay</h3>
      <p>
        Aufgezeichnete Ereignisse ansehen. Die laufende Spielwelt bleibt
        unverändert.
      </p>
      <div className="report-actions">
        <button
          onClick={() => {
            setPlaying(false);
            setIndex(0);
          }}
        >
          Zum Anfang
        </button>
        <button
          disabled={!index}
          onClick={() => {
            setPlaying(false);
            setIndex(index - 1);
          }}
        >
          Vorheriges Ereignis
        </button>
        <button
          aria-pressed={playing}
          onClick={() => {
            if (index === events.length - 1) setIndex(0);
            setPlaying(!playing);
          }}
        >
          {playing ? "Wiedergabe pausieren" : "Replay abspielen"}
        </button>
        <button
          disabled={index === events.length - 1}
          onClick={() => {
            setPlaying(false);
            setIndex(index + 1);
          }}
        >
          Nächstes Ereignis
        </button>
      </div>
      <label>
        Replay-Zeitstrahl
        <input
          type="range"
          min="0"
          max={events.length - 1}
          value={index}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
        />
      </label>
      <output>
        {index + 1} / {events.length} · +{duration(current.at - m.created)}
      </output>
      <article className="replay-current" aria-live="polite">
        <strong>{current.text}</strong>
        <small>
          {current.type} · Bearbeiter {current.actor}
        </small>
      </article>
      <details>
        <summary>Funkstatus an dieser Stelle ({fms.size})</summary>
        {[...fms].map(([id, text]) => (
          <p key={id}>
            {m.telemetry?.units.find((u) => u.id === id)?.name ?? id}: {text}
          </p>
        ))}
      </details>
      <ol className="replay-events">
        {visible.slice(-8).map((e) => (
          <li key={e.id}>
            <small>+{duration(e.at - m.created)}</small> {e.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
export function ReportPanel({ m }: { m: Mission }) {
  const r = m.report ?? buildReport(m);
  const issues = (m.control?.events ?? []).filter((e) =>
    /DEFICIT|SHORTAGE|REINFORCEMENT|TURNOUT_FAILED|VEHICLE_BREAKDOWN|MAJOR_RESOURCE/.test(
      e.type,
    ),
  );
  return (
    <section className="report-panel" aria-label="Einsatzbericht">
      <span className="eyebrow">ABSCHLUSS & AUSWERTUNG</span>
      <h2>{mt(m.template).name}</h2>
      <p>Einsatz {m.id}</p>
      {m.location?.state === "technical-closure" && (
        <p className="report-note">{m.location.reason}</p>
      )}
      <div className="resource-summary" aria-label="Einsatzkurzbilanz">
        <div>
          <small>Vergütung</small>
          <strong>
            {r.credits === null ? "Nicht erfasst" : credits(r.credits)}
          </strong>
        </div>
        <div>
          <small>Erfahrung</small>
          <strong>{r.xp ?? "Nicht erfasst"} XP</strong>
        </div>
        <div>
          <small>Aufgezeichnete Fahrstrecke</small>
          <strong>{kilometers(r.meters)}</strong>
        </div>
      </div>
      <p className="view-intro">
        {r.units.length} eigene Fahrzeuge dokumentiert. {r.requests}{" "}
        Nachforderungen bearbeitet; {r.patients.delivered} Patienten übergeben.{" "}
        {r.timings.total === null
          ? "Die Gesamtdauer wurde nicht erfasst."
          : `Gesamtdauer: ${duration(r.timings.total)}.`}{" "}
        {issues.length
          ? `${issues.length} dokumentierte Engpass- oder Betriebshinweise stehen in der Dispositionsauswertung.`
          : "Im erfassten Verlauf sind keine Engpasshinweise verzeichnet."}
      </p>
      {r.quality && m.location?.state !== "technical-closure" && (
        <QualityReport quality={r.quality} />
      )}
      {r.partial && (
        <p className="report-note">
          Teilweise historische Erfassung. Nicht aufgezeichnete Zeiten und
          Buchungen werden als „nicht erfasst“ angezeigt.
        </p>
      )}
      <div className="report-actions">
        <button
          onClick={() =>
            saveFile(
              `einsatz-${m.id}.json`,
              JSON.stringify(reportDocument(m), null, 2),
            )
          }
        >
          Bericht als JSON
        </button>
        <button
          onClick={() =>
            saveFile(
              `einsatz-${m.id}.csv`,
              reportsCSV([m]),
              "text/csv;charset=utf-8",
            )
          }
        >
          Bericht als CSV
        </button>
        <button onClick={() => window.print()}>Bericht drucken</button>
      </div>
      <dl className="report-grid">
        {timingKeys.map((key) => (
          <div key={key}>
            <dt>{timeLabels[key]}</dt>
            <dd>
              {r.timings[key] === null
                ? "nicht erfasst"
                : duration(r.timings[key])}
            </dd>
          </div>
        ))}
      </dl>
      <div className="stat-row">
        <span>
          Notrufe <b>{r.calls}</b>
        </span>
        <span>
          Gesprächszeit <b>{duration(r.callSeconds)}</b>
        </span>
        <span>
          Nachforderungen <b>{r.requests}</b>
        </span>
        <span>
          Eigene Einsatzkilometer <b>{kilometers(r.meters)}</b>
        </span>
        <span>
          Vergütung{" "}
          <b>{r.credits === null ? "nicht erfasst" : credits(r.credits)}</b>
        </span>
        <span>
          XP <b>{r.xp ?? "nicht erfasst"}</b>
        </span>
      </div>
      <p>
        Patienten: {r.patients.total} · übergeben: {r.patients.delivered} ·
        verstorben: {r.patients.dead}.{" "}
        {r.major ? "Großlage abgeschlossen." : "Einsatz abgeschlossen."}
      </p>
      <p>
        Fahrstrecken umfassen erfasste eigene Einsatz- und Transportfahrten bis
        zum Abschluss. Rückfahrten und Nachbarhilfe zählen zur
        Gesamtfahrleistung der jeweiligen Heimatleitstelle. Anschaffungen und
        Grundfinanzierung stehen separat im Geldjournal.
      </p>
      <details>
        <summary>Eingesetzte eigene Fahrzeuge ({r.units.length})</summary>
        {r.units.map((u) => (
          <p key={u.id}>
            {u.name} · {u.type} · {kilometers(u.meters)}
          </p>
        ))}
        {!r.units.length && (
          <p>
            Keine eigenen Fahrzeugdaten aufgezeichnet. Bestätigte Vorgänge
            stehen im Verlauf.
          </p>
        )}
      </details>
      <details>
        <summary>Disposition auswerten</summary>
        <p>
          {issues.length} aufgezeichnete Hinweise auf Engpässe oder
          Nachforderungen. Die Auswertung beschreibt Ereignisse und ist keine
          reale Qualitätsbewertung.
        </p>
        {issues.slice(-20).map((e) => (
          <p key={e.id}>
            +{duration(e.at - m.created)} · {e.text}
          </p>
        ))}
        {r.aaos.map((a, i) => (
          <p key={i}>
            AAO {a.name}:{" "}
            {a.sufficient
              ? "damals bekannte Anforderungen abgedeckt"
              : "Vorschlag enthielt Fehlbedarf"}
            .
          </p>
        ))}
      </details>
      <Replay key={m.id} m={m} />
    </section>
  );
}
export function ArchivePanel({
  s,
  open,
}: {
  s: Save;
  open: (id: string) => void;
}) {
  const [tab, setTab] = useState("archive"),
    [query, setQuery] = useState(""),
    [org, setOrg] = useState("Alle"),
    [major, setMajor] = useState(false);
  const [page, setPage] = useState(0);
  const [history, setHistory] = useState<{
    total: number;
    page: number;
    missions: Mission[];
  } | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyDetail, setHistoryDetail] = useState<Mission | null>(null);
  useEffect(() => setPage(0), [query, org, major]);
  useEffect(() => {
    let cancelled = false;
    setHistoryError("");
    const params = new URLSearchParams({
      page: String(page),
      query,
      org,
      major: String(major),
    });
    const timer = setTimeout(
      () => {
        void api(`history?${params}`)
          .then((result) => {
            if (!cancelled) setHistory(result);
          })
          .catch((error) => {
            if (!cancelled) setHistoryError(String(error.message));
          });
      },
      query ? 250 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [page, query, org, major, s.completed, s.player.id]);
  const t = s.statistics;
  const filtered =
    history?.missions ??
    s.archive.filter(
      (m) =>
        (org === "Alle" || mt(m.template).org === org) &&
        (!major || m.major) &&
        `${m.id} ${mt(m.template).name} ${m.telemetry?.units.map((u) => u.name).join(" ") ?? ""}`
          .toLocaleLowerCase("de")
          .includes(query.toLocaleLowerCase("de")),
    );
  return (
    <section className="archive-console">
      <div
        className="report-tabs"
        role="group"
        aria-label="Auswertung auswählen"
      >
        {[
          ["statistics", "Statistiken"],
          ["archive", "Einsatzberichte"],
          ["journal", "Geldjournal"],
        ].map(([id, name]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {name}
          </button>
        ))}
      </div>
      {tab === "statistics" && (
        <>
          <h2>Deine Leitstelle in Zahlen</h2>
          <p>
            {s.completed} Einsätze insgesamt · {t.completed} Einsätze mit
            auswertbaren Berichten. Vollständige Einsatzberichte werden
            dauerhaft auf dem Server archiviert und seitenweise geladen.
          </p>
          <dl className="report-grid">
            {[
              ["Notrufe", t.calls],
              ["Nachforderungen", t.requests],
              ["Fehlalarme", t.falseAlarms],
              ["Großlagen", t.major],
              ["Patienten übergeben", t.delivered],
              ["Patienten verstorben", t.dead],
              ["Erfasste Gesamtfahrleistung", kilometers(t.meters)],
              ["Erfasste Einsatzvergütung", credits(t.credits)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <h3>Durchschnittliche Einsatzzeiten</h3>
          <dl className="report-grid">
            {timingKeys.map((k) => (
              <div key={k}>
                <dt>{timeLabels[k]}</dt>
                <dd>
                  {t.timings[k]?.count
                    ? duration(t.timings[k].sum / t.timings[k].count)
                    : "noch nicht erfasst"}
                  <small>{t.timings[k]?.count ?? 0} Messungen</small>
                </dd>
              </div>
            ))}
          </dl>
          <h3>AAO-Auswertung</h3>
          <p>
            Anteil verwendeter Vorschläge, die die zum Alarmierungszeitpunkt
            bekannten Anforderungen abdeckten. Spätere Eskalationen sind darin
            nicht vorweggenommen.
          </p>
          {Object.entries(t.aaos).map(([id, a]) => (
            <p key={id}>
              {a.name}: {Math.round((a.sufficient / a.uses) * 100)} % bei{" "}
              {a.uses} Anwendungen
            </p>
          ))}
          {!Object.keys(t.aaos).length && (
            <p>Noch keine verwendete AAO in abgeschlossenen Berichten.</p>
          )}
          <p className="report-note">
            Fahrleistung wird seit dem Update gemessen. Ältere Archivereignisse
            liefern vorhandene Zeiten; fehlende Werte zählen nicht als null
            Sekunden.
          </p>
        </>
      )}
      {tab === "archive" && (
        <>
          <h2>Einsatzberichte</h2>
          <div className="report-filters">
            <label>
              Einsatz, Stichwort oder Fahrzeug suchen
              <input value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label>
              Organisation
              <select value={org} onChange={(e) => setOrg(e.target.value)}>
                {[
                  "Alle",
                  "Feuerwehr",
                  "Rettungsdienst",
                  "Polizei",
                  "THW",
                  "Wasserrettung",
                  "Infrastruktur",
                ].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={major}
                onChange={(e) => setMajor(e.target.checked)}
              />{" "}
              Nur Großlagen
            </label>
          </div>
          <p>{history?.total ?? filtered.length} passende Berichte</p>
          {historyError && (
            <p role="alert">
              Archiv konnte nicht geladen werden: {historyError}. Angezeigt wird
              gegebenenfalls der zuletzt geladene Ausschnitt.
            </p>
          )}
          {history && history.total > 25 && (
            <nav className="mission-pagination" aria-label="Archivseiten">
              <button
                disabled={history.page === 0}
                onClick={() => setPage(history.page - 1)}
              >
                Vorherige Berichte
              </button>
              <span>
                Seite {history.page + 1}/{Math.ceil(history.total / 25)}
              </span>
              <button
                disabled={(history.page + 1) * 25 >= history.total}
                onClick={() => setPage(history.page + 1)}
              >
                Weitere Berichte
              </button>
            </nav>
          )}
          <button
            disabled={!filtered.length}
            onClick={() =>
              saveFile(
                "einsatzberichte.csv",
                reportsCSV(filtered),
                "text/csv;charset=utf-8",
              )
            }
          >
            Angezeigte Berichte als CSV
          </button>
          {filtered.map((m) => (
            <article className="archive-item" key={m.id}>
              <div>
                <strong>{mt(m.template).name}</strong>
                {m.location?.state === "technical-closure" && (
                  <small>
                    Technisch aufgehoben · ohne Vergütung und Wertung
                  </small>
                )}
                <small>
                  {duration(m.completed - m.created)} · {m.id.slice(-12)}
                </small>
              </div>
              <button
                onClick={() =>
                  s.archive.some((current) => current.id === m.id)
                    ? open(m.id)
                    : setHistoryDetail(m)
                }
              >
                Verlauf ansehen
              </button>
            </article>
          ))}
          {historyDetail && (
            <section aria-label="Archivierter Einsatzverlauf">
              <button onClick={() => setHistoryDetail(null)}>
                Archivbericht schließen
              </button>
              <ReportPanel m={historyDetail} />
            </section>
          )}
        </>
      )}
      {tab === "journal" && (
        <>
          <h2>Geldjournal</h2>
          <div className="resource-summary">
            <div>
              <small>Verfügbares Budget</small>
              <strong>{credits(s.money)}</strong>
            </div>
            <div>
              <small>Aus Buchungen erklärter Saldo</small>
              <strong>
                {s.economy ? credits(ledgerBalance(s)) : "Historischer Stand"}
              </strong>
            </div>
            <div>
              <small>Laufende Betriebskosten</small>
              <strong>Keine</strong>
            </div>
          </div>
          <p className="view-intro">
            Die neuesten {s.journal.length} Buchungen. Frühere Buchungen sind im
            Eröffnungssaldo berücksichtigt. Alle Beträge sind exakt in Euro-Cent
            gespeichert; XP werden separat geführt.
          </p>
          {!s.journal.length && (
            <div className="empty-state">
              <h3>Noch keine Buchungen</h3>
              <p>
                Der Startbetrag steht als Eröffnungssaldo bereit. Käufe und
                serverseitige Vergütungen erscheinen hier automatisch.
              </p>
            </div>
          )}
          {s.journal.map((j) => (
            <article className="archive-item" key={j.id}>
              <span>
                {j.text}
                <small>
                  {new Date(j.at * 1000).toLocaleString("de-DE")} · Beleg{" "}
                  {j.id.slice(-12)}
                </small>
              </span>
              <b>{credits(j.amount)}</b>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
