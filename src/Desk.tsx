import { CallDesk } from "./CallDesk";
import { NeighborDesk } from "./NeighborDesk";
import { useState } from "react";
import type { Mission, Save } from "./model";
import { vehicles, vt, bt, capabilities } from "./catalog";
import { chat, useNetwork } from "./network";
import { command, useGame } from "./store";
import { useCommandForm } from "./use-command-form";
import { requestDialogTransition } from "./dialog-state";
import { createId } from "./ids";
import { duration } from "./travel";
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
import { statuses, ConfirmAction } from "./ui";
import "./Desk.css";
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
export { History } from "./IncidentHistory";
export function IncidentPanel({ s, m }: { s: Save; m: Mission }) {
  return <CallDesk s={s} focusMission={m.id} />;
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
