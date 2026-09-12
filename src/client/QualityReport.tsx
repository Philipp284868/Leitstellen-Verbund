import type { Report } from "../simulation/report-schema";
import { duration } from "../shared/travel";

export function QualityReport({
  quality,
}: {
  quality: NonNullable<Report["quality"]>;
}) {
  return (
    <section className="report-panel" aria-label="Einsatzbewertung">
      <h3>Einsatzbewertung</h3>
      {!quality.assessed ? (
        <p>
          Für diesen älteren Einsatz fehlen vollständige Messdaten. Es wird
          keine nachträgliche Leistungsnote erfunden.
        </p>
      ) : (
        <>
          <strong>
            {quality.grade} · {quality.score}/100 Punkte
          </strong>
          <dl className="report-grid">
            <div>
              <dt>Fahrt gegenüber Planung</dt>
              <dd>
                {quality.travelRatio === null
                  ? "Nicht gemessen"
                  : `${Math.round(quality.travelRatio * 100)} %`}
              </dd>
            </div>
            <div>
              <dt>Zusätzliche Ausrückezeit</dt>
              <dd>
                {quality.turnoutDelay === null
                  ? "Nicht gemessen"
                  : duration(quality.turnoutDelay)}
              </dd>
            </div>
            <div>
              <dt>Laufende Eskalationen</dt>
              <dd>{quality.escalations}</dd>
            </div>
            <div>
              <dt>Nachforderungen</dt>
              <dd>{quality.requests}</dd>
            </div>
            <div>
              <dt>Zusätzliche Reservefahrzeuge</dt>
              <dd>{quality.reserveUnits}</dd>
            </div>
            <div>
              <dt>Gemessene Fahrzeugbindung</dt>
              <dd>{quality.unitMinutes.toFixed(1)} Fahrzeugminuten</dd>
            </div>
            <div>
              <dt>Einsatzdauer</dt>
              <dd>{duration(quality.duration)}</dd>
            </div>
          </dl>
          <p className="report-note">
            Fahrzeiten werden mit ihrer eigenen Planung verglichen. Notwendige
            Nachforderungen und von Anfang an große Lagen erhalten keinen
            pauschalen Abzug. Reservefahrzeuge werden zur Bewertung deiner
            Disposition ausgewiesen; taktisch sinnvolle Reserven bleiben deine
            Entscheidung.
          </p>
        </>
      )}
    </section>
  );
}
