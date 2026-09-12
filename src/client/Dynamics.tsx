import "./Dynamics.css";
import { WaterSupplyControls } from "./WaterSupplyControls";
import { MajorPanel } from "./Major";
import type { Mission, Save } from "../shared/model";
import { OrganizationTasks } from "./Organizations";
import type { Patient } from "../simulation/dynamics-schema";
import { faultNames } from "../simulation/faults";
import { hazardNames } from "../simulation/hazards";
import { careNames, conditionNames } from "../simulation/patients";
import { travelNames } from "../simulation/traffic";
import { roadNames, weatherNames } from "../simulation/weather";
import { command } from "./store";
import { duration, kilometers } from "../shared/travel";
import { useCommandForm } from "./use-command-form";
import { length } from "../shared/world";
const states = {
  developing: "In Entwicklung",
  escalating: "Eskalierend",
  critical: "Kritisch",
  stabilizing: "Stabilisierend",
  aftermath: "Nachkontrolle",
  resolved: "Abgeschlossen",
};
const tactics = {
  standard: "Regelvorgehen",
  defensive: "Defensiv / Sicherheitsabstand",
  rescue: "Menschenrettung priorisieren",
};
export function EnvironmentPanel({ s }: { s: Save }) {
  const e = s.environment;
  if (!e) return null;
  const faulty = s.vehicles.filter(
    (v) => v.fault && v.fault.state !== "repaired",
  );
  return (
    <section
      className="environment-panel"
      aria-label="Wetter, Verkehr und Fahrzeugstörungen"
    >
      <div className="environment-summary">
        <strong>
          {weatherNames[e.kind]} · {e.temperature} °C
        </strong>
        <span>
          Wind {e.wind} km/h · Sicht {kilometers(e.visibility)}
        </span>
        <span>
          Verkehr{" "}
          {e.density > 1.3
            ? "Berufsverkehr"
            : e.density < 0.5
              ? "Gering"
              : "Normal"}
        </span>
      </div>
      <small>
        Simuliertes Regionalwetter · wirkt auf Gefahren und Fahrzeiten
      </small>
      <details>
        <summary>Straßenmeldungen ({e.roads.length})</summary>
        {e.roads.map((e) => (
          <p key={e.id}>
            {roadNames[e.kind]} ·{" "}
            {e.roadName || `Straßenabschnitt ${e.edge[0]}–${e.edge[1]}`} ·{" "}
            {e.blocked
              ? "Umleitung oder Warten erforderlich"
              : `bis zu ${e.delay} s Verzögerung`}{" "}
            · noch {duration(e.until - s.time)}
          </p>
        ))}
      </details>
      {faulty.map((v) => (
        <article className="fault-card" key={v.id}>
          <b>{v.name} · FMS 6</b>
          <p>
            {faultNames[v.fault!.kind]} ·{" "}
            {v.patients
              ? `${v.patients} Patient(en) an Bord; Versorgung läuft weiter.`
              : "Fahrzeug liefert keine Einsatzfähigkeiten. Ersatz disponieren."}
          </p>
          <span>
            Automatische Behebung ·{" "}
            {duration(Math.max(0, v.fault!.repairAt - s.time))}
          </span>
        </article>
      ))}
    </section>
  );
}
function PatientCard({ s, m, p }: { s: Save; m: Mission; p: Patient }) {
  const form = useCommandForm();
  const editable =
    m.phase !== "done" && p.condition !== "dead" && p.transport !== "delivered";
  return (
    <article
      className={`patient-card condition-${p.condition}`}
      data-transport={p.transport}
    >
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <header>
        <strong>
          Patient {p.id.slice(-6)} · {p.age} Jahre · {p.sex}
        </strong>
        <b>{conditionNames[p.condition]}</b>
      </header>
      <p>
        {p.injury} · {p.consciousness} ·{" "}
        {p.transport === "aboard"
          ? `Transport: ${s.vehicles.find((v) => v.id === p.vehicle)?.name || p.vehicle}`
          : p.transport === "delivered"
            ? "Im Krankenhaus übergeben"
            : p.condition === "dead"
              ? "Tod dokumentiert"
              : p.health >= 55 && p.treatment >= 80
                ? "Transportfähig"
                : "Versorgung am Einsatzort"}
      </p>
      <dl className="vital-grid">
        <div>
          <dt>Puls</dt>
          <dd>{p.pulse}</dd>
        </div>
        <div>
          <dt>Atmung</dt>
          <dd>{p.breathing}</dd>
        </div>
        <div>
          <dt>Blutdruck syst.</dt>
          <dd>{p.systolic}</dd>
        </div>
        <div>
          <dt>SpO₂</dt>
          <dd>{p.oxygen}%</dd>
        </div>
        <div>
          <dt>Temperatur</dt>
          <dd>{p.temperature.toFixed(1)} °C</dd>
        </div>
        <div>
          <dt>Schmerz</dt>
          <dd>{p.pain}/10</dd>
        </div>
        <div>
          <dt>Blutverlust</dt>
          <dd>{Math.round(p.bloodLoss)}%</dd>
        </div>
        <div>
          <dt>Prognose</dt>
          <dd>{Math.round(p.prognosis)}%</dd>
        </div>
      </dl>
      <label>
        Behandlungsfortschritt <progress value={p.treatment} max={100} />{" "}
        {Math.round(p.treatment)}%
      </label>
      {editable && (
        <fieldset disabled={form.busy} className="command-fields desk-form">
          <label>
            Versorgungsschwerpunkt
            <select
              aria-label={`Versorgung Patient ${p.id.slice(-6)}`}
              value={p.care}
              onChange={(e) =>
                void form.run(() =>
                  command({
                    type: "patient-care",
                    mission: m.id,
                    patient: p.id,
                    care: e.target.value as Patient["care"],
                    priority: p.priority,
                  }),
                )
              }
            >
              {Object.entries(careNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            aria-pressed={p.priority === "urgent"}
            onClick={() =>
              void form.run(() =>
                command({
                  type: "patient-care",
                  mission: m.id,
                  patient: p.id,
                  care: p.care,
                  priority: p.priority === "urgent" ? "normal" : "urgent",
                }),
              )
            }
          >
            {p.priority === "urgent"
              ? "Priorisiert versorgen ✓"
              : "Versorgung priorisieren"}
          </button>
        </fieldset>
      )}
      {p.cprCycles > 0 && <p>Reanimationszyklen: {p.cprCycles}</p>}
      <details>
        <summary>Patientenverlauf</summary>
        <ol>
          {p.history.map((h, i) => (
            <li key={i}>
              {new Date(h.at * 1000).toLocaleTimeString("de-DE")} · {h.text}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}
export function DynamicsPanel({ s, m }: { s: Save; m: Mission }) {
  const form = useCommandForm();
  const d = m.dynamics;
  if (!d?.active || !m.control?.briefed) return null;
  const roster = [
    ...new Map((d.responders ?? []).map((r) => [r.person, r])).values(),
  ];
  return (
    <section className="dynamics-panel" aria-label="Dynamische Einsatzlage">
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <OrganizationTasks s={s} m={m} />
      <MajorPanel s={s} m={m} />
      <div className={`dynamics-heading state-${d.state}`}>
        <h3>Dynamische Lage · Alarmstufe {d.level}</h3>
        <b>{states[d.state]}</b>
      </div>
      <p>
        Wetter bei Meldung: {d.weatherAtCall}.{" "}
        {d.parent && `Folgeereignis zu ${d.parent.slice(-8)}.`}{" "}
        {d.children.length > 0 &&
          `Folgeeinsätze: ${d.children.map((id) => id.slice(-8)).join(", ")}.`}
      </p>
      {d.scenario && (
        <div className="environment-summary">
          <strong>Bestätigte Lage: {d.scenario.topic}</strong>
          <span>
            {d.scenario.variant === "access"
              ? "Zugang erschwert – zusätzliche technische Rettung erforderlich"
              : d.scenario.variant === "extended"
                ? "Ausgedehnte Lage – zusätzliche Kräfte und Erkundung erforderlich"
                : "Erstlage nach Erkundung"}
          </span>
          {d.scenario.patient.intensive && (
            <span>Intensivtransport: ITW oder ITH erforderlich.</span>
          )}
        </div>
      )}
      {!!roster.length && (
        <details>
          <summary>
            Dokumentierter Zustand der Einsatzkräfte ({roster.length})
          </summary>
          {[...new Set(roster.map((r) => r.vehicle))].map((id) => {
            const responders = roster.filter((r) => r.vehicle === id),
              states = [...new Set(responders.map((r) => r.state))];
            return (
              <p key={id}>
                <b>
                  {s.vehicles.find((v) => v.id === id)?.name ||
                    "Eingesetzte Einheit"}
                </b>{" "}
                ·{" "}
                {states
                  .map(
                    (state) =>
                      `${responders.filter((r) => r.state === state).length} ${state.toLocaleLowerCase("de-DE").replaceAll("_", " ")}`,
                  )
                  .join(" · ")}
              </p>
            );
          })}
        </details>
      )}
      {m.phase !== "done" && (
        <label>
          Taktik
          <select
            aria-label="Einsatztaktik"
            disabled={form.busy}
            value={d.tactic}
            onChange={(e) =>
              void form.run(() =>
                command({
                  type: "tactic",
                  mission: m.id,
                  tactic: e.target.value as keyof typeof tactics,
                }),
              )
            }
          >
            {Object.entries(tactics).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <small>
            Defensiv reduziert Einsturz-/Rauchrisiken bei langsamerer Arbeit.
            Menschenrettung beschleunigt Versorgung und verlangsamt die
            Gefahrenbekämpfung.
          </small>
        </label>
      )}
      <div className="hazard-grid">
        {d.hazards.map((h) => (
          <article key={`${h.kind}-${h.skill}`}>
            <b>{hazardNames[h.kind]}</b>
            <span>
              {h.resolved ? "Beherrscht" : `${Math.round(h.value)} / 100`}
            </span>
            <progress
              value={h.value}
              max={100}
              aria-label={hazardNames[h.kind]}
            />
            <small>
              {h.value >= h.threshold
                ? "Eskalationsschwelle überschritten"
                : h.resolved
                  ? "Keine akute Gefahr"
                  : "Kräfte vor Ort reduzieren die Gefahr"}
            </small>
          </article>
        ))}
      </div>
      <WaterSupplyControls m={m} />
      {d.fire && (
        <details>
          <summary>Brandentwicklung · {d.fire.fuel}</summary>
          <p>
            Fläche {d.fire.area.toFixed(1)} m² ·{" "}
            {Math.round(d.fire.temperature)} °C · Rauch{" "}
            {Math.round(d.fire.smoke)}% · Ausbreitung {d.fire.spread.toFixed(1)}{" "}
            · Explosionsrisiko {Math.round(d.fire.explosion)}% ·
            Löschfortschritt {Math.round(d.fire.suppression)}%
          </p>
          <div className="fire-sections">
            {d.fire.sections.map((a) => (
              <article key={a.name}>
                <b>{a.name}</b>
                <span>
                  {a.burning > 0
                    ? "Brennend"
                    : a.damage > 0
                      ? "Abgelöscht"
                      : "Nicht betroffen"}
                </span>
                <small>
                  Schaden {Math.round(a.damage)}% · Rauch {Math.round(a.smoke)}%
                </small>
              </article>
            ))}
          </div>
        </details>
      )}
      {d.patients.length > 0 && (
        <div>
          <h3>
            Patienten am Einsatzort (
            {d.patients.filter((p) => p.transport === "scene").length})
          </h3>
          <p>
            Abstrahierte Spielsimulation. Vorhandene Kräfte führen die Maßnahmen
            aus; ein Schwerpunkt ersetzt keine fehlenden Rettungsmittel.
          </p>
          {d.patients
            .filter((p) => p.transport === "scene")
            .map((p) => (
              <PatientCard key={p.id} s={s} m={m} p={p} />
            ))}
          <details open={d.patients.some((p) => p.transport === "aboard")}>
            <summary>
              Transporte und Übergaben (
              {d.patients.filter((p) => p.transport !== "scene").length})
            </summary>
            {d.patients
              .filter((p) => p.transport !== "scene")
              .map((p) => (
                <PatientCard key={p.id} s={s} m={m} p={p} />
              ))}
          </details>
        </div>
      )}
      <details>
        <summary>Fahrwege und Verzögerungen</summary>
        {s.vehicles
          .filter((v) => v.mission === m.id && v.journey)
          .map((v) => (
            <p key={v.id}>
              <b>{v.name}</b> · {travelNames[v.journey!.mode]} · Sollroute{" "}
              {kilometers(length(v.journey!.planned) * 12)} /{" "}
              {duration(v.journey!.plannedSeconds)} · Mehrzeit{" "}
              {duration(v.journey!.delay)}{" "}
              {v.journey!.reason && `· ${v.journey!.reason}`}
            </p>
          ))}
      </details>
    </section>
  );
}
