import { useEffect, useRef, useState } from "react";
import { api, useGame } from "./store";
import { mergeEvents, useEvents } from "./event-store";
export function EventLog({
  open,
  panel,
  expanded = false,
}: {
  open: (id: string) => void;
  panel: (id: string) => void;
  expanded?: boolean;
}) {
  const events = useEvents(),
    { save, readonly } = useGame();
  const scroll = useRef<HTMLDivElement>(null),
    bottom = useRef(true),
    previous = useRef(0);
  const [unread, setUnread] = useState(0),
    [limit, setLimit] = useState(50),
    [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState<{ at: number; id: string } | null>(null),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const load = async () => {
    if (busy || readonly) return;
    setBusy(true);
    setError("");
    try {
      const result = await api(
        `events${cursor ? `?at=${cursor.at}&id=${encodeURIComponent(cursor.id)}` : ""}`,
      );
      mergeEvents(result.events);
      setCursor(result.next);
      setLoaded(true);
      setLimit((n) => Math.min(600, n + 100));
    } catch {
      setError("Verlauf derzeit nicht erreichbar.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    setLoaded(false);
    setCursor(null);
  }, [save?.generation]);
  useEffect(() => {
    if (bottom.current)
      scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
    else if (events.length > previous.current)
      setUnread((n) => n + events.length - previous.current);
    previous.current = events.length;
  }, [events]);
  const critical = events.filter(
    (e) => e.unresolved && e.priority === "critical",
  );
  const rows = events
    .filter((e) => !critical.some((c) => c.id === e.id))
    .slice(-limit);
  const entry = (e: (typeof events)[number]) => (
    <article
      key={e.id}
      data-event-id={e.id}
      data-priority={e.priority}
      className={e.unresolved ? "unresolved" : ""}
    >
      <header>
        <time>
          {new Date(e.at * 1000).toLocaleTimeString("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
        <b>{e.sender}</b>
        <span>
          {e.priority === "critical" ? "Kritisch · " : ""}
          {e.type}
        </span>
      </header>
      {e.mission ? (
        <button className="event-message" onClick={() => open(e.mission!)}>
          {e.text}
        </button>
      ) : (
        <p>{e.text}</p>
      )}
      {(e.count ?? 0) > 1 && <small>{e.count} gleiche Meldungen</small>}
      {e.unresolved && <small>Offen · Bearbeitung erforderlich</small>}
      {e.connection && e.unresolved && (
        <div className="event-actions">
          <button onClick={() => window.location.reload()}>
            Seite neu laden
          </button>
          <button onClick={() => panel("support")}>Support</button>
        </div>
      )}
    </article>
  );
  return (
    <section
      className={`event-log ${expanded ? "expanded" : ""}`}
      aria-label="Funk und Ereignisse"
    >
      <header className="event-heading">
        <strong>Funk & Ereignisse</strong>
        <span>TEXT</span>
      </header>
      {!!critical.length && (
        <div className="critical-events" aria-live="polite">
          {critical.map(entry)}
        </div>
      )}
      <div
        className="event-scroll"
        ref={scroll}
        role="log"
        aria-live="polite"
        onScroll={() => {
          const e = scroll.current!;
          bottom.current = e.scrollHeight - e.scrollTop - e.clientHeight < 40;
          if (bottom.current) setUnread(0);
        }}
      >
        {(!loaded || cursor) && (
          <button disabled={busy || readonly} onClick={() => void load()}>
            {busy ? "Lädt …" : "Ältere Meldungen laden"}
          </button>
        )}
        {error && <p>{error}</p>}
        {rows.map(entry)}
        {!events.length && (
          <p className="event-empty">
            Noch keine Meldungen. Einsatzfunk und Systemereignisse erscheinen
            hier.
          </p>
        )}
      </div>
      {!!unread && (
        <button
          className="new-events"
          onClick={() => {
            bottom.current = true;
            setUnread(0);
            scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
          }}
        >
          {unread} neue Meldungen ↓
        </button>
      )}
    </section>
  );
}
