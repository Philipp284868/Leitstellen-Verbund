import { incidentLoad } from "../simulation/workload";
import {
  Radio,
  Search,
  ChevronUp,
  ChevronDown,
  Phone,
  TriangleAlert,
  Bell,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Save } from "../shared/model";
import { mergeEvents, useEvents } from "./event-store";
import type { GameEvent } from "../shared/game-events";
import { useNetwork } from "./network";
import { IncidentIcon } from "./HudIcons";
import { missionPresentation } from "./mission-presentation";
import { visiblePriority } from "../simulation/priority";
import { missionStatus } from "../simulation/mission-status";
import { missionList } from "./workspace";
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
export function CompactDesk({
  s,
  selected,
  open,
  panel,
  readonly,
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
  const load = incidentLoad(s);
  const events = useEvents(),
    net = useNetwork();
  const [collapsed, setCollapsed] = useState(false),
    [find, setFind] = useState(false),
    [query, setQuery] = useState(""),
    [eventFilter, setEventFilter] = useState("all"),
    [callsOnly, setCallsOnly] = useState(false),
    [page, setPage] = useState(0);
  const priorAlarms = useRef<GameEvent[]>([]);
  useEffect(() => {
    const current: GameEvent[] = net.alarms.map((a) => ({
      id: `alarm:${a.id}`,
      at: a.started,
      sender: a.name,
      type: "Katastrophenbereitschaft",
      text:
        a.phase === "mobilizing"
          ? "Katastrophenbereitschaft: Kräfte sammeln sich."
          : "Katastrophenbereitschaft hergestellt.",
      priority: "critical",
      unresolved: true,
    }));
    if (current.length || priorAlarms.current.length)
      mergeEvents([
        ...priorAlarms.current
          .filter((a) => !current.some((b) => b.id === a.id))
          .map((a) => ({ ...a, unresolved: false })),
        ...current,
      ]);
    priorAlarms.current = current;
  }, [net.alarms]);
  useEffect(() => {
    setPage(0);
  }, [search, filter, sort, callsOnly]);
  const rows = useMemo(
    () =>
      events
        .filter(
          (e) =>
            !e.connection &&
            (eventFilter === "all" ||
              (eventFilter === "open"
                ? e.unresolved
                : e.type === "Funk" || e.type === "Sprechwunsch")) &&
            `${e.sender} ${e.text}`
              .toLocaleLowerCase("de")
              .includes(query.trim().toLocaleLowerCase("de")),
        )
        .slice()
        .sort(
          (a, b) =>
            Number(!!b.unresolved && b.priority === "critical") -
              Number(!!a.unresolved && a.priority === "critical") ||
            b.at - a.at ||
            b.id.localeCompare(a.id),
        )
        .slice(0, 50),
    [events, eventFilter, query],
  );
  const radioScroll = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const rememberScroll = () => {
    const el = radioScroll.current;
    if (!el || el.scrollTop < 10) {
      anchor.current = null;
      return;
    }
    const top = el.getBoundingClientRect().top;
    const row = [...el.querySelectorAll<HTMLElement>("[data-event-id]")].find(
      (r) => r.getBoundingClientRect().bottom > top,
    );
    if (row)
      anchor.current = {
        id: row.dataset.eventId!,
        offset: row.getBoundingClientRect().top - top,
      };
  };
  useLayoutEffect(() => {
    const el = radioScroll.current;
    if (!el || listOpen || collapsed || !anchor.current) return;
    const row = [...el.querySelectorAll<HTMLElement>("[data-event-id]")].find(
      (r) => r.dataset.eventId === anchor.current!.id,
    );
    if (row)
      el.scrollTop +=
        row.getBoundingClientRect().top -
        el.getBoundingClientRect().top -
        anchor.current.offset;
  }, [rows, listOpen, collapsed]);
  useEffect(() => {
    anchor.current = null;
    radioScroll.current?.scrollTo({ top: 0 });
  }, [query, eventFilter]);
  const calls = s.missions.filter((m) =>
    m.control?.calls.some((c) =>
      ["ringing", "active", "dropped"].includes(c.state),
    ),
  );
  const requests = s.missions.reduce(
    (total, m) =>
      total +
      (m.phase === "done"
        ? 0
        : (m.control?.radio.filter(
            (r) =>
              r.state === "open" &&
              (m.control?.briefed ||
                m.control?.legacy ||
                r.reason === "arrival"),
          ).length ?? 0)),
    0,
  );
  const critical = events.filter(
    (e) => e.unresolved && e.priority === "critical",
  ).length;
  const missions = useMemo(
    () =>
      missionList(s, search, filter, sort, userId).filter(
        (m) =>
          !callsOnly ||
          m.control?.calls.some((c) =>
            ["ringing", "active", "dropped"].includes(c.state),
          ),
      ),
    [s, search, filter, sort, userId, callsOnly],
  );
  const pages = Math.max(1, Math.ceil(missions.length / 25)),
    currentPage = Math.min(page, pages - 1);
  const selectTab = (value: boolean) => {
    setListOpen(value);
  };
  return (
    <section
      className="compact-desk"
      aria-label="Einsatzübersicht und Textfunk"
      data-collapsed={collapsed}
    >
      <div
        className="compact-tabs"
        role="tablist"
        aria-label="Funk und Einsätze"
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            const next =
              e.key === "Home" ? false : e.key === "End" ? true : !listOpen;
            selectTab(next);
            e.currentTarget
              .querySelectorAll<HTMLButtonElement>("button")
              [next ? 1 : 0].focus();
          }
        }}
      >
        <button
          id="radio-tab"
          role="tab"
          tabIndex={listOpen ? -1 : 0}
          aria-selected={!listOpen}
          aria-controls="radio-preview"
          onClick={() => selectTab(false)}
        >
          Funk & Ereignisse
          {critical > 0 && (
            <span
              className="critical-count"
              aria-label={`${critical} wichtige offene Meldungen`}
            >
              ! {critical}
            </span>
          )}
        </button>
        <button
          id="missions-tab"
          role="tab"
          tabIndex={listOpen ? 0 : -1}
          aria-selected={listOpen}
          aria-controls="missions-preview"
          onClick={() => selectTab(true)}
        >
          Aktive Einsätze{" "}
          <b>
            {load.used} / {load.limit}
          </b>
          {calls.length > 0 && (
            <Phone size={13} aria-label={`${calls.length} Notrufe`} />
          )}
        </button>
      </div>
      {readonly && (
        <div className="connection-inline" role="status">
          <TriangleAlert size={16} />
          <span>
            Serververbindung verloren. Bitte die Seite neu laden oder den
            Support kontaktieren.
          </span>
          <button onClick={() => window.location.reload()}>
            Seite neu laden
          </button>
          <button onClick={() => panel("support")}>Support</button>
        </div>
      )}
      <div className="compact-toolbar">
        <span>
          {listOpen
            ? load.overloaded
              ? `Altbestand: ${load.used} / ${load.limit} · zuerst abarbeiten`
              : `${calls.length} offene Notrufvorgänge`
            : "Neueste Meldungen"}
        </span>
        {!listOpen ? (
          <select
            aria-label="Ereignisfilter"
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
          >
            <option value="all">Alle</option>
            <option value="open">Offen</option>
            <option value="radio">Funk</option>
          </select>
        ) : (
          <button
            aria-pressed={callsOnly}
            onClick={() => setCallsOnly(!callsOnly)}
          >
            <Phone size={14} />
            Notrufe {calls.length}
          </button>
        )}
        <button
          aria-label="Vorschau durchsuchen"
          aria-expanded={find}
          onClick={() => {
            setFind(!find);
            setCollapsed(false);
          }}
        >
          <Search size={16} />
        </button>
        <button
          aria-label={
            collapsed ? "Ereignispanel ausklappen" : "Ereignispanel einklappen"
          }
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>
      <div
        id="radio-preview"
        role="tabpanel"
        aria-labelledby="radio-tab"
        hidden={listOpen || collapsed}
      >
        {find && (
          <div className="compact-search">
            <input
              autoFocus
              aria-label="Meldungen suchen"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Absender oder Meldung …"
            />
            <button
              aria-label="Meldungssuche schließen"
              onClick={() => setFind(false)}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div
          className="preview-scroll"
          ref={radioScroll}
          onScroll={rememberScroll}
          role="log"
          aria-label="Neueste Funkmeldungen"
        >
          {rows.map((e) => (
            <button
              key={e.id}
              className="event-preview"
              data-event-id={e.id}
              data-priority={e.priority}
              onClick={() =>
                e.mission
                  ? open(e.mission)
                  : panel(
                      e.type === "Katastrophenbereitschaft" ? "civil" : "radio",
                    )
              }
              title={e.text}
            >
              {e.priority === "critical" ? (
                <TriangleAlert size={16} />
              ) : e.type === "Funk" || e.type === "Sprechwunsch" ? (
                <Radio size={16} />
              ) : (
                <Bell size={16} />
              )}
              <span className="preview-copy">
                <span className="preview-meta">
                  <b>{e.sender}</b>
                  <time>
                    {new Date(e.at * 1000).toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  {e.unresolved && <em>Offen</em>}
                </span>
                <span className="preview-text">{e.text}</span>
              </span>
            </button>
          ))}
          {!rows.length && (
            <p className="preview-empty">
              {events.length
                ? "Keine Meldungen passen zum Filter."
                : "Noch keine Meldungen. Einsatzfunk und Systemereignisse erscheinen hier."}
            </p>
          )}
        </div>
      </div>
      <div
        id="missions-preview"
        role="tabpanel"
        aria-labelledby="missions-tab"
        hidden={!listOpen || collapsed}
      >
        {find && (
          <div className="compact-search">
            <input
              autoFocus
              aria-label="Einsätze durchsuchen"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Einsatz, Ort oder Fahrzeug …"
            />
          </div>
        )}
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
                  ["request", "Offene Sprechwünsche"],
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
                setCallsOnly(false);
              }}
            >
              Filter zurücksetzen
            </button>
            <details>
              <summary>Ressourcen und Reserve</summary>
              <ReserveOverview s={s} />
            </details>
          </details>
          {missions.slice(currentPage * 25, (currentPage + 1) * 25).map((m) => {
            const t = missionPresentation(m),
              status = missionStatus(s, m, net.support);
            return (
              <button
                key={m.id}
                className={`mission-card mission-preview ${selected === m.id ? "selected" : ""}`}
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
                    {m.control?.priority === "NOTFALL" && <em>! Notfall</em>}
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
                    </span>
                    {" · "}
                    {status.label}
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
                {s.buildings.length
                  ? "Passende Notrufe treffen automatisch ein, sobald Kräfte bereitstehen; mehrere Einsätze können gleichzeitig laufen."
                  : "Kaufe eine reale Wache und beschaffe ein geeignetes Fahrzeug."}
              </p>
              {!s.buildings.length && (
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
      </div>
      <footer>
        <span>{requests} offene Sprechwünsche</span>
        <button onClick={() => panel(listOpen ? "calls" : "radio")}>
          {listOpen ? "Notrufarbeitsplatz" : "Verlauf öffnen"}
        </button>
      </footer>
    </section>
  );
}
