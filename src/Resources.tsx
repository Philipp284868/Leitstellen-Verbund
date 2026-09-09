import { buildReason, purchaseReason } from "./purchase";
import {
  StationSettings,
  PersonSettings,
  VehicleStaffing,
  HospitalSettings,
} from "./Organizations";
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
import { fleetReadiness } from "./fleet-view";
import { stationCapacity } from "./simulation/staffing";
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
              disabled={!!buildReason(s, b.id)}
              onClick={() => onPlace(b.id)}
            >
              {buildReason(s, b.id) || "Platzieren"}
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
      <StationSettings key={`${b.id}-station`} s={s} b={b} />
      <HospitalSettings key={`${b.id}-hospital`} s={s} b={b} />
      {b.type === "hospital" && (
        <p className="banner">
          {b.hospital?.open === false
            ? "Patientenaufnahme abgemeldet"
            : "Patientenaufnahme geöffnet"}{" "}
          · {s.beds.filter((x) => x.home === b.id).length} /{" "}
          {b.hospital?.capacity ?? 20 * b.level} Betten belegt
        </p>
      )}
      <div className="stat-row">
        <span>
          Stufe <b>{b.level}</b>
        </span>
        <span>
          Stellplätze{" "}
          <b>
            {fleet.length}/{stationCapacity(b).slots}
          </b>
        </span>
        <span>
          Personal{" "}
          <b>
            {crew.length}/{stationCapacity(b).people}
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
        <button
          disabled={
            level(s) < Math.max(bt(b.type).level, b.level * 2) ||
            s.money < BALANCE.upgrade * b.level ||
            b.ready > s.time ||
            b.level >= 10
          }
          onClick={() => void act({ type: "upgrade", id: b.id })}
        >
          Ausbauen · Stufe {Math.max(bt(b.type).level, b.level * 2)} ·{" "}
          {credits(BALANCE.upgrade * b.level)}
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
              <div className="person" key={p.id} style={{ flexWrap: "wrap" }}>
                <span>
                  {p.duty?.name || `Mitarbeiter ${i + 1}`}
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
                <PersonSettings s={s} person={p} />
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
                    s.money < e.price ||
                    level(s) < e.level ||
                    b.ready > s.time
                  }
                  onClick={() =>
                    void act({ type: "extension", id: b.id, kind: e.id })
                  }
                >
                  {b.extensions.includes(e.id as (typeof b.extensions)[number])
                    ? "Gebaut"
                    : level(s) < e.level
                      ? `Ab Stufe ${e.level}`
                      : s.money < e.price
                        ? "Nicht genügend Credits"
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
                    disabled={!!purchaseReason(s, v.id, b.id)}
                    onClick={() =>
                      void act({ type: "buy", kind: v.id, home: b.id })
                    }
                  >
                    {purchaseReason(s, v.id, b.id) || credits(v.price)}
                  </button>
                </article>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
export function Fleet({
  s,
  onSelect,
}: {
  s: Save;
  onSelect?: (id: string) => void;
}) {
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
              {onSelect && (
                <button onClick={() => onSelect(v.id)}>
                  Auf Karte auswählen
                </button>
              )}
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
                  <small className={fleetReadiness(s)(v) ? "warning" : "good"}>
                    {v.availability?.reason ||
                      fleetReadiness(s)(v) ||
                      "Vollständig einsatzbereit"}
                  </small>
                  {v.availability && (
                    <small>
                      Besatzung: {v.availability.crewPresent}/
                      {v.availability.crewCapacity} · Ausrücken ab{" "}
                      {v.availability.crewRequired} Kräften
                    </small>
                  )}
                  {v.status !== "ready" && (
                    <small>{tripLabel(v, s.time)}</small>
                  )}
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
              <VehicleStaffing s={s} v={v} />
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
