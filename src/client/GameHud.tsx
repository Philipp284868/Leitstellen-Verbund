import { Radio, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EventLog } from "./EventLog";
import { requestDialogTransition } from "./dialog-state";
import { ReserveOverview } from "./ForceNeeds";
import { MapView } from "./germany/GermanyMap";
import { IncidentIcon } from "./HudIcons";
import { IncidentDock } from "./IncidentDock";
import { missionPresentation, missionProgress } from "./mission-presentation";
import type { Save } from "../shared/model";
import { useNetwork, usePresence } from "./network";
import { missionStatus } from "../simulation/mission-status";
import { visiblePriority } from "../simulation/priority";
import { Topbar } from "./Topbar";
import { duration } from "../shared/travel";
import { missionList } from "./workspace";
type Props = {
  s: Save;
  selected: string;
  open: (id: string) => void;
  setModal: (panel: string) => void;
  readonly: boolean;
  notice: string;
  onMenu: () => void;
  detail: ReactNode;
  showDetail: boolean;
  onCloseDetail: () => void;
  onCloseDetailKeepSelection: () => void;
  search: string;
  setSearch: (value: string) => void;
  filter: string;
  setFilter: (value: string) => void;
  sort: string;
  setSort: (value: string) => void;
  userId?: string;
  listOpen: boolean;
  setListOpen: (value: boolean) => void;
  activePanel: string;
};
export function GameHud({
  s,
  selected,
  open,
  setModal,
  readonly,
  onMenu,
  detail,
  showDetail,
  onCloseDetail,
  onCloseDetailKeepSelection,
  search,
  setSearch,
  filter,
  setFilter,
  sort,
  setSort,
  userId,
  listOpen,
  setListOpen,
  activePanel,
}: Props) {
  const net = useNetwork(),
    user = { id: userId };
  const hasStation = s.buildings.some((b) => b.owner === s.player.id);
  const hasVehicle = s.vehicles.some((v) => v.owner === s.player.id);
  const alarmable = s.vehicles.some(
    (v) => v.owner === s.player.id && v.availability?.alarmable,
  );
  const presence = usePresence();
  const [layers, setLayers] = useState(false);
  const working = !!activePanel && activePanel !== "mission";
  useEffect(() => {
    if (working) {
      setLayers(false);
      setListOpen(false);
    }
  }, [working, setListOpen]);
  useEffect(() => {
    if (showDetail) setLayers(false);
  }, [showDetail, selected]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        working ||
        showDetail
      )
        return;
      if (layers || listOpen) {
        event.preventDefault();
        setLayers(false);
        setListOpen(false);
        document
          .querySelector<HTMLElement>('.topbar [aria-label="Leitstellenmenü"]')
          ?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [layers, listOpen, working, showDetail, setListOpen]);
  const [tab, setTab] = useState("details");
  const [page, setPage] = useState(0);
  const listedMissions = missionList(s, search, filter, sort, user?.id);
  const pages = Math.max(1, Math.ceil(listedMissions.length / 25));
  const currentPage = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [search, filter, sort]);
  const dock = useRef<HTMLElement>(null);
  useEffect(() => setTab("details"), [selected]);
  const [workTab, setWorkTab] = useState("missions");
  const calls = s.missions.flatMap((m) =>
    (m.control?.calls ?? [])
      .filter((c) => ["ringing", "active", "dropped"].includes(c.state))
      .map((c) => ({ m, c })),
  );
  const focusSection = (section: string) => {
    setTab(section);
    if (section === "history") {
      const history =
        dock.current?.querySelector<HTMLDetailsElement>(".incident-history");
      if (history) history.open = true;
    }
    const target = dock.current?.querySelector<HTMLElement>(
      `[data-hud-section="${section}"]`,
    );
    (
      target ??
      (section === "radio"
        ? dock.current?.querySelector<HTMLElement>(
            '[data-hud-section="arrival"]',
          )
        : null) ??
      dock.current?.querySelector<HTMLElement>(".incident-desk")
    )?.scrollIntoView({ block: "start", behavior: "instant" });
  };
  const choose = (id: string) =>
    requestDialogTransition(() => {
      setLayers(false);
      open(id);
      setTab("details");
    });
  return (
    <div
      className="hud-shell"
      data-list-open={listOpen && !working}
      data-detail-open={showDetail}
      data-map-tools={layers && !working}
    >
      <Topbar
        s={s}
        onMenu={onMenu}
        panel={setModal}
        onSearch={() => {
          setLayers(true);
          setListOpen(false);
          onCloseDetailKeepSelection();
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLInputElement>(
                '[aria-label="Karte durchsuchen"]',
              )
              ?.focus(),
          );
        }}
      />
      <main className="map-column">
        <MapView
          s={s}
          selected={selected}
          onSelect={choose}
          inspectionsHidden={working || showDetail}
          onInspect={() => {
            setListOpen(false);
            setLayers(false);
            onCloseDetail();
          }}
          readonly={readonly}
          friends={net.friends}
          presence={presence.ready ? presence.players : []}
          ownDeskId={s.player.id}
        />
      </main>
      <div className="workspace">
        <aside className="mission-sidebar" aria-label="Einsätze">
          <header className="worklist-heading">
            <div role="tablist" aria-label="Arbeitsliste">
              <button
                role="tab"
                aria-selected={workTab === "missions"}
                onClick={() => setWorkTab("missions")}
              >
                Einsätze <b>{s.missions.length}</b>
              </button>
              <button
                role="tab"
                aria-selected={workTab === "calls"}
                onClick={() => setWorkTab("calls")}
              >
                Notrufe <b>{calls.length}</b>
              </button>
            </div>
            <button
              aria-label="Arbeitsliste einklappen"
              onClick={() => setListOpen(false)}
            >
              <X size={16} />
            </button>
          </header>
          {workTab === "calls" ? (
            <div className="left-call-list">
              {calls.map(({ m, c }) => (
                <button key={c.id} onClick={() => open(m.id)}>
                  <b>
                    {c.state === "ringing"
                      ? "Wartender Notruf"
                      : c.state === "active"
                        ? "Im Gespräch"
                        : "Rückruf prüfen"}
                  </b>
                  <span>{missionPresentation(m).name}</span>
                  <small>
                    {new Date(c.created * 1000).toLocaleTimeString("de-DE")}
                  </small>
                </button>
              ))}
              {!calls.length && <p>Keine wartenden Notrufe.</p>}
            </div>
          ) : (
            <>
              <details className="mission-filters">
                <summary>Suchen, filtern und sortieren</summary>
                <label>
                  Einsätze durchsuchen
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Einsatz, Ort, Fahrzeug, Patient …"
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
                      ["request", "Offene Sprechwünsche"],
                      ["mine", "Von mir angenommen"],
                    ].map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Einsatzsortierung
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    {[
                      ["priority", "Priorität"],
                      ["time", "Älteste zuerst"],
                      ["distance", "Entfernung zur ersten Wache"],
                      ["escalation", "Eskalation"],
                      ["patients", "Patientenzahl"],
                    ].map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
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
              </details>
              <div className="org-filters" aria-label="Organisationen">
                {["all", "Feuerwehr", "Rettungsdienst", "Polizei"].map(
                  (org) => (
                    <button
                      key={org}
                      aria-pressed={filter === org}
                      onClick={() => setFilter(org)}
                    >
                      {org === "all"
                        ? "Alle"
                        : org === "Rettungsdienst"
                          ? "Rettung"
                          : org}
                      <b>
                        {org === "all"
                          ? s.missions.length
                          : s.missions.filter(
                              (m) => missionPresentation(m).org === org,
                            ).length}
                      </b>
                    </button>
                  ),
                )}
              </div>
              {!!s.vehicles.length && (
                <details>
                  <summary>Ressourcen und Reserve</summary>
                  <ReserveOverview s={s} />
                </details>
              )}
              <div className="mission-list">
                {listedMissions
                  .slice(currentPage * 25, (currentPage + 1) * 25)
                  .map((m) => {
                    const t = missionPresentation(m),
                      progress = missionProgress(m),
                      processing = missionStatus(s, m, net.support);
                    return (
                      <button
                        key={m.id}
                        className={`mission-card ${selected === m.id ? "selected" : ""}`}
                        onClick={() => open(m.id)}
                      >
                        <span
                          className="mission-number"
                          data-org={t.org}
                          style={{ background: t.color }}
                        >
                          <IncidentIcon org={t.org} category={t.category} />
                        </span>
                        <div>
                          <span className="eyebrow">
                            {t.org}
                            {m.major ? " · GROSSLAGE" : ""}
                            {m.shared ? " · VERBUND" : ""}
                          </span>
                          <h3>{t.name}</h3>
                          <p>
                            {m.control && !m.control.locationKnown
                              ? "Einsatzort noch erfragen"
                              : m.control?.facts.find(
                                  (f) => f.key === "address",
                                )?.text ||
                                "Einsatzort auf der Deutschlandkarte"}
                          </p>
                          <div className="mission-meta">
                            <span
                              className="priority-badge"
                              data-priority={visiblePriority(
                                m.control?.priority,
                              )}
                            >
                              {visiblePriority(m.control?.priority)}
                            </span>
                            <span
                              className={
                                processing.attention
                                  ? "status waiting"
                                  : "status"
                              }
                              data-processing={processing.code}
                              title={processing.detail}
                            >
                              {processing.label}
                            </span>
                            <time>
                              seit {duration(Math.max(0, s.time - m.created))} ·{" "}
                              {new Date(m.created * 1000).toLocaleTimeString(
                                "de-DE",
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </time>
                          </div>
                          {progress && (
                            <>
                              <progress
                                value={progress.value}
                                max={progress.max}
                                aria-label={progress.label}
                              />
                              <small>{progress.label}</small>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                {!!s.missions.length && !listedMissions.length && (
                  <p className="filter-empty">
                    Keine Einsätze passen zum Filter.
                  </p>
                )}
                {pages > 1 && (
                  <nav
                    className="mission-pagination"
                    aria-label="Einsatzseiten"
                  >
                    <button
                      disabled={currentPage === 0}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Zurück
                    </button>
                    <span>
                      {currentPage + 1}/{pages} · {listedMissions.length}{" "}
                      Einsätze
                    </span>
                    <button
                      disabled={currentPage + 1 >= pages}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Weiter
                    </button>
                  </nav>
                )}
                {!s.missions.length && (
                  <div className="empty">
                    <Radio size={32} />
                    <h3>
                      {alarmable
                        ? "Warten auf Notruf"
                        : "Bereitschaft herstellen"}
                    </h3>
                    <p>
                      {alarmable
                        ? "Passende Notrufe treffen automatisch in wechselnden Abständen ein. Ausstattung, Wetter und Lage bestimmen das Aufkommen; mehrere Einsätze können gleichzeitig laufen."
                        : hasVehicle
                          ? "Aktuell ist kein Fahrzeug alarmierbar. Prüfe Status, Besatzung und Nachbereitung im Fuhrpark."
                          : hasStation
                            ? "Warte die Fertigstellung deiner Wache ab und kaufe dort ein geeignetes Fahrzeug, zum Beispiel ein TSF-W."
                            : "Kaufe deine erste reale Wache und beschaffe ein geeignetes Fahrzeug. Danach treffen passende Notrufe automatisch ein."}
                    </p>
                    {!alarmable && (
                      <button
                        onClick={() =>
                          setModal(
                            hasVehicle
                              ? "fleet"
                              : hasStation
                                ? "stations"
                                : "facilities",
                          )
                        }
                      >
                        {hasVehicle
                          ? "Fuhrpark öffnen"
                          : hasStation
                            ? "Wachen öffnen"
                            : "Ersten Standort kaufen"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
      {showDetail && (
        <IncidentDock
          mission={
            s.missions.find((m) => m.id === selected) ??
            s.archive.find((m) => m.id === selected)
          }
          dockRef={dock}
          tab={tab}
          onSection={focusSection}
          onClose={onCloseDetail}
          readonly={readonly}
        >
          {detail}
        </IncidentDock>
      )}
      {!listOpen && !working && !layers && (
        <button className="worklist-toggle" onClick={() => setListOpen(true)}>
          Einsätze {s.missions.length} · Notrufe {calls.length}
        </button>
      )}
      <EventLog open={open} panel={setModal} />
    </div>
  );
}
