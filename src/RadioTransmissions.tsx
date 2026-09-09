import { useState } from "react";
import type { Save } from "./model";
import { audio, useSound } from "./audio/controller";
import { localGermanVoice } from "./audio/speech";
import { duration } from "./travel";
import { compareTransmissions } from "./simulation/transmissions";

const labels = {
  queued: "Wartet auf Kanal",
  transmitting: "Wird übertragen",
  delivered: "Übertragen",
  missed: "Nur im Verlauf",
};
export function RadioTransmissions({ s }: { s: Save }) {
  const [history, setHistory] = useState(false);
  const sound = useSound();
  const entries = s.radioNetwork?.entries ?? [];
  const pending = entries
    .filter((e) => e.state === "queued" || e.state === "transmitting")
    .sort((a, b) => compareTransmissions(a, b, s.time));
  const shown = history ? [...entries].reverse().slice(0, 100) : pending;
  return (
    <section className="radio-transmissions" aria-label="Funkübertragungen">
      <h3>Funkübertragungen · {pending.length} aktiv oder wartend</h3>
      <p>
        {sound.queuedVoices} Meldungen warten an diesem Arbeitsplatz.{" "}
        {localGermanVoice()
          ? "Lokale deutsche Sprachausgabe verfügbar."
          : "Funksignal und Text; keine lokale deutsche Stimme verfügbar."}
      </p>
      <button aria-pressed={history} onClick={() => setHistory(!history)}>
        {history
          ? "Aktuelle Warteschlange anzeigen"
          : "Übertragungsverlauf anzeigen"}
      </button>
      {!shown.length && <p>Der Funkkanal ist frei.</p>}
      <div className="transmission-list">
        {shown.map((entry) => (
          <article
            key={entry.id}
            data-priority={entry.priority >= 100 ? "NOTFALL" : "NORMAL"}
          >
            <b>{entry.sender}</b> · {entry.channel} · {labels[entry.state]} ·{" "}
            {duration(Math.max(0, s.time - entry.created))}
            <p>{entry.text}</p>
            {(entry.interrupted || sound.interrupted.includes(entry.id)) && (
              <p>Durch Notfall unterbrochen; Meldung bleibt erneut abrufbar.</p>
            )}
            <details>
              <summary>Zustandsverlauf</summary>
              <ol>
                {entry.history.map((h, index) => (
                  <li key={index}>
                    {labels[h.state]} · {h.reason}
                  </li>
                ))}
              </ol>
              <small>Übertragung {entry.id}</small>
            </details>
            <button
              disabled={sound.status !== "playing"}
              onClick={() =>
                audio.cue("radioOpen", {
                  id: `replay:${entry.id}:${crypto.randomUUID()}`,
                  radio: entry.channel,
                  text: `${entry.sender}. ${entry.text}`,
                })
              }
            >
              Meldung erneut hören
            </button>
          </article>
        ))}
      </div>
      <p className="muted">
        Übertragung erfolgt unabhängig vom Browser. Der Verlauf enthält bis zu
        2.000 Meldungen; hier werden die letzten 100 angezeigt. FMS und
        Einsatzfortschritt warten nicht auf die Sprachausgabe.
      </p>
    </section>
  );
}
