import { NeighborDesk } from "./NeighborDesk";
import { OperationsOverview } from "./Major";
import { effectiveSkills } from "./simulation/major-resources";
import { DynamicsPanel } from "./Dynamics";
import { travelNames } from "./simulation/traffic";
import type { TravelMode } from "./simulation/dynamics-schema";
import { useEffect, useState } from "react";
import type { Mission, Save } from "./model";
import { vehicles, vt, bt, mt, capabilities } from "./catalog";
import { readiness, capacity, missing } from "./engine";
import { chat, useNetwork } from "./network";
import { act, useGame } from "./store";
import { createId } from "./ids";
import { approach, duration, tripLabel } from "./travel";
import {
  fmsDefaults,
  fmsName,
  alarmNames,
  operativeCode,
} from "./simulation/fms";
import {
  questionLabels,
  questionsFor,
  type Question,
} from "./simulation/calls";
import type { AAO, Alarm, Priority } from "./simulation/schema";
import { statuses } from "./ui";
import "./Desk.css";
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
const priorities: Priority[] = ["NORMAL", "DRINGEND", "PRIORITÄT", "NOTFALL"];
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
  const calls = s.missions.flatMap((m) =>
    (m.control?.calls ?? [])
      .filter(
        (c) =>
          c.state === "ringing" ||
          c.state === "dropped" ||
          c.state === "active",
      )
      .map((c) => ({ m, c })),
  );
  const radio = s.missions
    .flatMap((m) =>
      (m.control?.radio ?? [])
        .filter((r) => r.state === "open")
        .map((r) => ({ m, r })),
    )
    .sort(
      (a, b) =>
        priorities.indexOf(b.r.priority) - priorities.indexOf(a.r.priority) ||
        a.r.created - b.r.created,
    );
  return (
    <section className="desk-queue" aria-label="Notruf und Funk">
      <OperationsOverview s={s} open={open} />
      <div className="desk-tools">
        <button onClick={() => panel("aaos")}>AAO</button>
        <button onClick={() => panel("fms")}>FMS / Funkstatus</button>
      </div>
      <strong>Notrufe · {calls.length}</strong>
      {!calls.length && <small>Keine offenen Gespräche.</small>}
      {calls.map(({ m, c }) => (
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
      <strong>Funk · {radio.length} offen</strong>
      {radio.map(({ m, r }) => (
        <button className="radio-request" key={r.id} onClick={() => open(m.id)}>
          <b>{r.priority} · Sprechwunsch</b>
          <small>{r.details}</small>
        </button>
      ))}
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
    <details className="incident-history" open={m.phase === "done"}>
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
function Calls({ s, m }: { s: Save; m: Mission }) {
  const { user } = useGame(),
    c = m.control!;
  const [selected, setSelected] = useState(
    c.calls.find((c) => c.state !== "ended")?.id ?? c.calls[0]?.id,
  );
  const call = c.calls.find((x) => x.id === selected);
  if (!call) return null;
  const own = call.actor === user?.id;
  const waiting = Math.max(0, call.nextAnswer - s.time);
  return (
    <section className="call-conversation" aria-label="Notrufgespräch">
      <h3>Notrufgespräch</h3>
      <div className="inline">
        {c.calls.map((x, i) => (
          <button
            key={x.id}
            aria-pressed={selected === x.id}
            onClick={() => setSelected(x.id)}
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
          call.duration + (call.state === "active" ? s.time - call.started : 0),
        )}
      </p>
      <div className="call-properties">
        <span>Stress {call.stress}%</span>
        <span>Informationsqualität {call.quality}%</span>
        <span>Glaubwürdigkeit {call.credibility}%</span>
        <span>Rückruf {call.callback ? "möglich" : "nicht möglich"}</span>
      </div>
      {call.state === "ringing" && (
        <button
          className="primary"
          onClick={() =>
            void act({
              type: "call",
              mission: m.id,
              call: call.id,
              op: "accept",
            })
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
              void act({
                type: "call",
                mission: m.id,
                call: call.id,
                op: "callback",
              })
            }
          >
            Anrufer zurückrufen
          </button>
        )}
      {call.state === "active" && !own && (
        <p>
          Ein anderer Disponent bearbeitet das Gespräch.{" "}
          <button
            disabled={s.time - Math.max(call.started, call.nextAnswer) < 60}
            onClick={() =>
              void act({
                type: "call",
                mission: m.id,
                call: call.id,
                op: "accept",
              })
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
                    void act({
                      type: "call",
                      mission: m.id,
                      call: call.id,
                      op: "ask",
                      question: q,
                    })
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
              void act({
                type: "call",
                mission: m.id,
                call: call.id,
                op: "end",
              })
            }
          >
            Gespräch beenden
          </button>
        </>
      )}
    </section>
  );
}
export function IncidentPanel({ s, m }: { s: Save; m: Mission }) {
  const c = m.control!;
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
  const proposal = c.proposal;
  useEffect(() => {
    if (proposal) setSelected(proposal.vehicles);
  }, [proposal?.id]); // A fresh server proposal is an editable selection, never an alarm.
  const selectedReady = selected.filter((id) => {
    const v = s.vehicles.find((v) => v.id === id);
    return v && !readiness(s, v);
  });
  const chosen = s.vehicles.filter((v) => selectedReady.includes(v.id)),
    skills = { ...capacity(s, m.id) };
  for (const v of chosen)
    for (const [k, n] of Object.entries(vt(v.type).skills))
      skills[k] = (skills[k] || 0) + n;
  for (const f of support.filter(
    (f) =>
      f.vehicle.status === "scene" &&
      (!f.vehicle.fault || f.vehicle.fault.state === "repaired"),
  ))
    for (const [k, n] of Object.entries(effectiveSkills(m, f.vehicle)))
      skills[k] = (skills[k] || 0) + n;
  const deficits = new Map(missing(m, skills));
  const selectedAAO = s.desk.aaos.find((x) => x.id === aao);
  for (const [key, n] of Object.entries(selectedAAO?.skills ?? {})) {
    const shortfall = n - (skills[key] ?? 0);
    if (shortfall > 0)
      deficits.set(key, Math.max(deficits.get(key) ?? 0, shortfall));
  }
  const deficit = [...deficits];
  return (
    <div className="incident-desk">
      <span className="eyebrow">
        {c.priority} · {stages[c.stage]} · Einsatz {m.id.slice(-8)}
      </span>
      <h2>{mt(m.template).name}</h2>
      {c.locationKnown && (
        <label>
          Dispositionspriorität
          <select
            aria-label="Dispositionspriorität"
            value={c.priority}
            onChange={(e) =>
              void act({
                type: "mission-priority",
                mission: m.id,
                priority: e.target.value as Priority,
              })
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
      <Calls s={s} m={m} />
      <section>
        <h3>Bekannte Informationen</h3>
        {!c.facts.length && (
          <p>
            Noch keine Angaben erfragt. Ort und Meldebild reichen für eine erste
            Disposition.
          </p>
        )}
        <ul className="known-facts">
          {c.facts.map((f, i) => (
            <li key={i}>
              <b>{f.confidence}</b> · {f.text}
            </li>
          ))}
        </ul>
      </section>
      <DynamicsPanel s={s} m={m} />
      {c.radio.some((r) => r.state === "open") && (
        <section className="radio-queue">
          <h3>Sprechwünsche und Lagemeldungen</h3>
          {c.radio
            .filter((r) => r.state === "open")
            .map((r) => (
              <article key={r.id}>
                <b>
                  {r.priority} ·{" "}
                  {s.vehicles.find((v) => v.id === r.vehicle)?.name ||
                    support.find((f) => f.vehicle.id === r.vehicle)?.vehicle
                      .name}
                </b>
                <p>{r.details}</p>
                <div className="inline">
                  {r.reason === "arrival" && (
                    <button
                      className="primary"
                      onClick={() =>
                        void act({
                          type: "radio",
                          mission: m.id,
                          id: r.id,
                          op: "report",
                        })
                      }
                    >
                      Lagemeldung aufnehmen
                    </button>
                  )}
                  <button
                    onClick={() =>
                      void act({
                        type: "radio",
                        mission: m.id,
                        id: r.id,
                        op: "question",
                      })
                    }
                  >
                    Rückfrage zur Lage
                  </button>
                  <button
                    onClick={() =>
                      void act({
                        type: "radio",
                        mission: m.id,
                        id: r.id,
                        op: "request",
                      })
                    }
                  >
                    Nachforderung bearbeiten
                  </button>
                  <button
                    onClick={() =>
                      void act({
                        type: "radio",
                        mission: m.id,
                        id: r.id,
                        op: "close",
                      })
                    }
                  >
                    Sprechwunsch erledigen
                  </button>
                </div>
              </article>
            ))}
        </section>
      )}
      {c.locationKnown && c.reportedTemplate && m.phase !== "done" && (
        <section>
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
              ? "Bedarf nach Erkundung"
              : "Vorläufiger Bedarf aus dem Meldebild; Erkundung kann weitere Kräfte ergeben."}
          </p>
          <p className={deficit.length ? "warning" : "good"}>
            {deficit.length
              ? deficit
                  .map(([k, n]) => `${capabilities[k] || k}: ${n} fehlen`)
                  .join(" · ")
              : "Bekannte Anforderungen durch Auswahl und Kräfte vor Ort gedeckt."}
          </p>
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
                void act({ type: "aao-propose", mission: m.id, aao })
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
                value={priority}
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
                    disabled={!!readiness(s, v)}
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
                      {v.name} · FMS{" "}
                      {s.desk.fleet[v.id]?.code ?? operativeCode(v)}
                    </b>
                    <small>
                      {readiness(s, v) ||
                        `Einsatzbereit · ${approach(s, v, m.pos, travel)}`}
                    </small>
                  </span>
                </label>
              ))}
          </div>
          <button
            className="primary"
            disabled={!selectedReady.length}
            onClick={() => {
              void act({
                type: "dispatch",
                travel,
                mission: m.id,
                vehicles: selectedReady,
                priority,
                alarm: alarm || undefined,
              });
              setSelected([]);
            }}
          >
            Alarmieren ({selectedReady.length})
          </button>
        </section>
      )}
      <section>
        <h3>Eingesetzte Fahrzeuge</h3>
        {support.map((f) => (
          <p key={f.assignment}>
            <b>{f.vehicle.name} · Nachbarleitstelle</b> ·{" "}
            {statuses[f.vehicle.status]} · {tripLabel(f.vehicle, s.time)}
          </p>
        ))}
        {s.vehicles
          .filter((v) => v.mission === m.id)
          .map((v) => (
            <p key={v.id}>
              <b>
                {v.name} · FMS {s.desk.fleet[v.id]?.code ?? operativeCode(v)}
              </b>{" "}
              · {statuses[v.status]} ·{" "}
              {v.status === "alarmed"
                ? `Ausrücken in ${duration(v.depart - s.time)}`
                : tripLabel(v, s.time)}
            </p>
          ))}
        <progress value={m.progress} max={mt(m.template).seconds} />
        <small>
          {c.briefed
            ? "Einsatzfortschritt"
            : "Weitere Angaben nach der ersten Erkundung"}
        </small>
      </section>
      <History s={s} m={m} />
    </div>
  );
}
const newAAO = (): AAO => ({
  id: createId(),
  name: "Neue AAO",
  keyword: "B1",
  level: 1,
  org: "Alle",
  types: ["tsf"],
  skills: {},
  priority: "NORMAL",
  alarm: "dme",
});
export function AAOPanel({ s }: { s: Save }) {
  const [a, setA] = useState<AAO>(newAAO);
  return (
    <div className="aao-editor">
      <p>
        Eine AAO erstellt einen verfügbaren Fahrzeugvorschlag. Alarmiert wird
        erst nach deiner Bestätigung.
      </p>
      <div className="inline">
        <button onClick={() => setA(newAAO())}>Neue AAO</button>
        {s.desk.aaos.map((x) => (
          <button key={x.id} onClick={() => setA(structuredClone(x))}>
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
            onChange={(e) => setA({ ...a, org: e.target.value as AAO["org"] })}
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
            value={a.priority}
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
            !a.types.length ||
            a.types.length > 30 ||
            !a.name.trim() ||
            !a.keyword.trim()
          }
          onClick={() => void act({ type: "aao-save", aao: a })}
        >
          AAO speichern
        </button>
        <button
          disabled={!s.desk.aaos.some((x) => x.id === a.id)}
          onClick={() => {
            void act({ type: "aao-delete", id: a.id });
            setA(newAAO());
          }}
        >
          AAO löschen
        </button>
      </div>
    </div>
  );
}
function FmsVehicle({ s, id }: { s: Save; id: string }) {
  const v = s.vehicles.find((v) => v.id === id)!,
    f = s.desk.fleet[id];
  const [code, setCode] = useState(f?.code ?? operativeCode(v)),
    [reason, setReason] = useState("");
  return (
    <article className="fms-vehicle">
      <b>
        {v.name} · FMS {f?.code ?? operativeCode(v)}
      </b>
      <p>
        Letzter Wechsel vor {duration(s.time - (f?.changed ?? s.time))}.
        Fahrzeugbindung: {statuses[v.status]} · Kanal{" "}
        {f?.channel ?? bt(vt(v.type).home).org}
      </p>
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
        onClick={() => void act({ type: "fms", vehicle: id, code, reason })}
      >
        Statuskorrektur bestätigen
      </button>
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
export function FMSPanel({ s }: { s: Save }) {
  const [org, setOrg] = useState<(typeof orgs)[number]>("Alle"),
    [labels, setLabels] = useState(s.desk.definitions.Alle ?? fmsDefaults);
  return (
    <>
      <p>
        Spiel-Defaultprofil, keine allgemeingültige reale Norm. Manuelle
        Funkstatuskorrekturen verändern weder Fahrweg noch Auftrag. FMS 6 sperrt
        neue Alarmierungen.
      </p>
      {s.vehicles.map((v) => (
        <FmsVehicle key={v.id} s={s} id={v.id} />
      ))}
      <h3>Statusdefinitionen</h3>
      <label>
        Profil für Organisation
        <select
          aria-label="Profil für Organisation"
          value={org}
          onChange={(e) => {
            const o = e.target.value as typeof org;
            setOrg(o);
            setLabels(
              s.desk.definitions[o] ?? s.desk.definitions.Alle ?? fmsDefaults,
            );
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
                setLabels(labels.map((l, j) => (i === j ? e.target.value : l)))
              }
            />
          </label>
        ))}
      </div>
      <button
        disabled={labels.some((l) => !l.trim())}
        onClick={() => void act({ type: "fms-definitions", org, labels })}
      >
        FMS-Profil speichern
      </button>
      <h3>Alarmierungsprofil je Wache</h3>
      {s.buildings.map((b) => (
        <label key={b.id}>
          {b.name}
          <select
            value={s.desk.alarms[b.id] ?? "dme"}
            onChange={(e) =>
              void act({
                type: "alarm-profile",
                home: b.id,
                profile: e.target.value as Alarm,
              })
            }
          >
            {Object.entries(alarmNames).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </>
  );
}
export function TeamPanel() {
  const { workspace, user, mode } = useGame(),
    [username, setUsername] = useState(""),
    [text, setText] = useState("");
  const net = useNetwork();
  if (mode === "single")
    return (
      <p>
        Einzelspieler ist eine eigene private Spielwelt. Gemeinsame Disposition
        steht im Multiplayer zur Verfügung.
      </p>
    );
  return (
    <>
      <NeighborDesk />
      <h3>Disponenten derselben Leitstelle</h3>
      <p>
        Mitglieder arbeiten nach Annahme einer Einladung am selben Bestand und
        dürfen die Spielaktionen dieser Leitstelle ausführen. Eigene
        Einzelspielerstände und das bisherige eigene Multiplayer-Vermögen werden
        nicht gelöscht.
      </p>
      {workspace?.members.map((m) => (
        <p key={m.id}>
          {m.name}{" "}
          {m.id === workspace.owner ? (
            "· Inhaber"
          ) : (
            <button
              onClick={() => void act({ type: "member-remove", user: m.id })}
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
            onClick={() => void act({ type: "member-invite", username })}
          >
            Disponenten einladen
          </button>
        </div>
      )}
      {workspace?.outgoing.map((i) => (
        <p key={i.id}>
          Einladung versendet an {i.name}{" "}
          <button
            onClick={() => void act({ type: "member-remove", user: i.id })}
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
            onClick={() => void act({ type: "member-accept", owner: i.owner })}
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
        Nur Disponenten derselben Leitstelle. Keine dauerhafte Chatspeicherung.
      </small>
    </>
  );
}
