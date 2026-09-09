import { useMemo, useState } from "react";
import { MapPin, Search, Users } from "lucide-react";
import { groupPresence, type PublicPlayer } from "./presence";
import type { Point } from "./world";
import "./Players.css";

const PAGE_SIZE = 16;
const desksLabel = (count: number) =>
  `${count} ${count === 1 ? "Leitstelle" : "Leitstellen"}`;
export function Players({
  players,
  ownUserId,
  ownDeskId,
  connected,
  ready,
  onJump,
}: {
  players: readonly PublicPlayer[];
  ownUserId: string;
  ownDeskId: string;
  connected: boolean;
  ready: boolean;
  onJump: (point: Point) => void;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("de");
    return players.filter(
      (p) =>
        (filter !== "mine" || p.deskId === ownDeskId) &&
        (filter !== "unplaced" || !p.location) &&
        (filter !== "reconnecting" || p.status === "reconnecting") &&
        (!term ||
          `${p.name} ${p.deskName} ${p.location?.label || ""}`
            .toLocaleLowerCase("de")
            .includes(term)),
    );
  }, [players, query, filter, ownDeskId]);
  const groups = useMemo(() => groupPresence(filtered), [filtered]);
  const pages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE)),
    current = Math.min(page, pages - 1);
  const live = connected && ready;
  return (
    <section className="presence-panel" aria-label="Spieler dieser Serverwelt">
      <header className="presence-heading">
        <Users size={20} />
        <div>
          <h2>Anwesenheit</h2>
          <p>
            {live
              ? `${players.length} Spieler · ${desksLabel(groupPresence(players).length)}`
              : "Anwesenheit wird geprüft"}
          </p>
        </div>
      </header>
      <p className="presence-explainer">
        Öffentliche Leitstellenstandorte. Einsätze, Fahrzeuge und Konten bleiben
        geschützt.
      </p>
      {!live && (
        <p className="presence-connection" role="status">
          {connected
            ? "Die vollständige Spielerliste wird geladen."
            : "Verbindung getrennt. Die zuletzt empfangene Liste ist nicht aktuell."}
        </p>
      )}
      <div className="presence-tools">
        <label>
          <span className="sr-only">Spieler suchen</span>
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Spieler oder Leitstelle suchen"
          />
        </label>
        <select
          aria-label="Spielerfilter"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">Alle Spieler</option>
          <option value="mine">Meine Leitstelle</option>
          <option value="unplaced">Ohne Standort</option>
          <option value="reconnecting">Verbindung wird erneuert</option>
        </select>
      </div>
      <p className="presence-results" aria-live="polite">
        {filtered.length} von {players.length} Spielern ·{" "}
        {desksLabel(groups.length)} gefunden
      </p>
      <div className={`presence-groups${live ? "" : " presence-stale"}`}>
        {groups
          .slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
          .map((group) => (
            <article
              className={`presence-desk${group.id === ownDeskId ? " presence-own-desk" : ""}`}
              key={group.id}
            >
              <div className="presence-desk-heading">
                <div>
                  <h3>{group.name}</h3>
                  {group.id === ownDeskId && <small>Eigene Leitstelle</small>}
                </div>
                <span className="presence-member-count">
                  {group.players.length} Spieler
                </span>
              </div>
              <ul>
                {group.players.map((p) => (
                  <li key={p.id}>
                    <span
                      className={`presence-dot presence-${live ? p.status : "unknown"}`}
                      aria-hidden="true"
                    />
                    <span>
                      {p.name}
                      {p.id === ownUserId && <small> Du</small>}
                    </span>
                    <span className="presence-status">
                      {!live
                        ? "Unbestätigt"
                        : p.status === "online"
                          ? "Online"
                          : "Verbindet neu"}
                    </span>
                  </li>
                ))}
              </ul>
              {group.location ? (
                <button
                  type="button"
                  className="presence-jump"
                  onClick={() =>
                    onJump({ x: group.location!.x, y: group.location!.y })
                  }
                >
                  <MapPin size={16} />
                  <span>
                    Auf Karte zeigen <small>{group.location.label}</small>
                  </span>
                </button>
              ) : (
                <p className="presence-no-location">
                  <MapPin size={15} />
                  Noch kein Wachenstandort gewählt
                </p>
              )}
            </article>
          ))}
        {!groups.length && (
          <p className="presence-empty">
            {players.length
              ? "Keine Spieler passen zur Suche."
              : live
                ? "Noch keine Spieler verbunden."
                : "Noch keine bestätigte Spielerliste vorhanden."}
          </p>
        )}
      </div>
      {pages > 1 && (
        <nav
          className="presence-pagination"
          aria-label="Seiten der Spielerliste"
        >
          <button disabled={!current} onClick={() => setPage(current - 1)}>
            Zurück
          </button>
          <span>
            Seite {current + 1} von {pages}
          </span>
          <button
            disabled={current + 1 >= pages}
            onClick={() => setPage(current + 1)}
          >
            Weiter
          </button>
        </nav>
      )}
    </section>
  );
}
