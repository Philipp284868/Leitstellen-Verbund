import { useState } from "react";
import type { Mission, Save } from "./model";
import type { Patient } from "./simulation/dynamics-schema";
import { useNetwork } from "./network";
import { act, useGame } from "./store";
import { majorKind } from "./simulation/major-incidents";
import {
  majorNames,
  sectionNames,
  type SectionKind,
} from "./simulation/major-schema";
import { placement, sectionSkills } from "./simulation/major-resources";
import { vt } from "./catalog";
import { fleetReadiness } from "./fleet-view";
import { useHospitalOptions } from "./germany/GeoQueries";
import "./Major.css";

export function OperationsOverview({
  s,
  open,
}: {
  s: Save;
  open: (id: string) => void;
}) {
  const active = s.missions.filter((m) => m.major);
  const campaign = s.operations.campaign;
  if (!active.length && !campaign && !s.operations.history.length) return null;
  const available = fleetReadiness(s);
  const ready = s.vehicles.filter((v) => !available(v));
  return (
    <section className="operations-overview" aria-label="Großlagenübersicht">
      <strong>Großlagenführung · {ready.length} Fahrzeuge disponierbar</strong>
      <small>
        {s.vehicles.filter((v) => v.status !== "ready").length} gebunden ·{" "}
        {s.vehicles.filter((v) => v.reserve).length} als Reserve vorgesehen
      </small>
      {campaign && (
        <p>
          {majorNames[campaign.kind]} · {campaign.missions.length} Meldungen
          bisher. Weitere Meldungen entstehen zeitlich versetzt und können
          parallel bearbeitet werden.
        </p>
      )}
      {active.map((m) => (
        <button key={m.id} onClick={() => open(m.id)}>
          {majorNames[m.major!.kind]} ·{" "}
          {m.major!.shortage || "Abschnittskräfte vorhanden"}
        </button>
      ))}
      {s.operations.history.length > 0 && (
        <details>
          <summary>
            Abgeschlossene Flächenlagen ({s.operations.history.length})
          </summary>
          {s.operations.history.map((c) => (
            <p key={c.id}>
              {majorNames[c.kind]} · {c.missions.length} Einsätze ·{" "}
              {Math.round((c.closed - c.started) / 60)} min
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
function TriageRow({ s, m, p }: { s: Save; m: Mission; p: Patient }) {
  const [category, setCategory] = useState<"I" | "II" | "III">(
    p.triage || (p.health < 65 ? "I" : p.health < 80 ? "II" : "III"),
  );
  const [hospital, setHospital] = useState(p.hospital || "");
  const [pending, setPending] = useState(false);
  return (
    <fieldset className="major-triage" disabled={pending}>
      <legend>
        Patient {p.id.slice(-6)} ·{" "}
        {p.triage ? `gesichtet ${p.triage}` : "ungesichtet"}
      </legend>
      <small>
        {p.injury} ·{" "}
        {p.health >= 55 && p.treatment >= 80
          ? "Transportfähig"
          : "Weitere Versorgung nötig"}
      </small>
      <label>
        Sichtungskategorie
        <select
          aria-label={`Sichtung ${p.id}`}
          value={category}
          onChange={(e) => setCategory(e.target.value as typeof category)}
        >
          <option value="I">I · höchste Priorität</option>
          <option value="II">II · dringlich</option>
          <option value="III">III · nachrangig</option>
        </select>
      </label>
      <label>
        Klinikwunsch
        <select
          aria-label={`Klinik ${p.id}`}
          value={hospital}
          onChange={(e) => setHospital(e.target.value)}
        >
          <option value="">Geeignete Klinik automatisch</option>
          <option value="public">Regionalklinik</option>
          {s.buildings
            .filter((b) => b.type === "hospital")
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
      </label>
      <button
        onClick={async () => {
          setPending(true);
          try {
            await act({
              type: "major-triage",
              mission: m.id,
              patient: p.id,
              category,
              hospital,
            });
          } finally {
            setPending(false);
          }
        }}
      >
        Sichtung und Ziel bestätigen
      </button>
    </fieldset>
  );
}
export function MajorPanel({ s, m }: { s: Save; m: Mission }) {
  const net = useNetwork();
  const { readonly } = useGame();
  const [pending, setPending] = useState(false);
  const disabled = readonly || m.phase === "done";
  const hospitals = useHospitalOptions(
    s,
    m.pos,
    0,
    undefined,
    undefined,
    !!m.control?.briefed &&
      !!m.major?.sections.some((section) => section.kind === "medical"),
  );
  if (!m.control?.briefed || !m.dynamics?.active) return null;
  const g = m.major;
  if (!g) {
    const kind = majorKind(m);
    return kind && !disabled && ["offered", "working"].includes(m.phase) ? (
      <section className="major-panel">
        <strong>Erweiterte Lageführung</strong>
        <p>
          Wenn die Lage es erfordert: {majorNames[kind]} ausrufen. Zusätzliche
          Führung, Abschnittsarbeit und gegebenenfalls weitere Betroffene werden
          verbindlich simuliert. Vorhandene Kräfte sammeln zunächst im
          Bereitstellungsraum.
        </p>
        <button
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              await act({ type: "major-declare", mission: m.id });
            } finally {
              setPending(false);
            }
          }}
        >
          {majorNames[kind]} ausrufen
        </button>
      </section>
    ) : null;
  }
  const units = [
    ...s.vehicles.filter((v) => v.mission === m.id),
    ...net.friends.flatMap((f) =>
      f.vehicles.filter((v) => v.mission === `remote:${s.player.id}:${m.id}`),
    ),
  ];
  const waiting = m.dynamics.patients.filter(
    (p) => p.transport === "scene" && p.condition !== "dead",
  );
  return (
    <section className="major-panel" aria-label="Großlagenführung">
      <header>
        <span className="eyebrow">Großlagenführung</span>
        <h3>
          {majorNames[g.kind]} · Stufe {g.level}
        </h3>
      </header>
      <p role="status">
        {g.shortage
          ? `Handlungsbedarf: ${g.shortage}`
          : "Abschnittskräfte vorhanden. Laufende Entwicklung weiter beobachten."}
      </p>
      <p>
        Bereitstellung und Reserve wirken erst nach bewusster
        Abschnittszuweisung. Bereits fahrende Kräfte erreichen zuerst den
        Einsatzort.
      </p>
      {g.evacuees > 0 && (
        <label>
          Evakuierung / Betreuung: {Math.floor(g.evacuated)} / {g.evacuees}{" "}
          Personen
          <progress max={g.evacuees} value={g.evacuated} />
        </label>
      )}
      {g.kind === "fire" && (
        <p>
          Löschwasserpuffer: {Math.round(g.water)} l · Verbrauch{" "}
          {Math.round(g.demand)} l/s. Ohne Nachschub sinkt die Löschleistung.
        </p>
      )}
      <fieldset disabled={disabled} className="major-sections">
        <legend>Einsatzabschnitte</legend>
        {g.sections.map((section) => (
          <article key={section.kind} className="major-section">
            <strong>{sectionNames[section.kind]}</strong>
            <small>
              {section.done
                ? "Erstauftrag erfüllt – Kräfte bleiben wirksam"
                : section.ordered
                  ? "Beauftragt"
                  : "Auftrag offen"}{" "}
              · {units.filter((v) => placement(m, v) === section.kind).length}{" "}
              zugewiesen
            </small>
            <progress max={section.seconds} value={section.progress} />
            <label>
              Abschnittsleitung
              <select
                aria-label={`Leitung ${sectionNames[section.kind]}`}
                value={section.leader?.vehicle || ""}
                onChange={(e) =>
                  void act({
                    type: "major-leader",
                    mission: m.id,
                    section: section.kind,
                    vehicle: e.target.value,
                  })
                }
              >
                <option value="">Zentrale Einsatzleitung</option>
                {units
                  .filter((v) =>
                    [section.kind, "command"].includes(placement(m, v)),
                  )
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Abschnittspriorität
              <select
                aria-label={`Priorität ${sectionNames[section.kind]}`}
                value={section.priority}
                onChange={(e) =>
                  void act({
                    type: "major-section",
                    mission: m.id,
                    section: section.kind,
                    priority: Number(e.target.value),
                  })
                }
              >
                <option value={1}>1 · vorrangig</option>
                <option value={2}>2 · regulär</option>
                <option value={3}>3 · nachrangig</option>
              </select>
            </label>
            {!section.ordered && (
              <button
                onClick={() =>
                  void act({
                    type: "major-section",
                    mission: m.id,
                    section: section.kind,
                    priority: section.priority,
                  })
                }
              >
                {sectionNames[section.kind]} beauftragen
              </button>
            )}
          </article>
        ))}
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>Bereitstellungsraum und Kräftezuweisung</legend>
        {!units.length && (
          <p>
            Noch keine eigenen oder zugesagten Nachbarkräfte alarmiert. AAO,
            freie Disposition oder Unterstützungsanfrage nutzen.
          </p>
        )}
        {units.map((v) => (
          <label key={v.id} className="major-unit">
            {v.name} ·{" "}
            {v.status === "scene"
              ? "vor Ort"
              : v.status === "alarmed"
                ? "sammelt Besatzung"
                : "gebunden / unterwegs"}
            <select
              aria-label={`Abschnitt ${v.name}`}
              disabled={
                !!v.patients ||
                !["scene", "travel", "alarmed"].includes(v.status)
              }
              value={placement(m, v)}
              onChange={(e) =>
                void act({
                  type: "major-assign",
                  mission: m.id,
                  vehicle: v.id,
                  section: e.target.value as SectionKind,
                })
              }
            >
              <option value="staging">Bereitstellung / Reserve</option>
              {g.sections
                .filter((x) =>
                  sectionSkills[x.kind].some((k) => vt(v.type).skills[k]),
                )
                .map((x) => (
                  <option key={x.kind} value={x.kind}>
                    {sectionNames[x.kind]}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </fieldset>
      {g.sections.some((x) => x.kind === "medical") && (
        <fieldset disabled={disabled}>
          <legend>MANV · Sichtung und Klinikverteilung</legend>
          <details>
            <summary>Aufnahmekapazitäten der eigenen Leitstelle</summary>
            {hospitals.loading && (
              <p role="status">Aufnahmekapazitäten werden geladen …</p>
            )}
            {hospitals.error && <p role="alert">{hospitals.error}</p>}
            {hospitals.options.map((h) => (
              <p key={h.id}>
                {h.name}: {Math.max(0, h.capacity - h.occupied - h.reserved)}{" "}
                frei · {h.occupied} belegt · {h.reserved} zugesagt
                {!h.open ? " · abgemeldet" : ""}
              </p>
            ))}
          </details>
          <p>
            {waiting.length} am Einsatzort ·{" "}
            {m.dynamics.patients.filter((p) => p.transport === "aboard").length}{" "}
            im Transport ·{" "}
            {
              m.dynamics.patients.filter((p) => p.transport === "delivered")
                .length
            }{" "}
            übergeben
          </p>
          <small>
            Kategorien sind Spielprioritäten. Sichtung benötigt medizinische
            Abschnittskräfte. Fachrichtung und freie Aufnahme werden vor jeder
            Fahrt geprüft; fremde Rettungsmittel nutzen ihre eigenen Kliniken.
          </small>
          <button
            onClick={() =>
              void act({
                type: "major-transports",
                mission: m.id,
                enabled: !g.transports,
              })
            }
          >
            {g.transports
              ? "Neue Transporte anhalten"
              : "Priorisierte Transporte freigeben"}
          </button>
          {waiting.map((p) => (
            <TriageRow key={p.id} s={s} m={m} p={p} />
          ))}
        </fieldset>
      )}
    </section>
  );
}
