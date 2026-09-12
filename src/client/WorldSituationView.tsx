import type { Save } from "../shared/model";
import type { PublicAlarm } from "./network";
import {
  situationNames,
  situationLevel,
  localSituation,
} from "../simulation/world-situation";
export function WorldSituationView({ s }: { s: Save }) {
  const state = s.worldSituation;
  if (!state) return <p>Der gemeinsame Lagezustand wird vom Server geladen.</p>;
  return (
    <div className="world-situation-view">
      <h3>
        {situationNames[state.profile]} · {situationLevel(state)}
      </h3>
      <p>
        {state.scope.name}
        {state.scope.kind === "circle" ? " · regional begrenzt" : ""}
      </p>
      <p>
        {localSituation(s)
          ? "Eigene Wachen liegen im betroffenen Gebiet."
          : "Die eigenen Wachen liegen außerhalb des betroffenen Gebiets."}
      </p>
      <p>
        Entwicklung:{" "}
        {state.dynamic?.trend === "rising"
          ? "zunehmend"
          : state.dynamic?.trend === "falling"
            ? "nachlassend"
            : "weitgehend stabil"}
        . Weitere Veränderungen ergeben sich aus der laufenden Lage.
      </p>
      <details>
        <summary>Bisheriger Lageverlauf</summary>
        {state.history.length ? (
          state.history
            .slice()
            .reverse()
            .map((h) => (
              <p key={h.id}>
                {situationNames[h.profile]} ·{" "}
                {new Date(h.started * 1000).toLocaleTimeString("de-DE")} –{" "}
                {new Date(h.ended * 1000).toLocaleTimeString("de-DE")}
              </p>
            ))
        ) : (
          <p>Noch kein Lagewechsel aufgezeichnet.</p>
        )}
      </details>
      <p>
        Simulierte Lage. Neue Vorgänge berücksichtigen Ausstattung und
        Belastung; bestehende Schäden bleiben bis zur Bearbeitung erhalten.
      </p>
      <small>
        Lage {state.id} · Serverzeit{" "}
        {new Date(state.clock * 1000).toLocaleString("de-DE")}
      </small>
    </div>
  );
}
export function PublicAlarmList({ alarms }: { alarms: PublicAlarm[] }) {
  return (
    <div className="public-alarm-list">
      <h3>Aktive Katastrophenbereitschaft</h3>
      {!alarms.length && (
        <p>Keine Leitstelle hat eine Bereitschaft ausgerufen.</p>
      )}
      {alarms.map((a) => (
        <article key={a.id}>
          <strong>{a.name}</strong>
          <p>
            {a.phase === "mobilizing"
              ? "Kräfte sammeln sich"
              : "Bereitschaft hergestellt"}{" "}
            · {a.stations} Wachen
            <br />
            Seit {new Date(a.started * 1000).toLocaleString("de-DE")}
          </p>
        </article>
      ))}
      <small>
        Spielinterne Bereitschaft. Unterstützung wird gesondert vereinbart.
      </small>
    </div>
  );
}
