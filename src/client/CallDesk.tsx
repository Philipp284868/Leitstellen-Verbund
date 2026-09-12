import { useState } from "react";
import type { Save } from "../shared/model";
import { useGame } from "./store";
import { CallConversation } from "./CallConversation";
import { missionPresentation } from "./mission-presentation";
import { priorityRank, visiblePriority } from "../simulation/priority";
import { duration } from "../shared/travel";
import "./RadioDesk.css";
import "./CallDesk.css";
import { DispatchPanel } from "./DispatchPanel";
import { IncidentData } from "./IncidentData";
import { IncidentOperations } from "./IncidentOperations";
import { requestDialogTransition } from "./dialog-state";

export function CallDesk({
  s,
  focusMission,
}: {
  s: Save;
  focusMission?: string;
}) {
  const { user, readonly, workspace } = useGame();
  const [selected, setSelected] = useState("");
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const rows = s.missions
    .filter((m) => !focusMission || m.id === focusMission)
    .flatMap((m) => (m.control?.calls ?? []).map((c) => ({ m, c })));
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
  const mission = current?.m ?? s.missions.find((m) => m.id === focusMission);
  return (
    <section
      className="radio-workspace call-workspace incident-desk"
      aria-label="Notrufarbeitsplatz"
      data-hud-section="details"
    >
      <p>
        Notruf und Disposition · Gespräch fortsetzen und passende Kräfte
        frühzeitig alarmieren.
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
              const value = e.target.value;
              requestDialogTransition(() => {
                setQuery(value);
                setSelected("");
              });
            }}
          />
        </label>
        <label>
          Gesprächsfilter
          <select
            value={filter}
            onChange={(e) => {
              const value = e.target.value;
              requestDialogTransition(() => {
                setFilter(value);
                setSelected("");
              });
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
      <div className="call-grid">
        <div
          className="radio-list call-list"
          role="region"
          aria-label="Notrufliste"
        >
          <h3>Wartende Anrufe</h3>
          {filtered.length === 0 && <p>Keine passenden Gespräche.</p>}
          {filtered.map(({ m, c }) => (
            <button
              className="radio-row"
              key={c.id}
              aria-pressed={current?.c.id === c.id}
              onClick={() => requestDialogTransition(() => setSelected(c.id))}
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
                Eingang{" "}
                {new Date(c.created * 1000).toLocaleTimeString("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {m.control!.locationKnown ? "Ort bestimmt" : "Ort offen"}
                <br />
                {c.caller} · seit {duration(s.time - c.created)}
                {c.state === "active"
                  ? ` · ${workspace?.members.find((u) => u.id === c.actor)?.name ?? "Disponent"}`
                  : ""}
              </small>
            </button>
          ))}
        </div>
        {current && (
          <div className="radio-conversation call-active">
            <CallConversation
              key={current.m.id}
              s={s}
              m={current.m}
              callId={current.c.id}
              onSelect={setSelected}
            />
          </div>
        )}
        {mission && (
          <>
            <IncidentData s={s} m={mission} callId={current?.c.id} />
            <DispatchPanel key={mission.id} s={s} m={mission} />
          </>
        )}
      </div>
      {mission && <IncidentOperations s={s} m={mission} />}
    </section>
  );
}
