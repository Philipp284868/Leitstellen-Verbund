import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Flame,
  Check,
} from "lucide-react";
import type { Mission } from "./model";
import { missionPresentation } from "./mission-presentation";
import { fireFeedback } from "./simulation/fire";
import "./IncidentFeedback.css";

const labels = {
  spreading: "Brand breitet sich aus",
  stable: "Brandlage stabil",
  receding: "Brand wird zurückgedrängt",
  controlled: "Feuer unter Kontrolle",
  extinguished: "Feuer gelöscht",
  aftercare: "Feuer gelöscht · Nacharbeiten",
};
export function FireLiveStatus({
  m,
  reduced,
}: {
  m: Mission;
  reduced: boolean;
}) {
  const known = missionPresentation(m);
  const feedback = fireFeedback(m);
  if (!feedback && (known.category !== "fire" || known.confirmed)) return null;
  if (!feedback)
    return (
      <section className="fire-live unknown" aria-label="Brandentwicklung">
        <Flame size={18} />
        <div>
          <strong>Brandverdacht</strong>
          <small>Erkundung ausstehend · noch keine bestätigten Messwerte</small>
        </div>
      </section>
    );
  const Trend =
    feedback.trend === "rising"
      ? ArrowUpRight
      : feedback.trend === "falling"
        ? ArrowDownRight
        : Minus;
  const ended =
    feedback.state === "extinguished" || feedback.state === "aftercare";
  return (
    <section
      className={`fire-live ${reduced ? "reduced" : ""}`}
      data-state={feedback.state}
      aria-label="Brandentwicklung"
      data-testid="fire-live"
    >
      <header>
        <span>{ended ? <Check size={20} /> : <Flame size={20} />}</span>
        <div>
          <small>BESTÄTIGTE BRANDLAGE</small>
          <strong>{labels[feedback.state]}</strong>
        </div>
        <Trend
          size={22}
          aria-label={
            feedback.trend === "rising"
              ? "Zunehmend"
              : feedback.trend === "falling"
                ? "Abnehmend"
                : "Gleichbleibend"
          }
        />
      </header>
      <div className="fire-meters">
        <label>
          Brandintensität <b>{Math.round(feedback.intensity)} %</b>
          <progress
            aria-label="Brandintensität"
            max={100}
            value={feedback.intensity}
          />
        </label>
        <label>
          Löschfortschritt <b>{Math.round(feedback.suppression)} %</b>
          <progress
            className="suppression"
            aria-label="Löschfortschritt"
            max={100}
            value={feedback.suppression}
          />
        </label>
      </div>
      {feedback.residualTasks.length > 0 && (
        <small className="fire-residual">
          Noch offen: {feedback.residualTasks.join(" · ")}
        </small>
      )}
    </section>
  );
}
