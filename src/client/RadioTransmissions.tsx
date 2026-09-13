import type { Save } from "../shared/model";
export function RadioTransmissions({ s }: { s: Save }) {
  return (
    <section className="radio-transmissions">
      <h3>Textfunk</h3>
      {(s.radioNetwork?.entries ?? [])
        .filter((e) => e.state !== "queued" && !e.supersededBy)
        .slice(-100)
        .reverse()
        .map((e) => (
          <article key={e.id}>
            <b>{e.sender}</b>
            <p>{e.text}</p>
            {e.unresolved && (
              <small>Offene Anliegen in den Einsatzdetails bearbeiten.</small>
            )}
            {e.consolidated &&
              (() => {
                const m = [...s.missions, ...s.archive].find(
                  (m) => m.control?.radioSummary?.id === e.id,
                );
                if (!m?.control) return null;
                return (
                  <details>
                    <summary>Vollständiger Einsatzfunkverlauf</summary>
                    {m.control.events
                      .filter((event) =>
                        /^(SPEAK_|REPORT_|RADIO_|REINFORCEMENT_|MISSION_|PATIENT_|FAULT_|WATER_|FMS_|AID_FMS|VEHICLE_(BREAKDOWN|REPAIRED)|TURNOUT_FAILED)/.test(
                          event.type,
                        ),
                      )
                      .map((event) => (
                        <p key={event.id}>
                          <time>
                            {new Date(event.at * 1000).toLocaleTimeString(
                              "de-DE",
                            )}
                          </time>{" "}
                          · {event.text}
                        </p>
                      ))}
                  </details>
                );
              })()}
          </article>
        ))}
    </section>
  );
}
