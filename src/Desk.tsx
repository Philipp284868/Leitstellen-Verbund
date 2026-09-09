import { CallConversation } from "./CallConversation";
import { VehicleIcon } from "./map-icons";
import { NeighborDesk } from "./NeighborDesk";
import { ForceNeeds, ReserveOverview } from "./ForceNeeds";
import { requirements } from "./simulation/hazards";
import { effectiveSkills } from "./simulation/major-resources";
import { DynamicsPanel } from "./Dynamics";
import { FireLiveStatus } from "./FireLiveStatus";
import { IncidentUnits } from "./IncidentUnits";
import { travelNames } from "./simulation/traffic";
import type { TravelMode } from "./simulation/dynamics-schema";
import { useEffect, useState } from "react";
import type { Mission, Save } from "./model";
import { vehicles, vt, bt, capabilities } from "./catalog";
import { missionProgress } from "./mission-presentation";
import { capacity } from "./engine";
import { fleetReadiness } from "./fleet-view";
import { reserveWarning } from "./simulation/staffing";
import { chat, useNetwork } from "./network";
import { command, useGame } from "./store";
import { useCommandForm } from "./use-command-form";
import { requestDialogTransition } from "./dialog-state";
import { createId } from "./ids";
import { duration, tripLabel } from "./travel";
import { ApproachText } from "./germany/GeoQueries";
import {
  fmsDefaults,
  fmsName,
  alarmNames,
  operativeCode,
} from "./simulation/fms";
import type { AAO, Alarm, Priority } from "./simulation/schema";
import {
  priorities,
  priorityRank,
  visiblePriority,
} from "./simulation/priority";
import { missionStatus } from "./simulation/mission-status";
import { statuses, ConfirmAction } from "./ui";
import "./Desk.css";
import { RadioRequestActions } from "./RadioRequest";
const stages = {
  incoming: "Notruf eingegangen",
  interview: "Gespräch läuft",
  disposition: "Disposition möglich",
  alarming: "Alarmierung",
  enroute: "Kräfte auf Anfahrt",
  recon: "Erste Lagemeldung bearbeiten",
  working: "Einsatzbearbeitung",
  transport: "Patiententransport",
  closed: "Abgeschlossen",
};
const orgs = [
  "Alle",
  "Feuerwehr",
  "Rettungsdienst",
  "Polizei",
  "THW",
  "Wasserrettung",
  "Infrastruktur",
] as const;
export function DeskQueue({
  s,
  open,
  panel,
}: {
  s: Save;
  open: (id: string) => void;
  panel: (id: string) => void;
}) {
  const [callPage, setCallPage] = useState(0),
    [radioPage, setRadioPage] = useState(0);
  const calls = s.missions
    .flatMap((m) =>
      (m.control?.calls ?? [])
        .filter(
          (c) =>
            c.state === "ringing" ||
            c.state === "dropped" ||
            c.state === "active",
        )
        .map((c) => ({ m, c })),
    )
    .sort(
      (a, b) =>
        priorityRank(b.m.control?.priority) -
          priorityRank(a.m.control?.priority) || a.c.created - b.c.created,
    );
  const radio = s.missions
    .flatMap((m) =>
      (m.control?.radio ?? [])
        .filter((r) => r.state === "open")
        .map((r) => ({ m, r })),
    )
    .sort(
      (a, b) =>
        priorityRank(b.r.priority) - priorityRank(a.r.priority) ||
        a.r.created - b.r.created,
    );
  const callsAt = Math.min(
    callPage,
    Math.max(0, Math.ceil(calls.length / 10) - 1),
  );
  const radioAt = Math.min(
    radioPage,
    Math.max(0, Math.ceil(radio.length / 10) - 1),
  );
  return (
    <section className="desk-queue" aria-label="Notruf und Funk">
      <div className="desk-tools">
        <button onClick={() => panel("aaos")}>AAO</button>
        <button onClick={() => panel("fms")}>FMS / Funkstatus</button>
      </div>
      <strong>Notrufe · {calls.length}</strong>
      {!calls.length && <small>Keine offenen Gespräche.</small>}
      {calls.slice(callsAt * 10, (callsAt + 1) * 10).map(({ m, c }) => (
        <button className="call-card" key={c.id} onClick={() => open(m.id)}>
          <b>
            {c.state === "ringing"
              ? "☎ Notruf annehmen"
              : c.state === "active"
                ? "☎ Gespräch fortsetzen"
                : "☎ Gespräch abgebrochen"}
          </b>
          <small>
            {c.caller} ·{" "}
            {m.control?.locationKnown ? "Ort erfasst" : "Ort noch unbekannt"}
          </small>
        </button>
      ))}
      {calls.length > 10 && (
        <nav className="mission-pagination" aria-label="Notrufseiten">
          <button disabled={!callsAt} onClick={() => setCallPage(callsAt - 1)}>
            Vorherige Notrufe
          </button>
          <span>
            {callsAt + 1}/{Math.ceil(calls.length / 10)}
          </span>
          <button
            disabled={(callsAt + 1) * 10 >= calls.length}
            onClick={() => setCallPage(callsAt + 1)}
          >
            Weitere Notrufe
          </button>
        </nav>
      )}
      <strong>Funk · {radio.length} offen</strong>
      {radio.slice(radioAt * 10, (radioAt + 1) * 10).map(({ m, r }) => (
        <button className="radio-request" key={r.id} onClick={() => open(m.id)}>
          <b>{visiblePriority(r.priority)} · Sprechwunsch</b>
          <small>{r.details}</small>
        </button>
      ))}
      {radio.length > 10 && (
        <nav className="mission-pagination" aria-label="Funkseiten">
          <button disabled={!radioAt} onClick={() => setRadioPage(radioAt - 1)}>
            Vorherige Sprechwünsche
          </button>
          <span>
            {radioAt + 1}/{Math.ceil(radio.length / 10)}
          </span>
          <button
            disabled={(radioAt + 1) * 10 >= radio.length}
            onClick={() => setRadioPage(radioAt + 1)}
          >
            Weitere Sprechwünsche
          </button>
        </nav>
      )}
    </section>
  );
}
export function History({ s, m }: { s: Save; m: Mission }) {
  const { workspace } = useGame();
  const [query, setQuery] = useState(""),
    [limit, setLimit] = useState(100);
  const events = (m.control?.events ?? []).filter((e) =>
    `${e.type} ${e.text} ${e.actor}`
      .toLocaleLowerCase("de")
      .includes(query.toLocaleLowerCase("de")),
  );
  return (
    <details
      className="incident-history"
      data-hud-section="history"
      open={m.phase === "done"}
    >
      <summary>
        Einsatzhistorie · {m.control?.events.length ?? 0} Einträge
      </summary>
      <label>
        Historie durchsuchen
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(100);
          }}
        />
      </label>
      <p>
        {Math.min(limit, events.length)} von {events.length} passenden Einträgen
      </p>
      <ol>
        {events.slice(0, limit).map((e) => (
          <li key={e.id}>
            <small>
              +{duration(e.at - m.created)} ·{" "}
              {workspace?.members.find((u) => u.id === e.actor)?.name ??
                e.actor}
              {e.vehicle
                ? ` · ${s.vehicles.find((v) => v.id === e.vehicle)?.name ?? e.vehicle}`
                : ""}
            </small>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
      {events.length > limit && (
        <button onClick={() => setLimit(limit + 100)}>
          Weitere 100 Ereignisse anzeigen
        </button>
      )}
    </details>
  );
}
export function IncidentPanel({ s, m }: { s: Save; m: Mission }) {
  const c = m.control!;
  const progress = missionProgress(m);
  const ready = fleetReadiness(s);
  const net = useNetwork();
  const support = net.support.filter(
    (f) => f.mission === m.id && f.round === m.round,
  );
  const [selected, setSelected] = useState<string[]>([]),
    [aao, setAao] = useState(""),
    [priority, setPriority] = useState<Priority>("NORMAL"),
    [alarm, setAlarm] = useState<Alarm | "">(""),
    [travel, setTravel] = useState<TravelMode>("priority"),
    [home, setHome] = useState(""),
    [org, setOrg] = useState("Alle");
  const form = useCommandForm(selected.length > 0, () => setSelected([]));
  const proposal = c.proposal;
  useEffect(() => {
    if (proposal) setSelected(proposal.vehicles);
  }, [proposal?.id]); // A fresh server proposal is an editable selection, never an alarm.
  const selectedReady = selected.filter((id) => {
    const v = s.vehicles.find((v) => v.id === id);
    return v && !ready(v);
  });
  const chosen = s.vehicles.filter((v) => selectedReady.includes(v.id)),
    skills = { ...capacity(s, m.id) };
  for (const v of chosen)
    for (const [k, n] of Object.entries(effectiveSkills(m, v)))
      skills[k] = (skills[k] || 0) + n;
  for (const f of support.filter(
    (f) =>
      f.vehicle.status === "scene" &&
      (!f.vehicle.fault || f.vehicle.fault.state === "repaired"),
  ))
    for (const [k, n] of Object.entries(effectiveSkills(m, f.vehicle)))
      skills[k] = (skills[k] || 0) + n;
  const selectedAAO = s.desk.aaos.find((x) => x.id === aao);
  const processing = missionStatus(s, m, net.support);
  return (
    <div className="incident-desk" data-hud-section="details">
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <fieldset className="command-fields" disabled={form.busy}>
        <span className="eyebrow">
          {visiblePriority(c.priority)} · {stages[c.stage]} · Einsatz{" "}
          {m.id.slice(-8)}
        </span>

        <p>
          Seit {duration(Math.max(0, s.time - m.created))} offen ·{" "}
          <strong data-processing={processing.code}>{processing.label}</strong>
        </p>
        <p className={processing.attention ? "warning" : "muted"}>
          {processing.detail}
        </p>
        {!c.briefed && (
          <p className="warning">
            Offene Informationen:{" "}
            {[
              !c.locationKnown && "genauer Einsatzort",
              !c.reportedTemplate && "Meldebild",
              !c.facts.some((f) => f.key === "people") && "betroffene Personen",
              !c.facts.some((f) => f.key === "hazard") && "erkennbare Gefahren",
              "erste Lagemeldung",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {c.locationKnown && (
          <label>
            Dispositionspriorität
            <select
              aria-label="Dispositionspriorität"
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
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        )}
        {c.calls.some((call) => call.state !== "ended") ? (
          <CallConversation s={s} m={m} />
        ) : (
          <details className="closed-calls">
            <summary>Abgeschlossene Notrufgespräche ({c.calls.length})</summary>
            <CallConversation s={s} m={m} />
          </details>
        )}
        <details className="known-information" open={!c.briefed}>
          <summary>Bekannte Informationen</summary>
          {!c.facts.length && (
            <p>
              Noch keine Angaben erfragt. Ort und Meldebild reichen für eine
              erste Disposition.
            </p>
          )}
          <ul className="known-facts">
            {c.facts.map((f, i) => (
              <li key={i}>
                <b>{f.confidence}</b> · {f.text}
              </li>
            ))}
          </ul>
        </details>
        <FireLiveStatus m={m} reduced={s.settings.reduced} />
        <DynamicsPanel s={s} m={m} />
        {c.radio.some((r) => r.state === "open") && (
          <section
            className="radio-queue"
            data-hud-section="radio"
            data-tutorial="radio"
          >
            <h3>Sprechwünsche und Lagemeldungen</h3>
            {c.radio
              .filter((r) => r.state === "open")
              .map((r) => (
                <article key={r.id}>
                  <b>
                    {visiblePriority(r.priority)} ·{" "}
                    {s.vehicles.find((v) => v.id === r.vehicle)?.name ||
                      support.find((f) => f.vehicle.id === r.vehicle)?.vehicle
                        .name}
                  </b>
                  <p>{r.details}</p>
                  <RadioRequestActions s={s} m={m} r={r} />
                </article>
              ))}
          </section>
        )}
        {c.locationKnown && c.reportedTemplate && m.phase !== "done" && (
          <section data-hud-section="vehicles" data-tutorial="dispatch">
            <h3>Kräfte alarmieren / nachfordern</h3>
            <label>
              Anfahrtsart
              <select
                aria-label="Anfahrtsart"
                value={travel}
                onChange={(e) => setTravel(e.target.value as TravelMode)}
              >
                {Object.entries(travelNames).map(([id, name]) => (
                  <option value={id} key={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <p>
              {c.briefed
                ? "Bestätigter Bedarf"
                : "Vermuteter Bedarf · Erkundung steht aus."}
            </p>
            <ForceNeeds
              required={Object.fromEntries(
                Object.entries(requirements(m))
                  .map(([key, n]) => [
                    key,
                    Math.max(n, selectedAAO?.skills[key] ?? 0),
                  ])
                  .concat(
                    Object.entries(selectedAAO?.skills ?? {}).filter(
                      ([key]) => !requirements(m)[key],
                    ),
                  ),
              )}
              available={skills}
            />
            <ReserveOverview s={s} selected={chosen} />
            <div className="desk-form">
              <label>
                AAO auswählen
                <select
                  aria-label="AAO auswählen"
                  value={aao}
                  onChange={(e) => {
                    setAao(e.target.value);
                    const a = s.desk.aaos.find((a) => a.id === e.target.value);
                    if (a) {
                      setPriority(a.priority);
                      setAlarm(a.alarm);
                    }
                  }}
                >
                  <option value="">Freie Disposition</option>
                  {s.desk.aaos.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.keyword} · {a.name} · Stufe {a.level}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={!aao}
                onClick={() =>
                  void form.run(() =>
                    command({ type: "aao-propose", mission: m.id, aao }),
                  )
                }
              >
                AAO-Vorschlag berechnen
              </button>
            </div>
            {proposal && (
              <p>
                {proposal.vehicles.length} Fahrzeuge vorgeschlagen ·{" "}
                {proposal.missing.join(" · ") || "AAO vollständig verfügbar"}.
                Auswahl vor der Alarmierung prüfen.
              </p>
            )}
            <div className="desk-form">
              <label>
                Wache
                <select
                  aria-label="Wache"
                  value={home}
                  onChange={(e) => setHome(e.target.value)}
                >
                  <option value="">Alle Wachen</option>
                  {s.buildings.map((b) => (
                    <option value={b.id} key={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Organisation
                <select
                  aria-label="Organisation"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                >
                  {orgs.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label>
                Priorität
                <select
                  aria-label="Priorität"
                  value={visiblePriority(priority)}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                >
                  {priorities.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Alarmierungsart
                <select
                  aria-label="Alarmierungsart"
                  value={alarm}
                  onChange={(e) => setAlarm(e.target.value as Alarm | "")}
                >
                  <option value="">Profil der jeweiligen Wache</option>
                  {Object.entries(alarmNames).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="dispatch-list">
              {s.vehicles
                .filter(
                  (v) =>
                    (!home || v.home === home) &&
                    (org === "Alle" || bt(vt(v.type).home).org === org),
                )
                .map((v) => (
                  <label key={v.id}>
                    <input
                      type="checkbox"
                      disabled={!!ready(v)}
                      checked={selectedReady.includes(v.id)}
                      onChange={(e) =>
                        setSelected((ids) =>
                          e.target.checked
                            ? [...ids, v.id]
                            : ids.filter((id) => id !== v.id),
                        )
                      }
                    />
                    <span>
                      <b>
                        <VehicleIcon type={v.type} /> {v.name} · FMS{" "}
                        {s.desk.fleet[v.id]?.code ?? operativeCode(v)}
                      </b>
                      <small>
                        {ready(v) || (
                          <>
                            <span>
                              {v.availability?.dispatchable === false
                                ? "FF alarmierbar · "
                                : "Einsatzbereit · "}
                            </span>
                            <ApproachText
                              s={s}
                              vehicle={v}
                              target={m.pos}
                              mode={travel}
                              alarm={alarm || undefined}
                            />
                          </>
                        )}
                      </small>
                      <small>{reserveWarning(s, v)}</small>
                    </span>
                  </label>
                ))}
            </div>
            <button
              className="primary"
              disabled={!selectedReady.length}
              onClick={() => {
                void form.run(async () => {
                  await command({
                    type: "dispatch",
                    travel,
                    mission: m.id,
                    vehicles: selectedReady,
                    priority,
                    alarm: alarm || undefined,
                  });
                  setSelected([]);
                });
              }}
            >
              Alarmieren ({selectedReady.length})
            </button>
          </section>
        )}
        <section data-hud-section="arrival">
          <h3>Eingesetzte Fahrzeuge</h3>
          {support.map((f) => (
            <p key={f.assignment}>
              <b>{f.vehicle.name} · Nachbarleitstelle</b> ·{" "}
              {statuses[f.vehicle.status]} · {tripLabel(f.vehicle, s.time)}
            </p>
          ))}
          <IncidentUnits
            key={m.id}
            s={s}
            m={m}
            remoteUnits={support.map((f) => f.vehicle)}
          />
          {progress ? (
            <>
              <progress
                value={progress.value}
                max={progress.max}
                aria-label={progress.label}
              />
              <small>{progress.label}</small>
            </>
          ) : (
            <small>Weitere Angaben nach der ersten Erkundung</small>
          )}
        </section>
        <History s={s} m={m} />
      </fieldset>
    </div>
  );
}
const newAAO = (): AAO => ({
  id: createId(),
  name: "Neue AAO",
  keyword: "B1",
  level: 1,
  org: "Alle",
  types: [],
  skills: { fire: 1 },
  priority: "NORMAL",
  alarm: "dme",
});
export function AAOPanel({ s }: { s: Save }) {
  const [a, setA] = useState<AAO>(newAAO);
  const [baseline, setBaseline] = useState(a);
  const dirty = JSON.stringify(a) !== JSON.stringify(baseline);
  const restore = () => setA(structuredClone(baseline));
  const form = useCommandForm(dirty, restore);
  const load = (value: AAO) =>
    requestDialogTransition(() => {
      setA(structuredClone(value));
      setBaseline(structuredClone(value));
    });
  return (
    <div className="aao-editor">
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <fieldset className="command-fields" disabled={form.busy}>
        <p>
          Eine AAO erstellt einen verfügbaren Fahrzeugvorschlag. Alarmiert wird
          erst nach deiner Bestätigung.
        </p>
        <div className="inline">
          <button onClick={() => load(newAAO())}>Neue AAO</button>
          {s.desk.aaos.map((x) => (
            <button
              key={x.id}
              aria-pressed={a.id === x.id}
              onClick={() => load(x)}
            >
              {x.name}
            </button>
          ))}
        </div>
        <div className="desk-form">
          <label>
            AAO-Name
            <input
              value={a.name}
              maxLength={60}
              onChange={(e) => setA({ ...a, name: e.target.value })}
            />
          </label>
          <label>
            Einsatzstichwort
            <input
              value={a.keyword}
              maxLength={60}
              onChange={(e) => setA({ ...a, keyword: e.target.value })}
            />
          </label>
          <label>
            Alarmstufe
            <input
              type="number"
              min={1}
              max={5}
              value={a.level}
              onChange={(e) => setA({ ...a, level: Number(e.target.value) })}
            />
          </label>
          <label>
            AAO-Organisation
            <select
              aria-label="AAO-Organisation"
              value={a.org}
              onChange={(e) =>
                setA({ ...a, org: e.target.value as AAO["org"] })
              }
            >
              {orgs.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label>
            AAO-Priorität
            <select
              aria-label="AAO-Priorität"
              value={visiblePriority(a.priority)}
              onChange={(e) =>
                setA({ ...a, priority: e.target.value as Priority })
              }
            >
              {priorities.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            AAO-Alarmierungsart
            <select
              aria-label="AAO-Alarmierungsart"
              value={a.alarm}
              onChange={(e) => setA({ ...a, alarm: e.target.value as Alarm })}
            >
              {Object.entries(alarmNames).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <h3>Fahrzeuganforderungen</h3>
        <div className="requirement-editor">
          {vehicles.map((v) => (
            <label key={v.id}>
              {v.name}
              <input
                aria-label={`Anzahl ${v.name}`}
                type="number"
                min={0}
                max={8}
                value={a.types.filter((t) => t === v.id).length}
                onChange={(e) =>
                  setA({
                    ...a,
                    types: [
                      ...a.types.filter((t) => t !== v.id),
                      ...Array(
                        Math.max(0, Math.min(8, Number(e.target.value) || 0)),
                      ).fill(v.id),
                    ],
                  })
                }
              />
            </label>
          ))}
        </div>
        <h3>Zusätzliche Fähigkeiten / Sondermittel</h3>
        <div className="requirement-editor">
          {Object.entries(capabilities).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min={0}
                max={50}
                value={a.skills[key] || 0}
                onChange={(e) => {
                  const skills = { ...a.skills },
                    n = Math.max(0, Number(e.target.value) || 0);
                  if (n) skills[key] = n;
                  else delete skills[key];
                  setA({ ...a, skills });
                }}
              />
            </label>
          ))}
        </div>
        <div className="inline">
          <button
            className="primary"
            disabled={
              (!a.types.length &&
                !Object.values(a.skills).some((n) => n > 0)) ||
              a.types.length > 30 ||
              !a.name.trim() ||
              !a.keyword.trim()
            }
            onClick={() =>
              void form.run(async () => {
                await command({ type: "aao-save", aao: a });
                setBaseline(structuredClone(a));
              })
            }
          >
            AAO speichern
          </button>
          <button disabled={!dirty} onClick={restore}>
            Änderungen verwerfen
          </button>
          <button onClick={() => setA({ ...newAAO(), id: a.id, name: a.name })}>
            AAO auf Standard zurücksetzen
          </button>
          <ConfirmAction
            disabled={!s.desk.aaos.some((x) => x.id === a.id)}
            message={`AAO „${a.name}“ dauerhaft löschen?`}
            onConfirm={async () => {
              await command({ type: "aao-delete", id: a.id });
              const next = newAAO();
              setA(next);
              setBaseline(next);
            }}
          >
            AAO löschen
          </ConfirmAction>
        </div>
      </fieldset>
    </div>
  );
}
function FmsVehicle({ s, id }: { s: Save; id: string }) {
  const v = s.vehicles.find((v) => v.id === id)!,
    f = s.desk.fleet[id];
  const liveCode = f?.code ?? operativeCode(v);
  const [draftCode, setCode] = useState<number | null>(null),
    [reason, setReason] = useState("");
  const reset = () => {
    setCode(null);
    setReason("");
  };
  const form = useCommandForm(draftCode !== null || !!reason, reset);
  const code = draftCode ?? liveCode;
  return (
    <article className="fms-vehicle">
      <b>
        {v.name} · FMS {liveCode}
      </b>
      <p>
        Letzter Wechsel vor {duration(s.time - (f?.changed ?? s.time))}.
        Fahrzeugbindung: {statuses[v.status]} · Kanal{" "}
        {f?.channel ?? bt(vt(v.type).home).org}
      </p>
      <fieldset className="command-fields desk-form" disabled={form.busy}>
        <label>
          FMS korrigieren
          <select
            aria-label="FMS korrigieren"
            value={code}
            onChange={(e) => setCode(Number(e.target.value))}
          >
            {fmsDefaults.map((_, i) => (
              <option value={i} key={i}>
                {i} · {fmsName(s, v, i)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Begründung
          <input
            value={reason}
            maxLength={180}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button
          disabled={reason.trim().length < 3}
          onClick={() =>
            void form.run(async () => {
              await command({ type: "fms", vehicle: id, code, reason });
              reset();
            })
          }
        >
          Statuskorrektur bestätigen
        </button>
        <button disabled={draftCode === null && !reason} onClick={reset}>
          Änderungen verwerfen
        </button>
      </fieldset>
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <details>
        <summary>Statushistorie</summary>
        {f?.history.map((e) => (
          <p key={e.id}>
            +{duration(s.time - e.at)} zurück · {e.text} · {e.actor}
          </p>
        ))}
      </details>
    </article>
  );
}
function AlarmProfile({ s, id }: { s: Save; id: string }) {
  const live = s.desk.alarms[id] ?? "dme",
    [draft, setDraft] = useState<Alarm | null>(null);
  const form = useCommandForm(draft !== null && draft !== live, () =>
    setDraft(null),
  );
  return (
    <div className="alarm-profile-row">
      <fieldset disabled={form.busy} className="command-fields desk-form">
        <label>
          {s.buildings.find((b) => b.id === id)?.name}
          <select
            value={draft ?? live}
            onChange={(e) => setDraft(e.target.value as Alarm)}
          >
            {Object.entries(alarmNames).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={draft === null || draft === live}
          onClick={() =>
            void form.run(async () => {
              await command({
                type: "alarm-profile",
                home: id,
                profile: draft!,
              });
              setDraft(null);
            })
          }
        >
          Alarmierungsprofil übernehmen
        </button>
        <button disabled={draft === null} onClick={() => setDraft(null)}>
          Verwerfen
        </button>
      </fieldset>
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
    </div>
  );
}
export function FMSPanel({ s }: { s: Save }) {
  const [tab, setTab] = useState("fleet");
  const [org, setOrg] = useState<(typeof orgs)[number]>("Alle"),
    [draft, setDraft] = useState<string[] | null>(null);
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const saved =
      s.desk.definitions[org] ?? s.desk.definitions.Alle ?? fmsDefaults,
    labels = draft ?? saved;
  const dirty =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const form = useCommandForm(dirty, () => setDraft(null));
  const filtered = s.vehicles.filter((v) =>
    v.name.toLocaleLowerCase("de").includes(query.toLocaleLowerCase("de")),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 12)),
    current = Math.min(page, pages - 1);
  return (
    <div className="fms-panel">
      <p>
        Spiel-Defaultprofil, keine allgemeingültige reale Norm. Manuelle
        Funkstatuskorrekturen verändern weder Fahrweg noch Auftrag. FMS 6 sperrt
        neue Alarmierungen.
      </p>
      <nav className="section-tabs" role="tablist" aria-label="FMS-Bereiche">
        {[
          ["fleet", "Fahrzeugstatus"],
          ["definitions", "Statusdefinitionen"],
          ["alarms", "Alarmierungsprofile"],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            id={`fms-tab-${id}`}
            aria-controls={`fms-panel-${id}`}
            aria-selected={tab === id}
            onClick={() => requestDialogTransition(() => setTab(id))}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "fleet" && (
        <section
          role="tabpanel"
          id="fms-panel-fleet"
          aria-labelledby="fms-tab-fleet"
        >
          <h3>Fahrzeugstatus und Historie</h3>
          <label>
            Fahrzeug suchen
            <input
              value={query}
              onChange={(e) => {
                const value = e.target.value;
                requestDialogTransition(() => {
                  setQuery(value);
                  setPage(0);
                });
              }}
            />
          </label>
          {!filtered.length && (
            <p className="empty">Keine passenden Fahrzeuge.</p>
          )}
          {filtered.slice(current * 12, current * 12 + 12).map((v) => (
            <FmsVehicle key={v.id} s={s} id={v.id} />
          ))}
          {pages > 1 && (
            <nav className="inline" aria-label="FMS-Fahrzeugseiten">
              <button
                disabled={!current}
                onClick={() =>
                  requestDialogTransition(() => setPage(current - 1))
                }
              >
                Zurück
              </button>
              <span>
                Seite {current + 1} / {pages}
              </span>
              <button
                disabled={current === pages - 1}
                onClick={() =>
                  requestDialogTransition(() => setPage(current + 1))
                }
              >
                Weiter
              </button>
            </nav>
          )}
        </section>
      )}
      {tab === "definitions" && (
        <section
          role="tabpanel"
          id="fms-panel-definitions"
          aria-labelledby="fms-tab-definitions"
        >
          <h3>Statusdefinitionen</h3>
          <fieldset className="command-fields" disabled={form.busy}>
            <label>
              Profil für Organisation
              <select
                aria-label="Profil für Organisation"
                value={org}
                onChange={(e) => {
                  const next = e.target.value as typeof org;
                  requestDialogTransition(() => {
                    setOrg(next);
                    setDraft(null);
                  });
                }}
              >
                {orgs.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <div className="desk-form">
              {labels.map((label, i) => (
                <label key={i}>
                  FMS {i}
                  <input
                    value={label}
                    maxLength={100}
                    onChange={(e) =>
                      setDraft(
                        labels.map((l, j) => (i === j ? e.target.value : l)),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <div className="inline">
              <button
                disabled={labels.some((l) => !l.trim()) || !dirty}
                onClick={() =>
                  void form.run(async () => {
                    await command({ type: "fms-definitions", org, labels });
                    setDraft(null);
                  })
                }
              >
                FMS-Profil speichern
              </button>
              <button disabled={!dirty} onClick={() => setDraft(null)}>
                Änderungen verwerfen
              </button>
              <button onClick={() => setDraft([...fmsDefaults])}>
                FMS-Standard wiederherstellen
              </button>
            </div>
          </fieldset>
          {form.error && (
            <p className="error" role="alert">
              {form.error}
            </p>
          )}
          <small>
            Wiederherstellen lädt den Standard als Entwurf. Erst Speichern
            übernimmt ihn für die Leitstelle.
          </small>
        </section>
      )}
      {tab === "alarms" && (
        <section
          role="tabpanel"
          id="fms-panel-alarms"
          aria-labelledby="fms-tab-alarms"
        >
          <h3>Alarmierungsprofil je Wache</h3>
          {s.buildings
            .filter((b) => !["hospital", "school"].includes(b.type))
            .map((b) => (
              <AlarmProfile key={b.id} s={s} id={b.id} />
            ))}
        </section>
      )}
    </div>
  );
}
export function TeamPanel() {
  const { workspace, user } = useGame(),
    [username, setUsername] = useState(""),
    [text, setText] = useState("");
  const net = useNetwork();
  const form = useCommandForm(!!username || !!text, () => {
    setUsername("");
    setText("");
  });
  return (
    <>
      <NeighborDesk />
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <fieldset className="command-fields" disabled={form.busy}>
        <h3>Disponenten derselben Leitstelle</h3>
        <p>
          Mitglieder arbeiten nach Annahme einer Einladung am selben Bestand und
          dürfen die Spielaktionen dieser Leitstelle ausführen. Das bisherige
          eigene Multiplayer-Vermögen wird nicht gelöscht.
        </p>
        {workspace?.members.map((m) => (
          <p key={m.id}>
            {m.name}{" "}
            {m.id === workspace.owner ? (
              "· Inhaber"
            ) : (
              <button
                onClick={() =>
                  void form.run(() =>
                    command({ type: "member-remove", user: m.id }),
                  )
                }
                disabled={!workspace.canManage && m.id !== user?.id}
              >
                {m.id === user?.id
                  ? "Leitstelle verlassen"
                  : "Mitglied entfernen"}
              </button>
            )}
          </p>
        ))}
        {workspace?.canManage && (
          <div className="desk-form">
            <label>
              Bestehenden Benutzernamen einladen
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <button
              disabled={username.trim().length < 3}
              onClick={() =>
                void form.run(async () => {
                  await command({ type: "member-invite", username });
                  setUsername("");
                })
              }
            >
              Disponenten einladen
            </button>
          </div>
        )}
        {workspace?.outgoing.map((i) => (
          <p key={i.id}>
            Einladung versendet an {i.name}{" "}
            <button
              onClick={() =>
                void form.run(() =>
                  command({ type: "member-remove", user: i.id }),
                )
              }
            >
              Einladung zurückziehen
            </button>
          </p>
        ))}
        <h3>Einladungen an dich</h3>
        {!workspace?.invitations.length && <p>Keine offenen Einladungen.</p>}
        {workspace?.invitations.map((i) => (
          <p key={i.owner}>
            {i.name}
            <button
              onClick={() =>
                void form.run(() =>
                  command({ type: "member-accept", owner: i.owner }),
                )
              }
            >
              Einladung annehmen
            </button>
          </p>
        ))}
        <h3>Leitstellenfunk</h3>
        <div className="chat-log" aria-live="polite">
          {net.chat.map((m, i) => (
            <p key={i}>
              <b>{m.name}</b>: {m.text}
            </p>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            chat(text);
            setText("");
          }}
        >
          <label>
            Chatnachricht
            <input
              value={text}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <button disabled={!text.trim()}>Senden</button>
        </form>
        <small>
          Nur Disponenten derselben Leitstelle. Keine dauerhafte
          Chatspeicherung.
        </small>
      </fieldset>
    </>
  );
}
