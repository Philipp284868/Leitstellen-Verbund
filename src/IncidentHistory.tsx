import { useState } from "react";
import type { Save, Mission } from "./model";
import { useGame } from "./store";
import { duration } from "./travel";
export function History({ s, m }: { s: Save; m: Mission }) {
  const { workspace } = useGame();
  const [query, setQuery] = useState(""),
    [limit, setLimit] = useState(100);
  const events = (m.control?.events ?? []).filter((e) =>
    `${e.type} ${e.text} ${e.actor}`
      .toLocaleLowerCase("de")
      .includes(query.toLocaleLowerCase("de")),
  );
  return (
    <details
      className="incident-history"
      data-hud-section="history"
      open={m.phase === "done"}
    >
      <summary>
        Einsatzhistorie · {m.control?.events.length ?? 0} Einträge
      </summary>
      <label>
        Historie durchsuchen
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(100);
          }}
        />
      </label>
      <p>
        {Math.min(limit, events.length)} von {events.length} passenden Einträgen
      </p>
      <ol>
        {events.slice(0, limit).map((e) => (
          <li key={e.id}>
            <small>
              +{duration(e.at - m.created)} ·{" "}
              {workspace?.members.find((u) => u.id === e.actor)?.name ??
                e.actor}
              {e.vehicle
                ? ` · ${s.vehicles.find((v) => v.id === e.vehicle)?.name ?? e.vehicle}`
                : ""}
            </small>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
      {events.length > limit && (
        <button onClick={() => setLimit(limit + 100)}>
          Weitere 100 Ereignisse anzeigen
        </button>
      )}
    </details>
  );
}
