import { useMemo, useState } from "react";
import type { Save, Mission, Vehicle } from "../shared/model";
import type { Skills } from "../shared/catalog";
import { capabilities } from "../shared/catalog";
import { VehicleIcon } from "../shared/map-icons";
import { createWithdrawalAssessment } from "../simulation/withdrawal";
import { effectiveSkills } from "../simulation/major-resources";
import { operativeCode } from "../simulation/fms";
import { duration, tripLabel } from "../shared/travel";
import { ConfirmAction, statuses } from "./ui";
import { act } from "./store";
import "./IncidentFeedback.css";

export function IncidentUnits({
  s,
  m,
  remoteUnits,
}: {
  s: Save;
  m: Mission;
  remoteUnits: Vehicle[];
}) {
  const [selection, setSelection] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const vehicles = s.vehicles.filter((v) => v.mission === m.id);
  const selected = selection.filter((id) => vehicles.some((v) => v.id === id));
  const assess = useMemo(() => {
    const remote: Skills = {};
    for (const v of remoteUnits.filter(
      (v) => v.status === "scene" && v.arrive <= s.time,
    ))
      for (const [key, n] of Object.entries(effectiveSkills(m, v)))
        remote[key] = (remote[key] || 0) + n;
    return createWithdrawalAssessment(s, m, remote, remoteUnits);
  }, [s, m, remoteUnits]);
  const assessment = assess(selected);
  const pages = Math.max(1, Math.ceil(vehicles.length / 25));
  const currentPage = Math.min(page, pages - 1);
  return (
    <div className="incident-units" data-testid="incident-units">
      {vehicles.length > 0 && (
        <ConfirmAction
          message={`Alle ${vehicles.length} eigenen Kräfte abrücken lassen? ${assess(vehicles.map((v) => v.id)).reasons.join(" ")} Der Einsatz bleibt offen. Laufende Patiententransporte werden zuerst beendet.`}
          onConfirm={async () => {
            await act({
              type: "withdraw",
              mission: m.id,
              vehicles: vehicles.map((v) => v.id),
            });
            setSelection([]);
          }}
        >
          Eigene Kräfte abrücken lassen
        </ConfirmAction>
      )}
      {vehicles.slice(currentPage * 25, currentPage * 25 + 25).map((v) => {
        const result = assess([v.id]);
        return (
          <article key={v.id} className="incident-unit">
            <label className="unit-select">
              <input
                type="checkbox"
                aria-label={`${v.name} zum Abziehen auswählen`}
                checked={selected.includes(v.id)}
                disabled={!result.allowed}
                onChange={(e) =>
                  setSelection(
                    e.target.checked
                      ? [...selected, v.id]
                      : selected.filter((id) => id !== v.id),
                  )
                }
              />
              <VehicleIcon type={v.type} />
              <b>{v.name}</b>
              <span className="unit-fms">
                FMS {s.desk.fleet[v.id]?.code ?? operativeCode(v)}
              </span>
            </label>
            <small>
              {statuses[v.status]} ·{" "}
              {v.status === "alarmed"
                ? `Ausrücken in ${duration(v.depart - s.time)}`
                : tripLabel(v, s.time)}
            </small>
            {result.allowed && (
              <>
                <ConfirmAction
                  disabled={!result.allowed}
                  message={`${v.name} abrücken lassen? ${result.reasons.join(" ")} Patienten an Bord werden zuerst übergeben; technische Hindernisse bleiben als Rückkehrauftrag sichtbar.`}
                  onConfirm={async () => {
                    await act({
                      type: "withdraw",
                      mission: m.id,
                      vehicles: [v.id],
                    });
                  }}
                >
                  Abrücken
                </ConfirmAction>
                {v.returnOrder && (
                  <small role="status">{v.returnOrder.reason}</small>
                )}
              </>
            )}
          </article>
        );
      })}
      {pages > 1 && (
        <nav className="pager" aria-label="Eingesetzte Fahrzeuge blättern">
          <button
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Zurück
          </button>
          <span>
            Seite {currentPage + 1} / {pages} · {vehicles.length} Fahrzeuge
          </span>
          <button
            disabled={currentPage + 1 >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            Weiter
          </button>
        </nav>
      )}
      {!!selected.length && (
        <div className="withdraw-selection">
          <ConfirmAction
            disabled={!assessment.allowed}
            message={`${selected.length} eigene Kräfte abrücken lassen? ${assessment.reasons.join(" ")} Rückkehr wird je Fahrzeug geplant; Patienten bleiben gebunden bis zur Übergabe.`}
            onConfirm={async () => {
              await act({
                type: "withdraw",
                mission: m.id,
                vehicles: selected,
              });
              setSelection([]);
            }}
          >
            Ausgewählte abrücken lassen ({selected.length})
          </ConfirmAction>
          {!assessment.allowed && (
            <p role="status">{assessment.reasons.join(" ")}</p>
          )}
        </div>
      )}
      {m.tasks && (
        <details className="incident-task-list">
          <summary>
            Aufgaben · {m.tasks.entries.filter((t) => t.done).length} /{" "}
            {m.tasks.entries.length} erledigt
          </summary>
          {m.tasks.entries.map((t) => (
            <div key={t.id}>
              <span>
                {t.id === "fire-aftercare"
                  ? "Nachkontrolle"
                  : (capabilities[t.skill] ?? t.skill)}
              </span>
              <b>
                {t.done
                  ? "Erledigt"
                  : `${Math.round((t.progress / Math.max(1, t.seconds)) * 100)} %`}
              </b>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
