import { tripLabel } from "./travel";
import { useState } from "react";
import {
  buildings,
  vehicles,
  bt,
  vt,
  BALANCE,
  capabilities,
  extensions,
} from "./catalog";
import { level, type Save, type Building } from "./model";
import { act } from "./store";
import { readiness } from "./engine";
import { credits, statuses } from "./ui";
export function BuildingShop({
  s,
  onPlace,
}: {
  s: Save;
  onPlace: (type: string) => void;
}) {
  return (
    <div className="shop-grid">
      {buildings.map((b) => (
        <article className="shop-card" key={b.id}>
          <span className="eyebrow">{b.org}</span>
          <h3>{b.name}</h3>
          <p>
            {b.slots
              ? `${b.slots} Stellplätze · ${b.people} Personalplätze`
              : b.id === "hospital"
                ? "20 zusätzliche Behandlungsplätze"
                : "Fachausbildungen für alle Organisationen"}
          </p>
          <footer>
            <strong>{credits(b.price)}</strong>
            <button
              disabled={s.money < b.price || level(s) < b.level}
              onClick={() => onPlace(b.id)}
            >
              {level(s) < b.level ? `Ab Stufe ${b.level}` : "Platzieren"}
            </button>
          </footer>
        </article>
      ))}
    </div>
  );
}
export function BuildingPanel({ s, b }: { s: Save; b: Building }) {
  const [name, setName] = useState(b.name),
    [skill, setSkill] = useState("Drehleiter");
  const crew = s.people.filter((p) => p.home === b.id),
    fleet = s.vehicles.filter((v) => v.home === b.id);
  return (
    <div className="resource-panel">
      <span className="eyebrow">{bt(b.type).org} · Eigene Wache</span>
      <h2>{b.name}</h2>
      {b.type === "hospital" && (
        <p className="banner">
          Patientenaufnahme geöffnet ·{" "}
          {s.beds.filter((x) => x.home === b.id).length} / {20 * b.level} Betten
          belegt
        </p>
      )}
      <div className="stat-row">
        <span>
          Stufe <b>{b.level}</b>
        </span>
        <span>
          Stellplätze{" "}
          <b>
            {fleet.length}/{bt(b.type).slots * b.level}
          </b>
        </span>
        <span>
          Personal{" "}
          <b>
            {crew.length}/{bt(b.type).people * b.level}
          </b>
        </span>
      </div>
      {b.ready > s.time && (
        <p className="banner">
          Bauarbeiten: noch {Math.ceil(b.ready - s.time)} Sekunden
        </p>
      )}
      <div className="inline">
        <input
          aria-label="Wachenname"
          maxLength={48}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button onClick={() => void act({ type: "rename", id: b.id, name })}>
          Umbenennen
        </button>
      </div>
      <div className="inline">
        <button onClick={() => void act({ type: "upgrade", id: b.id })}>
          Ausbauen · {credits(BALANCE.upgrade * b.level)}
        </button>
        <button
          className="danger"
          onClick={() => {
            if (
              confirm(
                "Nur eine leere Wache kann verkauft werden. Rückerstattung: 60 % des Grundpreises. Verkaufen?",
              )
            )
              void act({ type: "sell", id: b.id });
          }}
        >
          Verkaufen
        </button>
      </div>
      {bt(b.type).people > 0 && (
        <>
          <h3>Personal</h3>
          <p>
            {crew.filter((p) => !p.vehicle).length} frei ·{" "}
            {crew.filter((p) => p.training).length} in Ausbildung
          </p>
          <div className="inline">
            <button
              onClick={() => void act({ type: "hire", home: b.id, count: 6 })}
            >
              6 einstellen · {credits(BALANCE.hire * 6)}
            </button>
            <button
              onClick={() => void act({ type: "hire", home: b.id, count: 1 })}
            >
              1 einstellen · {credits(BALANCE.hire)}
            </button>
          </div>
          <label>
            Fachausbildung
            <select value={skill} onChange={(e) => setSkill(e.target.value)}>
              {[
                "Drehleiter",
                "Führung",
                "Bergung",
                "Gefahrgut",
                "Atemschutz",
                "Notarzt",
                "Luftrettung",
                "Wasserrettung",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <div className="people-list">
            {crew.map((p, i) => (
              <div className="person" key={p.id}>
                <span>
                  Mitarbeiter {i + 1}
                  <small>
                    {p.training
                      ? `In Ausbildung: ${p.training} (${Math.max(0, Math.ceil(p.ready - s.time))} s)`
                      : p.skills.join(", ") || "Grundausbildung"}{" "}
                    · {p.vehicle ? "Zugewiesen" : "Frei"}
                  </small>
                </span>
                <button
                  disabled={
                    !!p.training ||
                    !s.buildings.some(
                      (b) => b.type === "school" && b.ready <= s.time,
                    )
                  }
                  onClick={() =>
                    void act({ type: "train", person: p.id, skill })
                  }
                >
                  Ausbilden
                </button>
                {!p.vehicle && !p.training && (
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          "Freies Personal ohne Rückerstattung entlassen?",
                        )
                      )
                        void act({ type: "dismiss", person: p.id });
                    }}
                  >
                    Entlassen
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {bt(b.type).slots > 0 && (
        <>
          <h3>Wachenerweiterungen</h3>
          {extensions
            .filter((e) => e.home === b.type)
            .map((e) => (
              <div className="person" key={e.id}>
                <span>{e.name}</span>
                <button
                  disabled={
                    b.extensions.includes(
                      e.id as (typeof b.extensions)[number],
                    ) ||
                    level(s) < e.level ||
                    b.ready > s.time
                  }
                  onClick={() =>
                    void act({ type: "extension", id: b.id, kind: e.id })
                  }
                >
                  {b.extensions.includes(e.id as (typeof b.extensions)[number])
                    ? "Gebaut"
                    : credits(e.price)}
                </button>
              </div>
            ))}
          <h3>Fahrzeuge beschaffen</h3>
          <div className="vehicle-shop">
            {vehicles
              .filter((v) => v.home === b.type)
              .map((v) => (
                <article key={v.id}>
                  <div>
                    <b>{v.name}</b>
                    <small>
                      {v.crew} Personal{v.training ? ` · ${v.training}` : ""}
                    </small>
                    <small>
                      {Object.entries(v.skills)
                        .map(([k, n]) => `${capabilities[k]} ${n}`)
                        .join(" · ")}
                    </small>
                  </div>
                  <button
                    disabled={
                      level(s) < v.level ||
                      s.money < v.price ||
                      b.ready > s.time
                    }
                    onClick={() =>
                      void act({ type: "buy", kind: v.id, home: b.id })
                    }
                  >
                    {level(s) < v.level ? `Stufe ${v.level}` : credits(v.price)}
                  </button>
                </article>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
export function Fleet({ s }: { s: Save }) {
  const [filter, setFilter] = useState(""),
    [favorite, setFavorite] = useState(false);
  return (
    <div>
      <div className="inline">
        <input
          placeholder="Fahrzeug suchen …"
          aria-label="Fahrzeug suchen"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={favorite}
            onChange={(e) => setFavorite(e.target.checked)}
          />{" "}
          Favoriten
        </label>
      </div>
      <div className="vehicle-shop">
        {s.vehicles
          .filter(
            (v) =>
              (!favorite || v.favorite) &&
              v.name.toLowerCase().includes(filter.toLowerCase()),
          )
          .map((v) => (
            <article className="fleet-card" key={v.id}>
              <div className="inline">
                <button
                  aria-label={`Favorit ${v.name}`}
                  onClick={() => void act({ type: "favorite", id: v.id })}
                >
                  {v.favorite ? "★" : "☆"}
                </button>
                <div>
                  <b>{v.name}</b>
                  <small>
                    {s.buildings.find((b) => b.id === v.home)?.name} ·{" "}
                    {statuses[v.status]}
                  </small>
                  <small className={readiness(s, v) ? "warning" : "good"}>
                    {v.status === "ready"
                      ? readiness(s, v) || "Vollständig einsatzbereit"
                      : tripLabel(v, s.time)}
                  </small>
                </div>
              </div>
              <div className="inline">
                <button
                  onClick={() => void act({ type: "assign", vehicle: v.id })}
                >
                  Besetzen
                </button>
                <button
                  onClick={() => void act({ type: "unassign", vehicle: v.id })}
                >
                  Besatzung lösen
                </button>
                <button
                  onClick={() => {
                    const name = prompt("Neuer Fahrzeugname", v.name);
                    if (name) void act({ type: "rename", id: v.id, name });
                  }}
                >
                  Name
                </button>
                {v.status !== "ready" ? (
                  <button
                    onClick={() => void act({ type: "recall", id: v.id })}
                  >
                    Rückruf
                  </button>
                ) : (
                  <>
                    <select
                      aria-label={`Versetzen ${v.name}`}
                      value={v.home}
                      onChange={(e) =>
                        void act({
                          type: "move",
                          id: v.id,
                          home: e.target.value,
                        })
                      }
                    >
                      {s.buildings
                        .filter((b) => b.type === vt(v.type).home)
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                    </select>
                    <button
                      className="danger"
                      onClick={() => {
                        if (
                          confirm(
                            `${v.name} für ${credits(Math.floor(vt(v.type).price * 0.6))} verkaufen? Personal bleibt erhalten.`,
                          )
                        )
                          void act({ type: "sell", id: v.id });
                      }}
                    >
                      Verkaufen
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
      </div>
      {!s.vehicles.length && (
        <p className="empty">
          Deine ersten Fahrzeuge kaufst du in einer fertig gebauten Wache.
        </p>
      )}
    </div>
  );
}
