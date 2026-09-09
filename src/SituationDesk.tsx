import { useState } from "react";
import type { Save, Mission } from "./model";
import { useNetwork } from "./network";
import { command, useGame } from "./store";
import { useCommandForm } from "./use-command-form";
import { requestDialogTransition } from "./dialog-state";
import { RequestCard } from "./NeighborDesk";
import { OperationsOverview } from "./Major";
import { missionPresentation } from "./mission-presentation";
import { visiblePriority, priorityRank } from "./simulation/priority";
import { duration } from "./travel";
import "./RadioDesk.css";

function SituationNotes({
  m,
  onInteract,
}: {
  m: Mission;
  onInteract: () => void;
}) {
  const { readonly, workspace } = useGame();
  const [text, setText] = useState("");
  const form = useCommandForm(!!text.trim(), () => setText(""));
  const notes =
    m.control?.events.filter((e) => e.type === "SITUATION_NOTE") ?? [];
  return (
    <section aria-label="Lagebuch">
      <h3>Lagebuch · {missionPresentation(m).name}</h3>
      <p>
        Gemeinsame Arbeitsnotizen deiner Leitstelle. Erkenntnisse und Aufträge
        bleiben im Einsatzarchiv nachvollziehbar. Notizen lösen keine
        Alarmierung aus.
      </p>
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <fieldset
        className="command-fields"
        disabled={
          readonly ||
          form.busy ||
          !m.control?.locationKnown ||
          !m.control.reportedTemplate
        }
      >
        <label>
          Lagenotiz
          <textarea
            aria-label="Lagenotiz"
            readOnly={m.phase === "done"}
            maxLength={600}
            value={text}
            onChange={(e) => {
              onInteract();
              setText(e.target.value);
            }}
          />
        </label>
        <button
          disabled={m.phase === "done" || text.trim().length < 3}
          onClick={() =>
            void form.run(async () => {
              await command({ type: "mission-note", mission: m.id, text });
              setText("");
            })
          }
        >
          Notiz im Lagebuch speichern
        </button>
      </fieldset>
      {(!m.control?.locationKnown || !m.control.reportedTemplate) && (
        <p>Zuerst Ort und Meldebild im Notruf erfragen.</p>
      )}
      {m.phase === "done" && (
        <p>
          Einsatz abgeschlossen. Ein offener Entwurf bleibt zum Kopieren
          sichtbar; neue Einträge sind gesperrt.
        </p>
      )}
      {!notes.length && <p>Noch keine Lagenotizen.</p>}
      <ol>
        {[...notes].reverse().map((e) => (
          <li key={e.id}>
            <small>
              {new Date(e.at * 1000).toLocaleString("de-DE")} ·{" "}
              {workspace?.members.find((u) => u.id === e.actor)?.name ??
                e.actor}
            </small>
            <p>{e.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SituationDesk({
  s,
  onOpen,
  onPanel,
}: {
  s: Save;
  onOpen: (id: string) => void;
  onPanel: (id: string) => void;
}) {
  const net = useNetwork();
  const [selected, setSelected] = useState("");
  const [view, setView] = useState("own");
  const [history, setHistory] = useState(false);
  const missions = [...s.missions].sort(
    (a, b) =>
      priorityRank(b.control?.priority) - priorityRank(a.control?.priority) ||
      a.created - b.created,
  );
  const current =
    missions.find((m) => m.id === selected) ??
    s.archive.find((m) => m.id === selected) ??
    missions[0];
  const requests = net.requests.filter(
    (r) =>
      history || ["DRAFT", "SENT", "ACCEPTED", "IN_PROGRESS"].includes(r.state),
  );
  return (
    <section className="radio-workspace" aria-label="Gemeinsame Einsatzlagen">
      <p>
        Eigene Einsätze sind für berechtigte Disponenten dieser Leitstelle
        gemeinsam bearbeitbar. Andere Leitstellen sehen ausschließlich
        ausdrücklich angefragte Hilfe und die dafür freigegebenen Kräfte.
      </p>
      <div className="action-grid">
        <button
          aria-pressed={view === "own"}
          onClick={() => requestDialogTransition(() => setView("own"))}
        >
          Eigene Lage
        </button>
        <button
          aria-pressed={view === "aid"}
          onClick={() => requestDialogTransition(() => setView("aid"))}
        >
          Gemeinsame Hilfe
        </button>
        <button
          aria-pressed={view === "major"}
          onClick={() => requestDialogTransition(() => setView("major"))}
        >
          Groß- und Flächenlagen
        </button>
        <button onClick={() => onPanel("civil")}>
          Katastrophenbereitschaft öffnen
        </button>
      </div>
      {view === "own" && (
        <div className="radio-columns">
          <div className="radio-list" aria-label="Lageübersicht">
            {!missions.length && (
              <p>
                Keine laufenden Einsätze. Der nächste Notruf kommt zeitlich
                versetzt.
              </p>
            )}
            {missions.map((m) => {
              const units = [
                ...s.vehicles.filter((v) => v.mission === m.id),
                ...net.support
                  .filter((f) => f.mission === m.id && f.round === m.round)
                  .map((f) => f.vehicle),
              ];
              return (
                <button
                  className="radio-row"
                  key={m.id}
                  aria-pressed={current?.id === m.id}
                  onClick={() =>
                    requestDialogTransition(() => setSelected(m.id))
                  }
                >
                  <strong>{missionPresentation(m).name}</strong>
                  <span>
                    {visiblePriority(m.control?.priority)} · seit{" "}
                    {duration(s.time - m.created)}
                  </span>
                  <small>
                    {units.filter((v) => v.status === "scene").length} vor Ort ·{" "}
                    {
                      units.filter(
                        (v) => v.status === "alarmed" || v.status === "travel",
                      ).length
                    }{" "}
                    auf Anfahrt ·{" "}
                    {m.control?.radio.filter((r) => r.state === "open")
                      .length ?? 0}{" "}
                    Sprechwünsche
                  </small>
                </button>
              );
            })}
          </div>
          {current && (
            <div className="radio-conversation">
              <button onClick={() => onOpen(current.id)}>
                Einsatzführung öffnen
              </button>
              <SituationNotes
                key={current.id}
                m={current}
                onInteract={() => setSelected(current.id)}
              />
            </div>
          )}
        </div>
      )}
      {view === "aid" && (
        <>
          <button onClick={() => onPanel("friends")}>
            Neue Unterstützungsanfrage stellen
          </button>
          <label>
            <input
              type="checkbox"
              checked={history}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                requestDialogTransition(() => setHistory(checked));
              }}
            />
            Abgeschlossene Anfragen anzeigen
          </label>
          {!requests.length && <p>Keine passenden Unterstützungsanfragen.</p>}
          {requests.map((r) => (
            <RequestCard key={`${r.owner}:${r.id}`} r={r} />
          ))}
        </>
      )}
      {view === "major" && (
        <>
          {!s.operations.campaign &&
            !s.operations.history.length &&
            !s.missions.some((m) => m.major) && (
              <p>
                Keine Groß- oder Flächenlage. Geeignete erkundete Einsätze
                lassen sich in der Einsatzführung zur Großlage erklären.
              </p>
            )}
          <OperationsOverview s={s} open={onOpen} />
        </>
      )}
    </section>
  );
}
