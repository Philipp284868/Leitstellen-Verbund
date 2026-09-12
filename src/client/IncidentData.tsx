import type { Save, Mission } from "../shared/model";
import { useGame, command } from "./store";
import { useNetwork } from "./network";
import { useCommandForm } from "./use-command-form";
import { missionPresentation } from "./mission-presentation";
import { missionStatus } from "../simulation/mission-status";
import { priorities, visiblePriority } from "../simulation/priority";
import type { Priority } from "../simulation/schema";
import { duration } from "../shared/travel";

export function IncidentData({
  s,
  m,
  callId,
}: {
  s: Save;
  m: Mission;
  callId?: string;
}) {
  const { readonly } = useGame();
  const net = useNetwork();
  const form = useCommandForm();
  const c = m.control!,
    presentation = missionPresentation(m),
    processing = missionStatus(s, m, net.support);
  return (
    <section
      className="call-data known-facts"
      aria-label="Bekannte Einsatzdaten"
    >
      <h3>{presentation.name}</h3>
      <p>
        {c.briefed
          ? "Durch Erkundung bestätigt"
          : c.reportedTemplate
            ? "Vorläufige Einordnung aus Anruferangaben"
            : "Meldebild noch offen"}
      </p>
      <strong data-processing={processing.code}>{processing.label}</strong>
      <p className={processing.attention ? "warning" : "muted"}>
        {processing.detail}
      </p>
      <p>
        Seit {duration(Math.max(0, s.time - m.created))} offen · Einsatz{" "}
        {m.id.slice(-8)}
      </p>
      <p>
        {m.location?.state === "repair-pending"
          ? "Zufahrt wird technisch geprüft"
          : c.locationKnown
            ? "Anfahrtspunkt bestimmt"
            : "Ort noch unklar – Standort erfragen"}
      </p>
      {m.location && c.locationKnown && (
        <details>
          <summary>Orts- und Fahrzeitnachweis</summary>
          <p>{m.location.reason}</p>
          <p>
            {m.location.state === "verified"
              ? `Reine Straßenfahrt der Bezugwache: ${duration(m.location.driveSeconds)}. Ausrückezeit wird zusätzlich je Fahrzeug angezeigt.`
              : "Die technische Prüfung ist noch offen."}
          </p>
          <small>
            Datenstand: {m.location.dataset}
            <br />
            Objekt: {m.location.siteRef}
            <br />
            Zufahrt: {m.location.roadRef}
          </small>
        </details>
      )}
      {c.locationKnown && (
        <button
          disabled={
            readonly || form.busy || m.location?.state === "repair-pending"
          }
          onClick={() =>
            void form.run(() =>
              command({ type: "mission-location-review", mission: m.id }),
            )
          }
        >
          Zufahrt technisch prüfen
        </button>
      )}
      {c.locationKnown && (
        <label>
          Dispositionspriorität
          <select
            aria-label="Dispositionspriorität"
            disabled={readonly || form.busy}
            value={visiblePriority(c.priority)}
            onChange={(e) =>
              void form.run(() =>
                command({
                  type: "mission-priority",
                  mission: m.id,
                  priority: e.target.value as Priority,
                }),
              )
            }
          >
            {priorities.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      )}
      {form.error && (
        <p role="alert" className="error">
          {form.error}
        </p>
      )}
      {!c.facts.length && <p>Noch keine Angaben erfragt.</p>}
      {c.facts.map((fact, i) => (
        <p className="radio-message" key={i}>
          {fact.text}
          <br />
          <small>
            {fact.confidence} ·{" "}
            {fact.source === callId
              ? "Dieses Gespräch"
              : fact.source === "recon"
                ? "Erkundung"
                : "Weitere Quelle"}
          </small>
        </p>
      ))}
    </section>
  );
}
