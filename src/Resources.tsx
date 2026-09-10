import { useState } from "react";
import {
  BALANCE,
  bt,
  capabilities,
  extensions,
  vehicleHomeAllowed,
  vehicles,
  vt,
} from "./catalog";
import { CivilStationSettings } from "./CivilProtection";
import { requestDialogTransition } from "./dialog-state";
import { saleValue } from "./economy/ledger";
import { fleetReadiness } from "./fleet-view";
import { unproject } from "./germany/projection";
import { BuildingIcon, VehicleIcon } from "./map-icons";
import { level, type Building, type Save } from "./model";
import {
  HospitalSettings,
  StationSettings,
  VehicleStaffing,
} from "./Organizations";
import { purchaseReason } from "./purchase";
import { buildingStaffingStatus } from "./simulation/building-staffing";
import { operativeCode } from "./simulation/fms";
import { stationCapacity } from "./simulation/staffing";
import { StationGarage } from "./StationGarage";
import { command, useGame } from "./store";
import { tripLabel } from "./travel";
import {
  ConfirmAction,
  credits,
  Disclosure,
  RenameAction,
  statuses,
} from "./ui";
import { useCommandForm } from "./use-command-form";
export function BuildingPanel({
  s,
  b,
  onOpenVehicle,
}: {
  s: Save;
  b: Building;
  onOpenVehicle: (id: string) => void;
}) {
  const { readonly } = useGame();
  const [tab, setTab] = useState("overview"),
    [query, setQuery] = useState(""),
    [compare, setCompare] = useState<string[]>([]),
    [purchase, setPurchase] = useState("");
  const form = useCommandForm(!!purchase, () => setPurchase(""));
  const fleet = s.vehicles.filter((v) => v.home === b.id),
    cap = stationCapacity(b),
    automatic = buildingStaffingStatus(s, b);
  const available = vehicles.filter(
    (v) =>
      vehicleHomeAllowed(v, b.type) &&
      `${v.name} ${Object.keys(v.skills)
        .map((k) => capabilities[k])
        .join(" ")}`
        .toLocaleLowerCase("de")
        .includes(query.toLocaleLowerCase("de")),
  );
  const requiredLevel = Math.max(bt(b.type).level, b.level * 2),
    upgradeCost = BALANCE.upgrade * b.level;
  const upgradeReason =
    b.ready > s.time
      ? "Bauarbeiten abwarten"
      : b.level >= 10
        ? "Maximale Ausbaustufe erreicht"
        : level(s) < requiredLevel
          ? `Ausbau ab Stufe ${requiredLevel}`
          : s.money < upgradeCost
            ? "Budget reicht für diesen Ausbau nicht aus"
            : "";
  const location = unproject(b.pos);
  const selectedPurchase = vehicles.find((v) => v.id === purchase);
  return (
    <section className="resource-panel" data-tutorial="building-details">
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <span className="eyebrow">{bt(b.type).org} · Eigener Standort</span>
      <h2>
        <BuildingIcon type={b.type} /> {b.name}
      </h2>
      <p className="view-intro">
        {location
          ? `${location.lat.toFixed(5)}° N, ${location.lon.toFixed(5)}° E`
          : `Kartenposition ${Math.round(b.pos.x)} / ${Math.round(b.pos.y)}`}{" "}
        ·{" "}
        <RenameAction
          label="Wache"
          name={b.name}
          onSave={(name) => command({ type: "rename", id: b.id, name })}
        />
      </p>
      <div className="resource-summary">
        <div>
          <small>Betriebsstatus</small>
          <strong>{automatic.label}</strong>
        </div>
        <div>
          <small>Stellplätze</small>
          <strong>
            {fleet.length} / {cap.slots}
          </strong>
        </div>
        <div>
          <small>Gebäudestufe</small>
          <strong>{b.level} / 10</strong>
        </div>
      </div>
      <div className="section-tabs" role="tablist" aria-label="Wachenbereiche">
        {[
          ["overview", "Übersicht & Betrieb"],
          ["vehicles", "Fahrzeuge & Vergleich"],
          ["expansion", "Ausbau & Funktionen"],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => requestDialogTransition(() => setTab(id))}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <>
          <article className="purchase-review" data-tutorial="automatic-staff">
            <h3>Automatische Wachbesetzung</h3>
            <p>{automatic.reason}</p>
            <p>
              Die Wache stellt die für ihre freigeschalteten Fahrzeuge
              erforderliche Besatzung und Qualifikationen selbst bereit.
              Laufende Einsätze, Verletzungen und Rückfahrten behalten ihre
              Besatzung.
            </p>
          </article>
          {b.ready > s.time && (
            <p className="banner" role="status">
              Bauarbeiten: noch {Math.ceil(b.ready - s.time)} Sekunden
            </p>
          )}
          <StationSettings key={`${b.id}-station`} s={s} b={b} />
          <CivilStationSettings key={`${b.id}-civil`} s={s} b={b} />
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
          <StationGarage s={s} b={b} onOpen={onOpenVehicle} />
          {!fleet.length && (
            <button
              onClick={() => requestDialogTransition(() => setTab("vehicles"))}
            >
              Fahrzeugkatalog öffnen
            </button>
          )}
        </>
      )}
      {tab === "vehicles" && (
        <>
          <p className="view-intro">
            Vergleiche bis zu zwei Fahrzeuge. Der Kauf belegt einen Stellplatz;
            die passende Besatzung wird automatisch bereitgestellt.
          </p>
          <label>
            Fahrzeug oder Fähigkeit suchen
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="TSF-W, Löschwasser, Bergung …"
            />
          </label>
          {compare.length > 0 && (
            <div className="comparison-grid" aria-label="Fahrzeugvergleich">
              {compare
                .map((id) => vt(id))
                .map((v) => (
                  <article key={v.id}>
                    <h3>
                      <VehicleIcon type={v.id} />
                      {v.name}
                    </h3>
                    <dl>
                      <dt>Kaufpreis</dt>
                      <dd>{credits(v.price)}</dd>
                      <dt>Stellplätze</dt>
                      <dd>1</dd>
                      <dt>Freischaltung</dt>
                      <dd>Stufe {v.level}</dd>
                      <dt>Laufende Kosten</dt>
                      <dd>Keine</dd>
                    </dl>
                    <p>
                      {Object.entries(v.skills)
                        .map(([k, n]) => `${capabilities[k]} ${n}`)
                        .join(" · ")}
                    </p>
                    <p>
                      {purchaseReason(s, v.id, b.id) || "Jetzt beschaffbar"}
                    </p>
                    <button
                      onClick={() =>
                        setCompare(compare.filter((id) => id !== v.id))
                      }
                    >
                      Aus Vergleich entfernen
                    </button>
                  </article>
                ))}
            </div>
          )}
          {selectedPurchase && (
            <div
              className="purchase-review"
              role="region"
              aria-label="Fahrzeugkauf bestätigen"
            >
              <h3>{selectedPurchase.name} beschaffen</h3>
              <p>
                Standort: {b.name} · ein Stellplatz · automatische Besatzung
              </p>
              <p>
                Kaufpreis <b>{credits(selectedPurchase.price)}</b> ·
                Verbleibendes Budget{" "}
                <b>{credits(s.money - selectedPurchase.price)}</b> · Laufende
                Kosten: keine
              </p>
              <div className="inline">
                <button
                  className="primary"
                  disabled={
                    readonly || form.busy || !!purchaseReason(s, purchase, b.id)
                  }
                  onClick={() =>
                    void form.run(async () => {
                      await command({
                        type: "buy",
                        kind: purchase,
                        home: b.id,
                      });
                      setPurchase("");
                    })
                  }
                >
                  {form.busy
                    ? "Kauf wird bestätigt …"
                    : "Kauf verbindlich bestätigen"}
                </button>
                <button disabled={form.busy} onClick={() => setPurchase("")}>
                  Abbrechen
                </button>
              </div>
              {purchaseReason(s, purchase, b.id) && (
                <p role="alert">{purchaseReason(s, purchase, b.id)}</p>
              )}
            </div>
          )}
          <div className="vehicle-shop">
            {available.map((v) => (
              <article key={v.id}>
                <div>
                  <h3>
                    <VehicleIcon type={v.id} /> {v.name}
                  </h3>
                  <small>
                    {Object.entries(v.skills)
                      .map(([k, n]) => `${capabilities[k]} ${n}`)
                      .join(" · ")}
                  </small>
                  <p>
                    {credits(v.price)} ·{" "}
                    {purchaseReason(s, v.id, b.id) || "Beschaffbar"}
                  </p>
                </div>
                <div className="inline">
                  <button
                    aria-pressed={compare.includes(v.id)}
                    disabled={!compare.includes(v.id) && compare.length >= 2}
                    onClick={() =>
                      setCompare(
                        compare.includes(v.id)
                          ? compare.filter((id) => id !== v.id)
                          : [...compare, v.id],
                      )
                    }
                  >
                    Vergleichen
                  </button>
                  <button
                    data-tutorial={`buy-${v.id}`}
                    disabled={
                      readonly || form.busy || !!purchaseReason(s, v.id, b.id)
                    }
                    onClick={() =>
                      requestDialogTransition(() => setPurchase(v.id))
                    }
                  >
                    Kauf prüfen
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!available.length && (
            <div className="empty-state">
              <h3>Keine passenden Fahrzeuge</h3>
              <button onClick={() => setQuery("")}>Suche zurücksetzen</button>
            </div>
          )}
        </>
      )}
      {tab === "expansion" && (
        <>
          <h3>Gebäude ausbauen</h3>
          <p>
            Aktuell {cap.slots} Stellplätze. Der Ausbau erhöht die
            Standortkapazität und passt die automatische Besetzung an. Fahrzeuge
            auf Rückfahrt bleiben bei vorhandener Einsatzbereitschaft
            alarmierbar.
          </p>
          <p>
            {upgradeReason ||
              `Nächste Stufe ${b.level + 1} · ${credits(upgradeCost)} · Budget danach ${credits(s.money - upgradeCost)}`}
          </p>
          <ConfirmAction
            disabled={readonly || !!upgradeReason}
            message={`Wache für ${credits(upgradeCost)} ausbauen? Bauzeit ${BALANCE.upgradeSeconds} Sekunden.`}
            onConfirm={() => command({ type: "upgrade", id: b.id })}
          >
            Ausbau bestätigen
          </ConfirmAction>
          <h3>Funktionen & Erweiterungen</h3>
          {extensions
            .filter((e) => e.home === b.type)
            .map((e) => (
              <article className="shop-card" key={e.id}>
                <h3>{e.name}</h3>
                <p>{e.types.map((id) => vt(id).name).join(" · ")}</p>
                <p>
                  {credits(e.price)} · ab Stufe {e.level}
                </p>
                {b.extensions.includes(
                  e.id as (typeof b.extensions)[number],
                ) ? (
                  <span className="good">Freigeschaltet</span>
                ) : (
                  <ConfirmAction
                    disabled={
                      readonly ||
                      s.money < e.price ||
                      level(s) < e.level ||
                      b.ready > s.time
                    }
                    message={`${e.name} für ${credits(e.price)} bauen?`}
                    onConfirm={() =>
                      command({ type: "extension", id: b.id, kind: e.id })
                    }
                  >
                    Erweiterung bauen
                  </ConfirmAction>
                )}
              </article>
            ))}
          <h3>Standort verkaufen</h3>
          <p>
            Ein Verkauf ist erst ohne Fahrzeuge, Patienten sowie gebundene oder
            verletzte Kräfte möglich. Erlös:{" "}
            {credits(saleValue(b.purchasePriceCents ?? bt(b.type).price))}. Der
            historische Kaufpreis bleibt die Berechnungsgrundlage.
          </p>
          <ConfirmAction
            disabled={readonly}
            message={`Standort für ${credits(saleValue(b.purchasePriceCents ?? bt(b.type).price))} verkaufen?`}
            onConfirm={() => command({ type: "sell", id: b.id })}
          >
            Standort verkaufen
          </ConfirmAction>
        </>
      )}
    </section>
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
    [favorite, setFavorite] = useState(false),
    [page, setPage] = useState(0);
  const form = useCommandForm();
  const ready = fleetReadiness(s);
  const matches = s.vehicles.filter(
    (v) =>
      (!favorite || v.favorite) &&
      `${v.name} ${vt(v.type).name} ${s.buildings.find((b) => b.id === v.home)?.name ?? ""}`
        .toLocaleLowerCase("de")
        .includes(filter.toLocaleLowerCase("de")),
  );
  const pages = Math.max(1, Math.ceil(matches.length / 50));
  const currentPage = Math.min(page, pages - 1);
  return (
    <div>
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <fieldset className="command-fields" disabled={form.busy}>
        <div className="inline">
          <input
            placeholder="Fahrzeug suchen …"
            aria-label="Fahrzeug suchen"
            value={filter}
            onChange={(e) => {
              const value = e.target.value;
              requestDialogTransition(() => {
                setFilter(value);
                setPage(0);
              });
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => {
                const checked = e.target.checked;
                requestDialogTransition(() => {
                  setFavorite(checked);
                  setPage(0);
                });
              }}
            />{" "}
            Favoriten
          </label>
        </div>
        <div className="vehicle-shop">
          {matches.slice(currentPage * 50, (currentPage + 1) * 50).map((v) => (
            <article className="fleet-card" key={v.id}>
              {onSelect && (
                <button
                  onClick={() => requestDialogTransition(() => onSelect(v.id))}
                >
                  Auf Karte auswählen
                </button>
              )}
              <div className="inline">
                <button
                  aria-label={`Favorit ${v.name}`}
                  onClick={() =>
                    requestDialogTransition(() => {
                      void form.run(() =>
                        command({ type: "favorite", id: v.id }),
                      );
                    })
                  }
                >
                  {v.favorite ? "★" : "☆"}
                </button>
                <div>
                  <b>
                    <VehicleIcon type={v.type} /> {v.name}
                  </b>
                  <small>
                    {s.buildings.find((b) => b.id === v.home)?.name} ·{" "}
                    {statuses[v.status]} · FMS{" "}
                    {s.desk.fleet[v.id]?.code ?? operativeCode(v)}
                  </small>
                  <small className={ready(v) ? "warning" : "good"}>
                    {v.availability?.reason ||
                      ready(v) ||
                      "Vollständig einsatzbereit"}
                  </small>
                  {v.status !== "ready" && (
                    <small>{tripLabel(v, s.time)}</small>
                  )}
                </div>
              </div>
              <div className="inline">
                <RenameAction
                  name={v.name}
                  onSave={(name) => command({ type: "rename", id: v.id, name })}
                />
                {v.status !== "ready" ? (
                  <button
                    onClick={() =>
                      void form.run(() => command({ type: "recall", id: v.id }))
                    }
                  >
                    Rückruf
                  </button>
                ) : (
                  <>
                    <select
                      aria-label={`Versetzen ${v.name}`}
                      value={v.home}
                      onChange={(e) =>
                        void form.run(() =>
                          command({
                            type: "move",
                            id: v.id,
                            home: e.target.value,
                          }),
                        )
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
                    <ConfirmAction
                      message={`${v.name} für ${credits(saleValue(v.purchasePriceCents ?? vt(v.type).price))} verkaufen? Besatzung bleibt erhalten.`}
                      onConfirm={() => command({ type: "sell", id: v.id })}
                    >
                      Verkaufen
                    </ConfirmAction>
                  </>
                )}
              </div>
              <Disclosure title="Besatzung & Einsatzbereitschaft">
                <VehicleStaffing s={s} v={v} />
              </Disclosure>
            </article>
          ))}
        </div>
        {pages > 1 && (
          <nav className="list-pagination" aria-label="Fahrzeugseiten">
            <button
              disabled={!currentPage}
              onClick={() =>
                requestDialogTransition(() => setPage(currentPage - 1))
              }
            >
              Zurück
            </button>
            <span>
              {currentPage + 1}/{pages} · {matches.length} Fahrzeuge
            </span>
            <button
              disabled={currentPage + 1 >= pages}
              onClick={() =>
                requestDialogTransition(() => setPage(currentPage + 1))
              }
            >
              Weiter
            </button>
          </nav>
        )}
        {!!s.vehicles.length && !matches.length && (
          <p className="empty">Keine Fahrzeuge für diesen Filter.</p>
        )}
        {!s.vehicles.length && (
          <p className="empty">
            Deine ersten Fahrzeuge kaufst du in einer erworbenen,
            betriebsbereiten Wache.
          </p>
        )}
      </fieldset>
    </div>
  );
}
