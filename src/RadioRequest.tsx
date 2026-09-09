import type { Mission, Save } from "./model";
import { command, useGame } from "./store";
import { useCommandForm } from "./use-command-form";
import { radioHandler, type RadioRequest } from "./simulation/radio-state";
import { duration } from "./travel";

export function RadioRequestActions({
  s,
  m,
  r,
  onInteract,
}: {
  s: Save;
  m: Mission;
  r: RadioRequest;
  onInteract?: () => void;
}) {
  const { user, workspace, readonly } = useGame();
  const form = useCommandForm();
  const handler = radioHandler(r, s.time);
  const mine = handler?.actor === user?.id;
  const blocked = !!handler && !mine;
  const firstReport = r.reason === "arrival" && !m.control?.briefed;
  const name = (id: string) =>
    id === user?.id
      ? "dir"
      : (workspace?.members.find((member) => member.id === id)?.name ??
        "einem Disponenten");
  const send = (
    op: "claim" | "release" | "report" | "question" | "request" | "close",
  ) => {
    onInteract?.();
    void form.run(() =>
      command({ type: "radio", mission: m.id, id: r.id, op }),
    );
  };
  return (
    <div className="radio-request-actions">
      <p className="radio-assignment" role="status">
        {r.state === "handled"
          ? `Erledigt${r.handledBy ? ` von ${name(r.handledBy)}` : ""}`
          : handler
            ? `In Bearbeitung bei ${name(handler.actor)} · noch ${duration(Math.max(0, handler.until - s.time))}`
            : "Offen · zur Übernahme verfügbar"}
      </p>
      {r.answer && <p className="radio-answer">{r.answer}</p>}
      {form.error && (
        <p role="alert" className="error">
          {form.error}
        </p>
      )}
      {r.state === "open" && (
        <fieldset disabled={readonly || form.busy || blocked}>
          <div className="inline">
            <button onClick={() => send(mine ? "release" : "claim")}>
              {mine ? "Bearbeitung freigeben" : "Sprechwunsch übernehmen"}
            </button>
            {r.reason === "arrival" && (
              <button className="primary" onClick={() => send("report")}>
                Lagemeldung aufnehmen
              </button>
            )}
            <button
              disabled={firstReport || r.questioned}
              onClick={() => send("question")}
            >
              Rückfrage zur Lage
            </button>
            <button disabled={firstReport} onClick={() => send("request")}>
              Nachforderung bearbeiten
            </button>
            <button disabled={firstReport} onClick={() => send("close")}>
              Sprechwunsch erledigen
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
