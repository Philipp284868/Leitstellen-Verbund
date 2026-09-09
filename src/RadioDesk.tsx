import { useState } from "react";
import type { Save } from "./model";
import { bt, vt } from "./catalog";
import { useGame } from "./store";
import { useNetwork } from "./network";
import { missionPresentation } from "./mission-presentation";
import { radioHandler } from "./simulation/radio-state";
import { priorityRank, visiblePriority } from "./simulation/priority";
import { duration } from "./travel";
import { RadioRequestActions } from "./RadioRequest";
import "./RadioDesk.css";
import { RadioTransmissions } from "./RadioTransmissions";

export function RadioDesk({
  s,
  onOpen,
  onArchive,
}: {
  s: Save;
  onOpen: (id: string) => void;
  onArchive: () => void;
}) {
  const { user, readonly } = useGame();
  const { support } = useNetwork();
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("open");
  const [selected, setSelected] = useState("");
  const rows = s.missions.flatMap((m) =>
    (m.control?.radio ?? []).map((r) => {
      const v =
        s.vehicles.find((v) => v.id === r.vehicle) ??
        support.find(
          (f) =>
            f.mission === m.id &&
            f.round === m.round &&
            f.vehicle.id === r.vehicle,
        )?.vehicle;
      return {
        m,
        r,
        name: v?.name ?? "Einsatzmittel nicht mehr im Bestand",
        channel:
          s.desk.fleet[r.vehicle]?.channel ||
          (v ? bt(vt(v.type).home).org : "Unbekannter Kanal"),
        title: missionPresentation(m).name,
      };
    }),
  );
  const open = rows.filter(({ r }) => r.state === "open");
  const mine = open.filter(
    ({ r }) => radioHandler(r, s.time)?.actor === user?.id,
  ).length;
  const free = open.filter(({ r }) => !radioHandler(r, s.time)).length;
  const filtered = rows
    .filter((row) => {
      const handler = radioHandler(row.r, s.time);
      return (
        (!channel || row.channel === channel) &&
        (!query.trim() ||
          `${row.title} ${row.name} ${row.r.details}`
            .toLocaleLowerCase("de")
            .includes(query.trim().toLocaleLowerCase("de"))) &&
        (status === "handled"
          ? row.r.state === "handled"
          : row.r.state === "open" &&
            (status === "mine"
              ? handler?.actor === user?.id
              : status === "free"
                ? !handler
                : true))
      );
    })
    .sort((a, b) =>
      status === "handled"
        ? b.r.answered - a.r.answered || a.r.id.localeCompare(b.r.id)
        : priorityRank(b.r.priority) - priorityRank(a.r.priority) ||
          a.r.created - b.r.created ||
          a.r.id.localeCompare(b.r.id),
    );
  // Keep a just-completed conversation visible so the operator can read the
  // answer and proceed to dispatch, even after it leaves the open queue.
  const current = rows.find(({ r }) => r.id === selected) ?? filtered[0];
  return (
    <section className="radio-workspace" aria-label="Funkarbeitsplatz">
      <p className="view-intro">
        {open.length} offen · {free} frei · {mine} bei dir. Übernahmen gelten
        drei Minuten und werden mit allen Disponenten dieser Leitstelle geteilt.
      </p>
      {readonly && (
        <p role="status">
          Verbindung unterbrochen. Funkaktionen sind bis zur Wiederverbindung
          gesperrt.
        </p>
      )}
      <div className="radio-filters">
        <label>
          Sprechwunsch suchen
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected("");
            }}
            placeholder="Fahrzeug, Einsatz oder Meldung"
          />
        </label>
        <label>
          Funkkanal
          <select
            aria-label="Funkkanal"
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value);
              setSelected("");
            }}
          >
            <option value="">Alle Kanäle</option>
            {[...new Set(rows.map((r) => r.channel))].sort().map((ch) => (
              <option key={ch}>{ch}</option>
            ))}
          </select>
        </label>
        <label>
          Bearbeitungsstand
          <select
            aria-label="Bearbeitungsstand"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setSelected("");
            }}
          >
            <option value="open">Alle offenen</option>
            <option value="free">Zur Übernahme frei</option>
            <option value="mine">Bei mir</option>
            <option value="handled">Erledigt · laufende Einsätze</option>
          </select>
        </label>
      </div>
      <div className="radio-columns">
        <div className="radio-list" aria-label="Sprechwunschliste">
          <p>
            {filtered.length} Treffer ·{" "}
            {status === "handled"
              ? "zuletzt erledigt zuerst"
              : "Priorität, danach Wartezeit"}
          </p>
          {!filtered.length && (
            <p role="status">Keine Sprechwünsche für diese Auswahl.</p>
          )}
          {filtered.map(({ m, r, name, channel: ch, title }) => (
            <button
              key={r.id}
              className="radio-row"
              aria-pressed={current?.r.id === r.id}
              onClick={() => setSelected(r.id)}
              data-priority={visiblePriority(r.priority)}
            >
              <span>
                <b>{visiblePriority(r.priority)}</b> · {name}
              </span>
              <span>
                {title} · {ch}
              </span>
              <small>FMS {s.desk.fleet[r.vehicle]?.code ?? "–"}</small>
              <small>
                {r.state === "handled"
                  ? "Erledigt"
                  : `Wartet ${duration(Math.max(0, s.time - r.created))}`}{" "}
                ·{" "}
                {r.reason === "arrival"
                  ? "Lagemeldung"
                  : r.reason === "request"
                    ? "Nachforderung"
                    : "Rückfrage"}
              </small>
              <small>
                {radioHandler(r, s.time)
                  ? radioHandler(r, s.time)?.actor === user?.id
                    ? "Bei dir"
                    : "In Bearbeitung"
                  : r.state === "open"
                    ? "Frei"
                    : ""}{" "}
                · Einsatz {m.id.slice(-8)}
              </small>
            </button>
          ))}
        </div>
        <div className="radio-conversation">
          {current ? (
            <article key={current.r.id}>
              <small>
                {visiblePriority(current.r.priority)} · {current.channel} · FMS{" "}
                {s.desk.fleet[current.r.vehicle]?.code ?? "–"}
              </small>
              <h3>{current.name}</h3>
              <p>{current.title}</p>
              <p className="radio-message">{current.r.details}</p>
              <RadioRequestActions
                s={s}
                m={current.m}
                r={current.r}
                onInteract={() => setSelected(current.r.id)}
              />
              <button className="primary" onClick={() => onOpen(current.m.id)}>
                Einsatz öffnen / weitere Kräfte disponieren
              </button>
              <p className="muted">
                Eine bearbeitete Nachforderung alarmiert noch keine Fahrzeuge.
                Wähle die weiteren Kräfte in der Einsatzdisposition aus.
              </p>
            </article>
          ) : (
            <p>
              Hier bearbeitest du Lagemeldungen, Rückfragen und Nachforderungen
              der eigenen Leitstelle.
            </p>
          )}
        </div>
      </div>
      <p>
        Abgeschlossene Einsätze mit Funkverlauf findest du im Einsatzarchiv.
      </p>
      <button onClick={onArchive}>Einsatzarchiv öffnen</button>
      <RadioTransmissions s={s} />
    </section>
  );
}
