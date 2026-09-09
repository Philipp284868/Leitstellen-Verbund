import { useState } from "react";
import type { Save } from "./model";
import { useGame } from "./store";
import { CallConversation } from "./CallConversation";
import { missionPresentation } from "./mission-presentation";
import { priorityRank, visiblePriority } from "./simulation/priority";
import { duration } from "./travel";
import "./RadioDesk.css";

export function CallDesk({
  s,
  onOpen,
}: {
  s: Save;
  onOpen: (id: string) => void;
}) {
  const { user, readonly, workspace } = useGame();
  const [selected, setSelected] = useState("");
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const rows = s.missions.flatMap((m) =>
    (m.control?.calls ?? []).map((c) => ({ m, c })),
  );
  const callback = (row: (typeof rows)[number]) =>
    row.c.callback &&
    (row.c.state === "dropped" ||
      (row.c.state === "ended" &&
        (!row.m.control?.locationKnown || !row.m.control.reportedTemplate)));
  const filtered = rows
    .filter(
      (row) =>
        (filter === "all" ||
          (filter === "mine"
            ? row.c.state === "active" && row.c.actor === user?.id
            : filter === "callback"
              ? callback(row)
              : ["ringing", "active"].includes(row.c.state) ||
                callback(row))) &&
        `${missionPresentation(row.m).name} ${row.c.caller} ${row.m.control?.facts.map((f) => f.text).join(" ")}`
          .toLocaleLowerCase("de")
          .includes(query.toLocaleLowerCase("de")),
    )
    .sort(
      (a, b) =>
        Number(b.c.state === "active" && b.c.actor === user?.id) -
          Number(a.c.state === "active" && a.c.actor === user?.id) ||
        priorityRank(b.m.control?.priority) -
          priorityRank(a.m.control?.priority) ||
        a.c.created - b.c.created ||
        a.c.id.localeCompare(b.c.id),
    );
  const current = rows.find((row) => row.c.id === selected) ?? filtered[0];
  return (
    <section className="radio-workspace" aria-label="Notrufarbeitsplatz">
      <p>
        Wartende Gespräche, eigene Bearbeitung und offene Rückrufe. Angaben
        bleiben bei Übergabe, Wiederverbindung und Serverneustart erhalten.
      </p>
      {readonly && (
        <p role="status">
          Verbindung unterbrochen. Gesprächsaktionen sind gesperrt.
        </p>
      )}
      <div className="radio-filters">
        <label>
          Notruf suchen
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected("");
            }}
          />
        </label>
        <label>
          Gesprächsfilter
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected("");
            }}
          >
            <option value="open">Offene Gespräche</option>
            <option value="mine">Bei mir</option>
            <option value="callback">Rückruf offen</option>
            <option value="all">Alle · laufende Einsätze</option>
          </select>
        </label>
        <p>
          {rows.filter((r) => r.c.state === "ringing").length} wartend ·{" "}
          {rows.filter(callback).length} Rückrufe
        </p>
      </div>
      <div className="radio-columns">
        <div className="radio-list" role="region" aria-label="Notrufliste">
          {filtered.length === 0 && <p>Keine passenden Gespräche.</p>}
          {filtered.map(({ m, c }) => (
            <button
              className="radio-row"
              key={c.id}
              aria-pressed={current?.c.id === c.id}
              onClick={() => setSelected(c.id)}
            >
              <strong>{missionPresentation(m).name}</strong>
              <span>
                {visiblePriority(m.control!.priority)} ·{" "}
                {c.state === "ringing"
                  ? "Wartet auf Annahme"
                  : c.state === "active"
                    ? "Gespräch läuft"
                    : c.state === "dropped"
                      ? "Abgebrochen"
                      : "Beendet"}
              </span>
              <small>
                {c.caller} · seit {duration(s.time - c.created)}
                {c.state === "active"
                  ? ` · ${workspace?.members.find((u) => u.id === c.actor)?.name ?? "Disponent"}`
                  : ""}
              </small>
            </button>
          ))}
        </div>
        {current && (
          <div className="radio-conversation">
            <CallConversation
              key={current.m.id}
              s={s}
              m={current.m}
              callId={current.c.id}
              onSelect={setSelected}
            />
            <h3>Erfasste Angaben</h3>
            {!current.m.control?.facts.length && (
              <p>Noch keine Angaben erfragt.</p>
            )}
            {current.m.control?.facts.map((fact, i) => (
              <p className="radio-message" key={i}>
                {fact.text}
                <br />
                <small>
                  {fact.confidence} ·{" "}
                  {fact.source === current.c.id
                    ? "Dieses Gespräch"
                    : "Weitere Quelle"}
                </small>
              </p>
            ))}
            <button onClick={() => onOpen(current.m.id)}>
              Einsatz und Disposition öffnen
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
