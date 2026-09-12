import type { Save, Mission } from "./model";
import { useNetwork } from "./network";
import { missionProgress } from "./mission-presentation";
import { visiblePriority } from "./simulation/priority";
import { RadioRequestActions } from "./RadioRequest";
import { IncidentUnits } from "./IncidentUnits";
import { FireLiveStatus } from "./FireLiveStatus";
import { DynamicsPanel } from "./Dynamics";
import { History } from "./IncidentHistory";
import { statuses } from "./ui";
import { tripLabel } from "./travel";
export function IncidentOperations({ s, m }: { s: Save; m: Mission }) {
  const c = m.control!;
  const net = useNetwork();
  const support = net.support.filter(
    (f) => f.mission === m.id && f.round === m.round,
  );
  const progress = missionProgress(m);
  return (
    <section className="incident-operations" aria-label="Laufender Einsatz">
      {c.radio.some((r) => r.state === "open") && (
        <section className="radio-queue" data-hud-section="radio">
          <h3>Sprechwünsche und Lagemeldungen</h3>
          {c.radio
            .filter((r) => r.state === "open")
            .map((r) => (
              <article key={r.id}>
                <b>
                  {visiblePriority(r.priority)} ·{" "}
                  {s.vehicles.find((v) => v.id === r.vehicle)?.name ||
                    support.find((f) => f.vehicle.id === r.vehicle)?.vehicle
                      .name}
                </b>
                <p>{r.details}</p>
                <RadioRequestActions s={s} m={m} r={r} />
              </article>
            ))}
        </section>
      )}

      <section data-hud-section="arrival">
        <h3>Eingesetzte Fahrzeuge</h3>
        {support.map((f) => (
          <p key={f.assignment}>
            <b>{f.vehicle.name} · Nachbarleitstelle</b> ·{" "}
            {statuses[f.vehicle.status]} · {tripLabel(f.vehicle, s.time)}
          </p>
        ))}
        <IncidentUnits
          key={m.id}
          s={s}
          m={m}
          remoteUnits={support.map((f) => f.vehicle)}
        />
        {progress ? (
          <>
            <progress
              value={progress.value}
              max={progress.max}
              aria-label={progress.label}
            />
            <small>{progress.label}</small>
          </>
        ) : (
          <small>Weitere Angaben nach der ersten Erkundung</small>
        )}
      </section>

      <section aria-label="Erkundete Lage und Einsatzmaßnahmen">
        <FireLiveStatus m={m} reduced={s.settings.reduced} />
        <DynamicsPanel s={s} m={m} />
      </section>
      <History s={s} m={m} />
    </section>
  );
}
