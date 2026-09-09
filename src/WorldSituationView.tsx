import type { Save } from "./model";
import type { PublicAlarm } from "./network";
import {
  situationNames,
  situationPhaseNames,
  situationTimeline,
  localSituation,
} from "./simulation/world-situation";
export function WorldSituationView({ s }: { s: Save }) {
  const state = s.worldSituation;
  if (!state) return <p>Der gemeinsame Lagezustand wird vom Server geladen.</p>;
  return (
    <div className="world-situation-view">
      <h3>
        {situationNames[state.profile]} · {situationPhaseNames[state.phase]}
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
      <ol>
        {situationTimeline(state).map((p) => (
          <li
            key={p.phase}
            aria-current={p.phase === state.phase ? "step" : undefined}
          >
            {situationPhaseNames[p.phase]} ·{" "}
            {new Date(p.start * 1000).toLocaleTimeString("de-DE", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </li>
        ))}
      </ol>
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
