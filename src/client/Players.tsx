import { useEffect, useState } from "react";
import { api } from "./store";
import { credits } from "./ui";
import type { leaderboard } from "../server/leaderboard";
type Board = ReturnType<typeof leaderboard>;
const number = (v: number | null | undefined) =>
  v == null
    ? "Nicht erfasst"
    : v.toLocaleString("de-DE", { maximumFractionDigits: 1 });
export function Players() {
  const [data, setData] = useState<Board | null>(null),
    [q, setQ] = useState(""),
    [sort, setSort] = useState("xp"),
    [page, setPage] = useState(0),
    [showMine, setShowMine] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void api(
        `leaderboard?${new URLSearchParams({ q, sort, page: String(page) })}`,
      )
        .then((d) => {
          if (alive) {
            setData(d);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, sort, page]);
  return (
    <section className="menu-flow leaderboard" aria-label="Leaderboard">
      <h2>Leaderboard</h2>
      <p>Spieler dieser Serverwelt · Rang nach Wertungs-XP · auch offline</p>
      <details>
        <summary>Wertung und Datengrundlage</summary>
        <p>
          Alle berechtigten Konten dieses Servers, einschließlich
          Offline-Spielern. Rang nach Gesamt-Wertungs-XP, bei Gleichstand nach
          Erstellungszeit und stabiler Konto-ID. Technische Konten mit
          Betreiberkennzeichnung sind ausgeschlossen.
        </p>
        <p>
          Wertung: übernommene historische Konto-XP plus seit Version 2.25
          erfasste Einsatzanteile. Bestätigte Einsatz-XP werden gleichmäßig auf
          die tatsächlich beteiligten Disponenten verteilt, Restpunkte nach
          stabiler ID. Leitstellenbestand zählt nicht mehrfach als persönliche
          Leistung.
        </p>
      </details>
      <div className="inline">
        <label>
          Spieler oder Leitstelle suchen
          <input
            value={q}
            maxLength={100}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Sortierung
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(0);
            }}
          >
            <option value="xp">XP / Rang</option>
            <option value="name">Name</option>
            <option value="calls">Angenommene Notrufe</option>
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            {data.total} Spieler · Eigener Rang:{" "}
            {data.myRank ?? "Nicht gewertet"}{" "}
            <button
              disabled={!data.myRank}
              onClick={() => {
                setQ("");
                setSort("xp");
                setShowMine(true);
                setPage(Math.floor(((data.myRank ?? 1) - 1) / 20));
              }}
            >
              Meine Position
            </button>
          </p>
          {data.items.map((p) => (
            <details
              key={p.id}
              className="leaderboard-row"
              open={(p.own && showMine) || undefined}
            >
              <summary>
                <strong>
                  #{p.rank} {p.name}
                  {p.own ? " · Du" : ""}
                </strong>
                <span>
                  Stufe {p.level} · {number(p.xp)} XP
                </span>
                <small>{p.desk}</small>
              </summary>
              <h3>Persönliche Erfassung seit Version 2.25</h3>
              <dl className="metric-grid">
                <dt>Historische Konto-XP</dt>
                <dd>{number(p.legacyXp)}</dd>
                <dt>Angenommene Notrufe</dt>
                <dd>{number(p.calls)}</dd>
                <dt>Abgeschlossene Einsatzbeteiligungen</dt>
                <dd>{number(p.participations)}</dd>
                <dt>Aktive Spielzeit</dt>
                <dd>{number(p.activeSeconds / 3600)} h</dd>
              </dl>
              <p>
                Ältere persönliche Aktionen und Spielzeit sind nicht erfasst.
                Historische Konto-XP können aus damaliger gemeinsamer
                Leitstellenarbeit stammen.
              </p>
              {p.shared && (
                <>
                  <h3>Gemeinsame Leitstelle: {p.desk}</h3>
                  <dl className="metric-grid">
                    <dt>Leitstellen-XP / erledigte Einsätze</dt>
                    <dd>
                      {number(p.shared.xp)} / {number(p.shared.completed)}
                    </dd>
                    <dt>Standorte / Fahrzeuge / Personal</dt>
                    <dd>
                      {p.shared.sites} / {p.shared.vehicles} / {p.shared.people}
                    </dd>
                    <dt>Patienten übergeben / verstorben</dt>
                    <dd>
                      {number(p.shared.patients?.delivered)} /{" "}
                      {number(p.shared.patients?.dead)}
                    </dd>
                    <dt>Angenommene Notrufe / Sprechwünsche</dt>
                    <dd>
                      {number(p.shared.calls)} / {number(p.shared.requests)}
                    </dd>
                    <dt>Fehlalarme / Ø Gesprächsdauer</dt>
                    <dd>
                      {number(p.shared.falseAlarms)} /{" "}
                      {number(p.shared.meanCallSeconds)} s
                    </dd>
                    <dt>Großlagen</dt>
                    <dd>{number(p.shared.major)}</dd>
                    <dt>Fahrleistung</dt>
                    <dd>
                      {number(
                        p.shared.meters == null ? null : p.shared.meters / 1000,
                      )}{" "}
                      km
                    </dd>
                    <dt>Einsatzvergütungen</dt>
                    <dd>
                      {p.shared.credits == null
                        ? "Nicht erfasst"
                        : credits(p.shared.credits)}
                    </dd>
                    <dt>Ø Anfahrt / Einsatzdauer</dt>
                    <dd>
                      {number(p.shared.timings.travel)} /{" "}
                      {number(p.shared.timings.total)} s
                    </dd>
                  </dl>
                  <details>
                    <summary>Einsatzmix seit Version 2.25</summary>
                    <p>
                      Ältere Organisations-, Typ- und Unterstützungsanteile sind
                      nicht vollständig erfasst.
                    </p>
                    <p>
                      Einsätze mit externer Unterstützung:{" "}
                      {number(p.shared.breakdown?.assisted)}
                    </p>
                    <dl className="metric-grid">
                      {Object.entries(p.shared.breakdown?.byOrg ?? {}).map(
                        ([name, count]) => (
                          <span key={name}>
                            {name}: {number(count as number)}
                          </span>
                        ),
                      )}
                    </dl>
                    <ul>
                      {Object.entries(p.shared.breakdown?.byType ?? {}).map(
                        ([name, count]) => (
                          <li key={name}>
                            {name}: {number(count as number)}
                          </li>
                        ),
                      )}
                    </ul>
                  </details>
                  <p>
                    Leitstellenmesswerte seit{" "}
                    {p.shared.since
                      ? new Date(p.shared.since * 1000).toLocaleDateString(
                          "de-DE",
                        )
                      : "Beginn der Erfassung noch nicht vorhanden"}
                    . Diese Werte gehören gemeinsam der Leitstelle und werden
                    nicht jedem Mitglied persönlich gutgeschrieben.
                  </p>
                </>
              )}
            </details>
          ))}
          {!data.items.length && <p>Keine passenden Spieler.</p>}
          <nav aria-label="Leaderboard-Seiten" className="inline">
            <button
              disabled={data.page === 0}
              onClick={() => setPage(data.page - 1)}
            >
              Zurück
            </button>
            <span>
              Seite {data.page + 1} / {Math.max(1, Math.ceil(data.total / 20))}
            </span>
            <button
              disabled={(data.page + 1) * 20 >= data.total}
              onClick={() => setPage(data.page + 1)}
            >
              Weiter
            </button>
          </nav>
        </>
      )}
      {!data && !error && <p>Rangliste wird geladen …</p>}
    </section>
  );
}
