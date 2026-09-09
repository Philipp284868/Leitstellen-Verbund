import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronRight, Minimize2 } from "lucide-react";
import { useGame, tutorialControl, trainingControl, emit } from "./store";
import { tutorialChapters, type TutorialProgress } from "./tutorial-model";
import { useDevicePreferences } from "./device-preferences";
import { ActionButton, ConfirmAction } from "./ui";
import "./Tutorial.css";

export function tutorialInteraction(kind: TutorialProgress["ui"][number]) {
  window.dispatchEvent(new CustomEvent("lv:tutorial-ui", { detail: { kind } }));
}
export function TutorialEvents() {
  const { tutorial, user, readonly, save } = useGame();
  const sent = useRef(new Set<string>());
  const chapter = tutorial?.progress.chapter,
    active = tutorial?.progress.state === "active";
  useEffect(() => {
    sent.current.clear();
  }, [chapter, user?.id, active, save?.generation]);
  useEffect(() => {
    if (!active || readonly) return;
    const receive = (event: Event) => {
      const kind = (event as CustomEvent).detail?.kind;
      if (typeof kind !== "string" || sent.current.has(kind)) return;
      sent.current.add(kind);
      void tutorialControl({ op: "ui", kind }).catch((error) => {
        sent.current.delete(kind);
        emit({ error: String(error) });
      });
    };
    window.addEventListener("lv:tutorial-ui", receive);
    return () => window.removeEventListener("lv:tutorial-ui", receive);
  }, [active, readonly, chapter, save?.generation]);
  return null;
}
export function TutorialHome({ onEnter }: { onEnter: () => void }) {
  const { tutorial, training, readonly } = useGame();
  const progress = tutorial?.progress;
  return (
    <section className="tutorial-home">
      <p className="view-intro">
        Vom ersten Standort bis zur Abschlussmeldung: Du bedienst die echten
        Spielansichten. Jeder operative Schritt wird am bestätigten Serverstand
        geprüft. Vorhandene passende Gebäude und Fahrzeuge werden anerkannt.
      </p>
      <div className="comparison-grid">
        <article>
          <span className="eyebrow">Deine Leitstelle</span>
          <h3>Im bestehenden Spiel lernen</h3>
          <p>
            Eigener Besitz und vorhandener Fortschritt bleiben erhalten. Käufe
            kosten echtes Spielbudget und verlangen eine ausdrückliche
            Bestätigung.
          </p>
          <ActionButton
            className="primary"
            disabled={readonly}
            action={async () => {
              if (training) await trainingControl({ op: "stop" });
              await tutorialControl({ op: "start" });
              onEnter();
            }}
          >
            {progress?.state === "active" || progress?.state === "skipped"
              ? "Einführung fortsetzen"
              : "Einführung beginnen"}
          </ActionButton>
        </article>
        <article>
          <span className="eyebrow">Persönlicher Übungsstand</span>
          <h3>Ohne Folgen üben</h3>
          <p>
            Eine getrennte Serverübung mit 1.400.000,00 € Übungsbudget und Stufe
            2. Sie verwendet dieselben Regeln, Straßenrouten, Wachen, Fahrzeuge,
            Notrufe und Funkabläufe. Deine echte Leitstelle läuft weiter.
          </p>
          <ActionButton
            className="primary"
            disabled={readonly}
            action={async () => {
              await trainingControl({ op: "start" });
              onEnter();
            }}
          >
            {training
              ? "Zur laufenden Übung"
              : "Serverübung starten / fortsetzen"}
          </ActionButton>
          <p>
            Übungsvergütung und Übungs-XP werden niemals dem echten Konto
            gutgeschrieben.
          </p>
          <ConfirmAction
            disabled={readonly}
            message="Den persönlichen Übungsstand neu beginnen? Nur dessen Lernfahrzeuge und Übungseinsätze werden ersetzt; deine echte Leitstelle bleibt erhalten."
            onConfirm={async () => {
              await trainingControl({ op: "start", reset: true });
              onEnter();
            }}
          >
            Übung neu beginnen
          </ConfirmAction>
        </article>
      </div>
      <h3>Dein Lernweg</h3>
      <ol className="tutorial-chapters">
        {tutorialChapters.map((chapter, i) => (
          <li
            key={chapter.kind}
            data-complete={progress?.completed.includes(i)}
          >
            <span>{progress?.completed.includes(i) ? "✓" : i + 1}</span>
            <div>
              <strong>{chapter.title}</strong>
              <small>{chapter.text}</small>
            </div>
          </li>
        ))}
      </ol>
      <p>
        Fortschritt wird pro Benutzer auf dem Server gespeichert. Überspringen
        und späteres Fortsetzen sind jederzeit möglich. Ein Verbindungsabbruch
        beendet die Übung nicht.
      </p>
    </section>
  );
}
export function TutorialCoach({
  onOpen,
  onOverview,
}: {
  onOpen: (panel: string) => void;
  onOverview: () => void;
}) {
  const { tutorial, training, readonly } = useGame(),
    preferences = useDevicePreferences();
  const [compact, setCompact] = useState(false);
  const progress = tutorial?.progress,
    chapter = tutorialChapters[progress?.chapter ?? 0];
  useEffect(() => {
    if (progress?.state !== "active" || !preferences.tutorialHints) return;
    const highlight = () => {
      document
        .querySelectorAll(".tutorial-target")
        .forEach((el) => el.classList.remove("tutorial-target"));
      document
        .querySelectorAll(`[data-tutorial="${chapter.target}"]`)
        .forEach((el) => el.classList.add("tutorial-target"));
    };
    highlight();
    const observer = new MutationObserver(highlight);
    observer.observe(document.querySelector(".app") ?? document.body, {
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      document
        .querySelectorAll(".tutorial-target")
        .forEach((el) => el.classList.remove("tutorial-target"));
    };
  }, [chapter.target, progress?.state, preferences.tutorialHints]);
  if (
    (!progress || progress.state !== "active" || !preferences.tutorialHints) &&
    !training
  )
    return null;
  return (
    <aside
      className={`tutorial-coach ${compact ? "is-compact" : ""}`}
      aria-label={training ? "Persönliche Serverübung" : "Tutorial"}
    >
      <header>
        <BookOpen size={18} />
        <strong>
          {training ? "Übungsstand · getrenntes Budget" : "Dein Einstieg"}
        </strong>
        <button
          aria-label={compact ? "Tutorial aufklappen" : "Tutorial verkleinern"}
          onClick={() => setCompact(!compact)}
        >
          <Minimize2 size={16} />
        </button>
      </header>
      {!compact && (
        <>
          {progress?.state === "active" && preferences.tutorialHints ? (
            <>
              <small>
                Kapitel {progress.chapter + 1} / {tutorialChapters.length}
              </small>
              <h3>{chapter.title}</h3>
              <p>{chapter.text}</p>
              {chapter.kind === "orientation" && (
                <p className="tutorial-evidence">
                  {["pan", "zoom", "search"].map((kind, i) => (
                    <span key={kind}>
                      {progress.ui.includes(
                        kind as TutorialProgress["ui"][number],
                      )
                        ? "✓"
                        : "○"}{" "}
                      {["Verschieben", "Zoomen", "Suchen"][i]}
                    </span>
                  ))}
                </p>
              )}
              <div className="inline">
                <button onClick={() => onOpen(chapter.panel)}>
                  Bereich öffnen
                </button>
                <ActionButton
                  disabled={readonly || !tutorial?.ready}
                  className="primary"
                  action={() =>
                    tutorialControl({ op: "next", chapter: progress.chapter })
                  }
                >
                  Weiter <ChevronRight size={14} />
                </ActionButton>
              </div>
              <p className="tutorial-status" role="status">
                {tutorial?.ready
                  ? "Schritt bestätigt – du kannst fortfahren."
                  : "Bediene den gezeigten Bereich. Der bestätigte Fortschritt erscheint hier."}
              </p>
              {training && ["call", "fire"].includes(chapter.kind) && (
                <ActionButton
                  disabled={readonly}
                  action={() =>
                    trainingControl({
                      op: "scenario",
                      kind: chapter.kind === "fire" ? "fire" : "technical",
                      session: training.session,
                    })
                  }
                >
                  {chapter.kind === "fire"
                    ? "Brandübung mit Nachforderung anfordern"
                    : "Technischen Übungsnotruf anfordern"}
                </ActionButton>
              )}
              <button
                className="quiet"
                onClick={() =>
                  void tutorialControl({ op: "skip" }).catch((error) =>
                    emit({ error: String(error) }),
                  )
                }
              >
                Später fortsetzen
              </button>
            </>
          ) : (
            <p>
              {progress?.state === "complete"
                ? "Lernweg abgeschlossen. Du kannst die Übung weiter verwenden oder zu deiner echten Leitstelle zurückkehren."
                : "Du befindest dich weiterhin im persönlichen Übungsstand."}
            </p>
          )}
          <div className="tutorial-footer">
            <button onClick={onOverview}>Lernweg & Hilfe</button>
            {training && (
              <ActionButton
                disabled={readonly}
                action={() => trainingControl({ op: "stop" })}
              >
                Zur echten Leitstelle
              </ActionButton>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
