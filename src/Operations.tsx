import type { Save } from "./model";
import { readiness } from "./engine";
import { duration, kilometers, travelling, trip } from "./travel";
import { statuses } from "./ui";

export function Operations({ s }: { s: Save }) {
  const active = s.vehicles
    .filter(travelling)
    .map((v) => ({ v, ...trip(v, s.time) }))
    .sort((a, b) => a.seconds - b.seconds);
  const ready = s.vehicles.filter((v) => !readiness(s, v)).length;
  const busy = s.vehicles.filter((v) => v.status !== "ready").length;
  return (
    <section className="operations" aria-label="Fahrten und Einsatzstatistik">
      <div className="stat-row">
        <span>
          Bereit{" "}
          <b>
            {ready} / {s.vehicles.length}
          </b>
        </span>
        <span>
          Gebunden{" "}
          <b>
            {s.vehicles.length
              ? Math.round((busy / s.vehicles.length) * 100)
              : 0}{" "}
            %
          </b>
        </span>
        <span>
          Unterwegs <b>{active.length}</b>
        </span>
        <span>
          Offene Fahrstrecke{" "}
          <b>{kilometers(active.reduce((sum, t) => sum + t.remaining, 0))}</b>
        </span>
        <span>
          Abgeschlossen <b>{s.completed}</b>
        </span>
        <span>
          Versorgte Patienten <b>{s.treated}</b>
        </span>
      </div>
      {active.length > 0 && (
        <details open>
          <summary>Fahrten · nächste Ankunft zuerst</summary>
          <div className="trip-list">
            {active.map(({ v, seconds, remaining, total }) => (
              <article key={v.id}>
                <b>{v.name}</b>
                <span>
                  {statuses[v.status]} · {duration(seconds)} bis Ziel
                </span>
                <small>
                  {kilometers(remaining)} verbleibend / {kilometers(total)}{" "}
                  Gesamtstrecke
                </small>
                <progress
                  value={total - remaining}
                  max={total || 1}
                  aria-label={`Fahrfortschritt ${v.name}`}
                />
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
