import { useState } from "react";
import type { Save, Mission } from "./model";
import { useGame, command } from "./store";
import { useCommandForm } from "./use-command-form";
import { duration } from "./travel";
import { Disclosure } from "./ui";
import {
  questionLabels,
  questionsFor,
  type Question,
} from "./simulation/calls";
export function CallConversation({
  s,
  m,
  callId,
  onSelect,
}: {
  s: Save;
  m: Mission;
  callId?: string;
  onSelect?: (id: string) => void;
}) {
  const { user, readonly, workspace } = useGame(),
    c = m.control!;
  const [selected, setSelected] = useState(
    c.calls.find((c) => c.state !== "ended")?.id ?? c.calls[0]?.id,
  );
  const form = useCommandForm();
  const current = callId ?? selected;
  const call = c.calls.find((x) => x.id === current);
  if (!call) return null;
  const run = (operation: () => Promise<unknown>) => {
    onSelect?.(call.id);
    return form.run(operation);
  };
  const own = call.actor === user?.id;
  const waiting = Math.max(0, call.nextAnswer - s.time);
  return (
    <section
      className="call-conversation"
      aria-label="Notrufgespräch"
      data-tutorial="call"
    >
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <fieldset className="command-fields" disabled={form.busy || readonly}>
        <h3>Notrufgespräch</h3>
        <div className="inline">
          {c.calls.map((x, i) => (
            <button
              key={x.id}
              aria-pressed={current === x.id}
              onClick={() => {
                setSelected(x.id);
                onSelect?.(x.id);
              }}
            >
              Anruf {i + 1} ·{" "}
              {x.state === "ringing"
                ? "wartet"
                : x.state === "active"
                  ? "aktiv"
                  : x.state === "dropped"
                    ? "abgebrochen"
                    : "beendet"}
            </button>
          ))}
        </div>
        <p>
          {call.caller} · {call.noise} · Gesprächsdauer{" "}
          {duration(
            call.duration +
              (call.state === "active" ? s.time - call.started : 0),
          )}
        </p>
        <Disclosure title="Gesprächsdetails">
          <div className="call-properties">
            <span>Stress {call.stress}%</span>
            <span>Informationsqualität {call.quality}%</span>
            <span>Glaubwürdigkeit {call.credibility}%</span>
            <span>Rückruf {call.callback ? "möglich" : "nicht möglich"}</span>
          </div>
        </Disclosure>
        {call.state === "ringing" && (
          <button
            className="primary"
            onClick={() =>
              void run(() =>
                command({
                  type: "call",
                  mission: m.id,
                  call: call.id,
                  op: "accept",
                }),
              )
            }
          >
            Notruf annehmen
          </button>
        )}
        {(call.state === "dropped" ||
          (call.state === "ended" &&
            (!c.locationKnown || !c.reportedTemplate))) &&
          call.callback && (
            <button
              onClick={() =>
                void run(() =>
                  command({
                    type: "call",
                    mission: m.id,
                    call: call.id,
                    op: "callback",
                  }),
                )
              }
            >
              Anrufer zurückrufen
            </button>
          )}
        {call.state === "active" && !own && (
          <p>
            {workspace?.members.find((u) => u.id === call.actor)?.name ??
              "Ein anderer Disponent"}{" "}
            bearbeitet das Gespräch.{" "}
            <button
              disabled={s.time - Math.max(call.started, call.nextAnswer) < 60}
              onClick={() =>
                void run(() =>
                  command({
                    type: "call",
                    mission: m.id,
                    call: call.id,
                    op: "accept",
                  }),
                )
              }
            >
              Nach 60 Sekunden ohne Bearbeitung übernehmen
            </button>
          </p>
        )}
        {call.state === "active" && own && (
          <>
            <div className="question-grid">
              {(Object.keys(questionLabels) as Question[])
                .filter(
                  (q) =>
                    ["address", "report", "calm"].includes(q) ||
                    call.asked.includes("report"),
                )
                .map((q) => (
                  <button
                    key={q}
                    disabled={call.asked.includes(q) || waiting > 0}
                    onClick={() =>
                      void run(() =>
                        command({
                          type: "call",
                          mission: m.id,
                          call: call.id,
                          op: "ask",
                          question: q,
                        }),
                      )
                    }
                  >
                    {call.asked.includes(q) ? "✓ " : ""}
                    {questionsFor(m)[q]}
                  </button>
                ))}
            </div>
            {waiting > 0 && (
              <small>
                Antwort aufnehmen · nächste Frage in {duration(waiting)}
              </small>
            )}
            <button
              onClick={() =>
                void run(() =>
                  command({
                    type: "call",
                    mission: m.id,
                    call: call.id,
                    op: "handoff",
                  }),
                )
              }
            >
              Gespräch zur Übernahme freigeben
            </button>
            <button
              onClick={() =>
                void run(() =>
                  command({
                    type: "call",
                    mission: m.id,
                    call: call.id,
                    op: "end",
                  }),
                )
              }
            >
              Gespräch beenden
            </button>
          </>
        )}
      </fieldset>
    </section>
  );
}
