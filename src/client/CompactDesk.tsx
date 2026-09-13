import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp, Phone } from "lucide-react";
import type { Save } from "../shared/model";
import { incidentLoad } from "../simulation/workload";
import { visiblePriority } from "../simulation/priority";
import { missionStatus } from "../simulation/mission-status";
import { missionPresentation } from "./mission-presentation";
import { missionList } from "./workspace";
import { IncidentIcon } from "./HudIcons";
import { ReserveOverview } from "./ForceNeeds";
export type CompactDeskProps = {
  s: Save;
  selected: string;
  open: (id: string) => void;
  panel: (id: string) => void;
  readonly: boolean;
  search: string;
  setSearch: (v: string) => void;
  filter: string;
  setFilter: (v: string) => void;
  sort: string;
  setSort: (v: string) => void;
  userId?: string;
  listOpen: boolean;
  setListOpen: (v: boolean) => void;
};
/** Operational cases only. Required decisions stay in their incident details. */
export function CompactDesk({
  s,
  selected,
  open,
  panel,
  search,
  setSearch,
  filter,
  setFilter,
  sort,
  setSort,
  userId,
  listOpen,
  setListOpen,
}: CompactDeskProps) {
  const load = incidentLoad(s),
    [page, setPage] = useState(0);
  const calls = s.missions.filter((m) =>
    m.control?.calls.some((c) =>
      ["ringing", "active", "dropped"].includes(c.state),
    ),
  );
  const missions = useMemo(
    () => missionList(s, search, filter, sort, userId),
    [s, search, filter, sort, userId],
  );
  useEffect(() => setPage(0), [search, filter, sort]);
  const pages = Math.max(1, Math.ceil(missions.length / 25)),
    currentPage = Math.min(page, pages - 1);
  return (
    <section
      className="compact-desk"
      aria-label="Aktive Einsätze"
      data-collapsed={!listOpen}
    >
      <header className="compact-heading">
        <h2>
          Aktive Einsätze{" "}
          <span>
            {load.used} / {load.limit}
          </span>
        </h2>
        <button
          aria-label={
            listOpen ? "Einsatzliste einklappen" : "Einsatzliste ausklappen"
          }
          aria-expanded={listOpen}
          onClick={() => setListOpen(!listOpen)}
        >
          {listOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </header>
      {listOpen && (
        <>
          <div className="compact-toolbar">
            <span>
              {load.overloaded
                ? "Altbestand zuerst abarbeiten"
                : `${calls.length} offene Notrufvorgänge`}
            </span>
            <button onClick={() => panel("calls")}>
              <Phone size={14} />
              Notrufe
            </button>
          </div>
          <div className="preview-scroll mission-list">
            <details className="mission-filters">
              <summary>Suchen, filtern und sortieren</summary>
              <label>
                Einsätze durchsuchen
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label>
                Einsatzfilter
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  {[
                    ["all", "Alle Einsätze"],
                    ["Feuerwehr", "Feuerwehr"],
                    ["Rettungsdienst", "Rettungsdienst"],
                    ["Polizei", "Polizei"],
                    ["THW", "THW"],
                    ["critical", "Kritisch"],
                    ["major", "Großlagen / MANV"],
                    ["request", "Offene Entscheidungen"],
                    ["mine", "Von mir angenommen"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Einsatzsortierung
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {[
                    ["priority", "Priorität"],
                    ["time", "Älteste zuerst"],
                    ["distance", "Entfernung zur ersten Wache"],
                    ["escalation", "Eskalation"],
                    ["patients", "Patientenzahl"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                  setSort("priority");
                }}
              >
                Filter zurücksetzen
              </button>
              <details>
                <summary>Ressourcen und Reserve</summary>
                <ReserveOverview s={s} />
              </details>
            </details>
            {missions
              .slice(currentPage * 25, currentPage * 25 + 25)
              .map((m) => {
                const t = missionPresentation(m),
                  status = missionStatus(s, m);
                return (
                  <button
                    key={m.id}
                    className={`mission-card mission-preview${selected === m.id ? " selected" : ""}`}
                    data-mission={m.id}
                    style={{ "--incident-color": t.color } as CSSProperties}
                    onClick={() => open(m.id)}
                  >
                    <span
                      className="mission-number"
                      style={{ background: t.color }}
                    >
                      <IncidentIcon org={t.org} category={t.category} />
                    </span>
                    <span className="preview-copy">
                      <span className="preview-meta">
                        <b>{t.name}</b>
                        {m.control?.priority === "NOTFALL" && (
                          <em>! Notfall</em>
                        )}
                      </span>
                      <span className="preview-text">
                        {m.control && !m.control.locationKnown
                          ? "Einsatzort noch erfragen"
                          : m.control?.facts.find((f) => f.key === "address")
                              ?.text || "Einsatzort auf der Deutschlandkarte"}
                      </span>
                      <span
                        className="preview-status"
                        data-processing={status.code}
                        title={status.detail}
                      >
                        <span
                          className="priority-badge"
                          data-priority={visiblePriority(m.control?.priority)}
                        >
                          {visiblePriority(m.control?.priority)}
                        </span>{" "}
                        · {status.label}
                        {m.major && " · GROSSLAGE"}
                      </span>
                    </span>
                  </button>
                );
              })}
            {!missions.length && (
              <div className="preview-empty">
                <h3>
                  {s.missions.length
                    ? "Keine Einsätze passen zum Filter."
                    : "Warten auf Notruf"}
                </h3>
                <p>
                  {s.buildings.some((b) => !b.migrationReserve)
                    ? "Passende Notrufe treffen nach und nach ein, sobald Kräfte bereitstehen."
                    : "Kaufe eine reale Wache und beschaffe ein geeignetes Fahrzeug."}
                </p>
                {!s.buildings.some((b) => !b.migrationReserve) && (
                  <button onClick={() => panel("facilities")}>
                    Ersten Standort kaufen
                  </button>
                )}
              </div>
            )}
            {pages > 1 && (
              <nav className="mission-pagination" aria-label="Einsatzseiten">
                <button
                  disabled={!currentPage}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Zurück
                </button>
                <span>
                  {currentPage + 1}/{pages} · {missions.length} Einsätze
                </span>
                <button
                  disabled={currentPage + 1 >= pages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Weiter
                </button>
              </nav>
            )}
          </div>
        </>
      )}
    </section>
  );
}
