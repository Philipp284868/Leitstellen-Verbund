import { useState } from "react";
import { useGame, act, command, emit } from "./store";
import { useNetwork, type AidView } from "./network";
import { vehicles, vt, mt } from "./catalog";
import { requestStates, taskNames } from "./simulation/organizations-schema";
import { readiness } from "./engine";
import { duration } from "./travel";
import "./Organizations.css";
function RequestCard({ r }: { r: AidView }) {
  const { save: s } = useGame(),
    [selected, setSelected] = useState<string[]>([]),
    [text, setText] = useState("");
  const net = useNetwork();
  if (!s) return null;
  const owner = r.owner === s.player.id,
    active = ["SENT", "ACCEPTED", "IN_PROGRESS"].includes(r.state),
    closed = ["DONE", "DECLINED", "CANCELLED"].includes(r.state);
  const remaining = [...r.types];
  r.assignments.forEach((a) => {
    const n = remaining.indexOf(a.type);
    if (n >= 0) remaining.splice(n, 1);
  });
  const sharedMission = net.friends
    .find((f) => f.id === r.owner)
    ?.missions.find((m) => m.id === r.mission);
  const assigned = [
    ...s.vehicles,
    ...net.friends.flatMap((f) => f.vehicles),
  ].filter((v) => r.assignments.some((a) => a.assignment === v.assignment));
  return (
    <article className="aid-card">
      <header>
        <div>
          <span className="eyebrow">
            {owner ? `An ${r.peerName}` : `Von ${r.ownerName}`} · {r.priority}
          </span>
          <h4>{r.incident?.name || "Einsatz beendet"}</h4>
        </div>
        <b>{requestStates[r.state]}</b>
      </header>
      <p>{r.message}</p>
      <p>Angefordert: {r.types.map((t) => vt(t).name).join(", ")}</p>
      <p>
        <b>
          {r.assignments.length} / {r.types.length} zugesagt
        </b>
        {remaining.length > 0 &&
          ` · Noch offen: ${remaining.map((t) => vt(t).name).join(", ")}`}
      </p>
      {assigned.map((v) => (
        <p key={v.id}>
          {v.name} ·{" "}
          {v.status === "alarmed"
            ? "Sammelt Besatzung"
            : v.status === "scene"
              ? "Vor Ort"
              : v.status === "transport"
                ? "Patiententransport"
                : "Anfahrt"}{" "}
          · FMS{" "}
          {(("fms" in v ? v.fms : s.desk.fleet[v.id]?.code) as number) ?? "–"} ·{" "}
          {duration("eta" in v ? (v.eta as number) : v.arrive - s.time)}
        </p>
      ))}
      {owner && r.state === "DRAFT" && (
        <button onClick={() => void act({ type: "aid-send", id: r.id })}>
          Anfrage verbindlich senden
        </button>
      )}
      {!owner && active && remaining.length > 0 && (
        <div className="aid-vehicles">
          <h5>Eigene Kräfte zusagen · Teilannahme möglich</h5>
          {s.vehicles
            .filter((v) => remaining.includes(v.type))
            .map((v) => (
              <label key={v.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(v.id)}
                  disabled={!!readiness(s, v)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, v.id]
                        : selected.filter((id) => id !== v.id),
                    )
                  }
                />
                <span>
                  {v.name}
                  <small>{readiness(s, v) || "Einsatzbereit"}</small>
                </span>
              </label>
            ))}
          <button
            disabled={!selected.length}
            onClick={() => {
              void act({
                type: "aid-accept",
                owner: r.owner,
                id: r.id,
                vehicles: selected,
              });
              setSelected([]);
            }}
          >
            Ausgewählte Kräfte alarmieren
          </button>
        </div>
      )}
      {sharedMission && (
        <details>
          <summary>Bestätigte Einsatzlage und Verlauf</summary>
          <p>
            {sharedMission.control?.briefed
              ? "Erkundet"
              : "Lagemeldung ausstehend"}{" "}
            · {sharedMission.phase}
          </p>
          <progress
            max={mt(sharedMission.template).seconds}
            value={sharedMission.progress}
          />
          {sharedMission.organization?.tasks.map((t) => (
            <p key={t.kind}>
              {taskNames[t.kind]} ·{" "}
              {t.done
                ? "abgeschlossen"
                : t.ordered
                  ? "beauftragt"
                  : "ausstehend"}
            </p>
          ))}
          {sharedMission.control?.events.slice(-12).map((e) => (
            <p key={e.id}>{e.text}</p>
          ))}
        </details>
      )}
      {r.messages.length > 0 && (
        <div className="aid-messages">
          {r.messages.map((m, i) => (
            <p key={i}>
              <b>{m.name}:</b> {m.text}
            </p>
          ))}
        </div>
      )}
      {active && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act({ type: "aid-message", owner: r.owner, id: r.id, text });
            setText("");
          }}
        >
          <label>
            Rückfrage oder Antwort
            <input
              aria-label={`Nachricht ${r.id}`}
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <button disabled={!text.trim() || r.messages.length >= 100}>
            Nachricht übermitteln
          </button>
        </form>
      )}
      {!closed && (
        <footer>
          {!owner && r.state === "SENT" && (
            <button
              onClick={() =>
                void act({
                  type: "aid-close",
                  owner: r.owner,
                  id: r.id,
                  op: "decline",
                })
              }
            >
              Anfrage ablehnen
            </button>
          )}
          {owner && (
            <button
              onClick={() =>
                void act({
                  type: "aid-close",
                  owner: r.owner,
                  id: r.id,
                  op: "cancel",
                })
              }
            >
              Anfrage zurückziehen
            </button>
          )}
          {["ACCEPTED", "IN_PROGRESS"].includes(r.state) && (
            <button
              onClick={() =>
                void act({
                  type: "aid-close",
                  owner: r.owner,
                  id: r.id,
                  op: "done",
                })
              }
            >
              Unterstützung beenden
            </button>
          )}
        </footer>
      )}
    </article>
  );
}
export function NeighborDesk() {
  const { save: s, mode } = useGame(),
    net = useNetwork();
  const [peer, setPeer] = useState(""),
    [mission, setMission] = useState(""),
    [type, setType] = useState("dlk"),
    [types, setTypes] = useState<string[]>([]),
    [message, setMessage] = useState(""),
    [priority, setPriority] = useState<AidView["priority"]>("NORMAL"),
    [archive, setArchive] = useState(false),
    [compose, setCompose] = useState(false),
    [pending, setPending] = useState(false);
  if (!s || mode !== "multi") return null;
  const validMissions = s.missions.filter(
    (m) => m.control?.locationKnown && m.control.reportedTemplate,
  );
  const requests = net.requests.filter(
    (r) => archive || !["DONE", "DECLINED", "CANCELLED"].includes(r.state),
  );
  return (
    <section className="neighbor-desk" aria-label="Nachbarleitstellen">
      <h3>Leitstellenverbund · Nachbarleitstellen</h3>
      <p>
        Neue Einsätze werden nicht automatisch geteilt. Eine Zusage alarmiert
        ausschließlich die ausgewählten Kräfte. Wachen, Guthaben und andere
        Einsätze bleiben getrennt. Auch bei geschlossenem Browser läuft
        angenommene Hilfe weiter.
      </p>
      <details
        open={compose}
        onToggle={(e) => setCompose(e.currentTarget.open)}
      >
        <summary>Neue Unterstützungsanfrage</summary>
        <div className="org-form">
          <label>
            Nachbarleitstelle
            <select
              aria-label="Nachbarleitstelle"
              value={peer}
              onChange={(e) => setPeer(e.target.value)}
            >
              <option value="">Bitte auswählen</option>
              {net.neighbors.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.online ? "Online" : "Offline"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Eigener Einsatz
            <select
              aria-label="Eigener Einsatz"
              value={mission}
              onChange={(e) => setMission(e.target.value)}
            >
              <option value="">Bitte auswählen</option>
              {validMissions.map((m) => (
                <option key={m.id} value={m.id}>
                  {mt(m.control!.reportedTemplate!).name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priorität
            <select
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as AidView["priority"])
              }
            >
              {["NORMAL", "DRINGEND", "PRIORITÄT", "NOTFALL"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Gewünschter Fahrzeugtyp
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          disabled={types.length >= 20}
          onClick={() => setTypes([...types, type])}
        >
          Fahrzeug zur Anforderung hinzufügen
        </button>
        <div className="inline">
          {types.map((t, i) => (
            <button
              key={i}
              onClick={() => setTypes(types.filter((_, n) => n !== i))}
            >
              {vt(t).name} ×
            </button>
          ))}
        </div>
        <label>
          Anfragetext
          <textarea
            value={message}
            maxLength={1000}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Was wird vor Ort benötigt?"
          />
        </label>
        <button
          disabled={
            pending || !peer || !mission || !types.length || !message.trim()
          }
          onClick={() => {
            setPending(true);
            void command({
              type: "aid-draft",
              peer,
              mission,
              types,
              priority,
              message,
            })
              .then(() => {
                setTypes([]);
                setMessage("");
                setCompose(false);
              })
              .catch((e) => emit({ error: e.message }))
              .finally(() => setPending(false));
          }}
        >
          Entwurf anlegen
        </button>
        <small>
          Der Entwurf ist nur in deiner Leitstelle sichtbar. Anschließend
          ausdrücklich senden.
        </small>
      </details>
      <label className="inline">
        <input
          type="checkbox"
          checked={archive}
          onChange={(e) => setArchive(e.target.checked)}
        />
        Abgeschlossene Anfragen anzeigen
      </label>
      {!requests.length && (
        <p className="empty">Keine offenen Unterstützungsanfragen.</p>
      )}
      {[...requests]
        .sort((a, b) => b.updated - a.updated)
        .map((r) => (
          <RequestCard key={r.id} r={r} />
        ))}
    </section>
  );
}
