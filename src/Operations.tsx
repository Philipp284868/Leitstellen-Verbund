import { EnvironmentPanel } from "./Dynamics";
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
      <EnvironmentPanel s={s} />
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
                  {statuses[v.status]} ·{" "}
                  {duration(
                    v.journey?.blockedUntil
                      ? v.journey.blockedUntil - s.time
                      : seconds,
                  )}{" "}
                  {v.journey?.blockedUntil
                    ? "bis frühester Freigabe"
                    : "bis Ziel"}
                </span>
                {v.journey?.reason && (
                  <small>
                    {v.journey.reason} · Mehrzeit {duration(v.journey.delay)}
                  </small>
                )}
                <small>
                  {v.journey?.blockedUntil
                    ? "Verbleibender Fahrweg wird nach Freigabe neu berechnet"
                    : `${kilometers(remaining)} verbleibend / ${kilometers(total)} Gesamtstrecke`}
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
