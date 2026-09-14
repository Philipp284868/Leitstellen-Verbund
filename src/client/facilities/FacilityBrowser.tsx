import { bt } from "../../shared/catalog";
import {
  FIRE_GAME_PROFILES,
  fireProfileKinds,
  fireProfileLabels,
} from "../../shared/facilities/fire-profile";
import { FireProfileDetails } from "./FireProfileDetails";
import { progress } from "../../shared/progression";
import { FacilityReader } from "./reader";
import { useRef } from "react";
import { useEffect, useState } from "react";
import { BuildingIcon } from "../../shared/map-icons";
import type { Save } from "../../shared/model";
import { command, useGame } from "../store";
import { credits } from "../ui";
import { facilityOffer } from "../../shared/facilities/purchase";
import { useInfrastructure } from "../infrastructure";
import { specialties } from "../../simulation/organizations-schema";
import {
  facilityKinds,
  facilityLabels,
  type FacilityKind,
} from "../../shared/facilities/types";
import "./Facilities.css";
// Offer validity changes at affordability/unlock boundaries, not at every cent or XP tick.
function purchaseRevision(s: Save) {
  return `${Object.values(FIRE_GAME_PROFILES)
    .map((p) => (s.money >= p.price ? "1" : "0"))
    .join("")}:${progress(s.xp).level}:${facilityKinds
    .filter((k) => k !== "other")
    .map((k) => (s.money >= bt(k).price ? "1" : "0"))
    .join(
      "",
    )}:${s.buildings.length}:${s.buildings.map((b) => b.facility?.id).join(",")}`;
}
type Offer = ReturnType<typeof facilityOffer>;
type ListOffer = Omit<Offer, "facility"> & {
  facility: Pick<
    Offer["facility"],
    "id" | "kind" | "name" | "address" | "state" | "pos" | "fireProfile"
  >;
};
export function useFacilities<T>(
  query: string,
  revision: string | number = 0,
  endpoint = "/api/facilities",
) {
  const { mode, user, workspace } = useGame();
  const actor = user?.id || "anonymous",
    owner = workspace?.owner || actor;
  const [result, setResult] = useState<{
    data?: T;
    error?: string;
    loading: boolean;
  }>({ loading: true });
  const reader = useRef<FacilityReader<T> | undefined>(undefined);
  const latest = useRef({ query, revision });
  latest.current = { query, revision };
  useEffect(() => {
    setResult({ loading: true });
    const activate = () => {
      reader.current?.destroy();
      reader.current = undefined;
      if (document.hidden) return;
      reader.current = new FacilityReader<T>(
        (data) => setResult({ data, loading: false }),
        (state) =>
          setResult((prior) => ({
            ...prior,
            loading: state.loading,
            error: state.error,
          })),
        { "x-game-mode": mode },
        actor,
        endpoint,
      );
      reader.current.request(
        latest.current.query,
        String(latest.current.revision),
      );
    };
    activate();
    document.addEventListener("visibilitychange", activate);
    return () => {
      reader.current?.destroy();
      document.removeEventListener("visibilitychange", activate);
    };
  }, [mode, actor, owner, endpoint]);
  useEffect(() => {
    reader.current?.request(query, String(revision));
  }, [query, revision]);
  return result;
}
export function FacilityDetails({
  s,
  id,
  onManage,
  onClose,
  readonly = false,
}: {
  s: Save;
  id: string;
  onManage: (id: string) => void;
  onClose?: () => void;
  readonly?: boolean;
}) {
  const infra = useInfrastructure([id]);
  const response = useFacilities<Offer>(
    new URLSearchParams({ id }).toString(),
    purchaseRevision(s),
  );
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setConfirm(false);
    setError("");
  }, [id]);
  const f = response.data?.facility;
  const ownership = infra.facilities.includes(id)
    ? infra.ownership.find((o) => o.facility === id)
    : response.data?.ownership;
  const clinic = response.data?.clinic
    ? {
        ...response.data.clinic,
        ...infra.clinics[`public:${id}`],
        revision: infra.revision,
      }
    : undefined;
  const offer = f ? facilityOffer(s, f, ownership, clinic) : undefined;
  return (
    <section className="facility-details" aria-label="Standortdetails">
      {onClose && (
        <button
          className="close"
          aria-label="Standort schließen"
          onClick={onClose}
        >
          ×
        </button>
      )}
      {response.loading && <p role="status">Standort wird geladen …</p>}
      {response.error && <p role="alert">{response.error}</p>}
      {offer && f && (
        <>
          <span className="eyebrow">
            <BuildingIcon type={f.kind} /> {facilityLabels[f.kind]}
          </span>
          <h2>{f.name || `${facilityLabels[f.kind]} · Name nicht erfasst`}</h2>
          {f.fireProfile && <FireProfileDetails profile={f.fireProfile} />}
          <p>
            {f.address || "Postadresse in der Quelle nicht erfasst"} · {f.state}
          </p>
          <p className="facility-status">
            {f.kind === "hospital"
              ? "Servereinrichtung · gemeinsame Klinikaufnahme"
              : offer.owned
                ? "✓ Eigener Standort"
                : offer.reason
                  ? `⊘ ${offer.reason}`
                  : "+ Kauf möglich · Fahrweg wird bei Bestätigung geprüft"}
          </p>
          <dl>
            {f.kind !== "hospital" && (
              <>
                <dt>Kaufpreis im Spiel</dt>
                <dd>{credits(offer.price)}</dd>
                <dt>Freischaltung</dt>
                <dd>Stufe {offer.level}</dd>
                <dt>Spielkapazität</dt>
                <dd>
                  {offer.slots
                    ? `${offer.slots} Stellplätze · automatische Grundbesetzung`
                    : "Ausbildungsbetrieb"}
                </dd>
              </>
            )}
            <dt>Eigentümer</dt>
            <dd>
              {f.kind === "hospital"
                ? "Server"
                : offer.owned
                  ? "Deine Leitstelle"
                  : (ownership?.name ?? "Noch nicht erworben")}
            </dd>
            <dt>Untertyp laut Quelle</dt>
            <dd>
              {f.fireProfile
                ? fireProfileLabels[f.fireProfile.kind]
                : f.subtype === "unknown"
                  ? "Nicht belegt"
                  : f.subtype}
            </dd>
            <dt>Zufahrt</dt>
            <dd>
              {f.access
                ? f.access.method === "entrance"
                  ? "Kartierter Zugang mit Straßenanbindung"
                  : f.access.method === "air-base"
                    ? "Kartierte Luftrettungsbasis"
                    : "Straßenzugang am Standort"
                : "Ungeklärt – Kauf gesperrt"}
            </dd>
            {f.kind === "hospital" && (
              <>
                <dt>Reale Notaufnahme</dt>
                <dd>
                  {f.emergency === "yes"
                    ? "In OSM eingetragen"
                    : f.emergency === "no"
                      ? "Laut Quelle keine Notaufnahme"
                      : "Unbekannt; Fähigkeiten sind Spielwerte"}
                </dd>
              </>
            )}
          </dl>
          {clinic && (
            <section
              className="clinic-capacity"
              aria-label="Gemeinsame Klinikbetten"
            >
              <h3>
                {clinic.open ? "Aufnahme geöffnet" : "Keine Notfallaufnahme"}
              </h3>
              <p>
                {readonly
                  ? "Offline · letzte bestätigte Kapazität"
                  : "Gemeinsame Spielkapazität"}
                :{" "}
                <strong>
                  {clinic.free} / {clinic.total} Betten frei
                </strong>
              </p>
              <p>
                {clinic.occupied} belegt · {clinic.reserved} für Anfahrten
                reserviert
              </p>
              {clinic.occupied + clinic.reserved > clinic.total && (
                <p role="status">
                  Übernommener Übergangsbestand: Alle bisherigen Patienten und
                  Anfahrten bleiben erhalten. Neue Aufnahmen warten auf freie
                  Kapazität.
                </p>
              )}
              <p>
                {clinic.specialties
                  .map((d) => specialties[d as keyof typeof specialties] ?? d)
                  .join(" · ")}
              </p>
              <small>
                Simulierte Behandlungsplätze, keine echten aktuellen
                Krankenhausbelegungen. Reservierungen bleiben während der
                Anfahrt erhalten.
              </small>
            </section>
          )}
          <p className="hint">
            {f.kind !== "hospital" &&
              "Nach dem Kauf wird der Spielbetrieb innerhalb von 25 Sekunden vorbereitet. "}
            {f.kind === "hospital"
              ? "Diese reale Klinik wird vom Server betrieben. Alle Leitstellen nutzen dieselben Spielkapazitäten."
              : "Personal, Fahrzeuge und Preise sind Spielwerte. Der reale Wachstandort besitzt genau einen Eigentümer in dieser Serverwelt."}
          </p>
          {f.quality.length > 0 && (
            <details>
              <summary>Quellen und Datenhinweise</summary>
              <ul>
                {f.quality.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
              <p>
                OSM-Datenstand {f.snapshot} · © OpenStreetMap contributors ·
                ODbL
              </p>
              {f.sources
                .filter((ref) => /^(node|way|relation):\d+$/.test(ref))
                .slice(0, 5)
                .map((ref) => (
                  <a
                    key={ref}
                    href={`https://www.openstreetmap.org/${ref.replace(":", "/")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {ref}
                  </a>
                ))}
            </details>
          )}
          {error && <p role="alert">{error}</p>}
          {f.kind === "hospital" ||
          (ownership && !offer.owned) ? null : offer.owned ? (
            <button className="primary" onClick={() => onManage(offer.owned!)}>
              Verwalten
            </button>
          ) : confirm ? (
            <div className="facility-confirm">
              <p>
                Diesen festen Standort für <b>{credits(offer.price)}</b>{" "}
                erwerben? Verbleibendes Budget: {credits(s.money - offer.price)}
                .
              </p>
              <button
                className="primary"
                disabled={busy || readonly || !!offer.reason}
                onClick={() => {
                  if (busy) return;
                  setBusy(true);
                  setError("");
                  void command({
                    type: "purchase-facility",
                    facility: f.id,
                    quote: offer.quote,
                  })
                    .then(() => setConfirm(false))
                    .catch((e) => setError(String(e.message || e)))
                    .finally(() => setBusy(false));
                }}
              >
                {busy ? "Kauf wird geprüft …" : "Kauf verbindlich bestätigen"}
              </button>
              <button disabled={busy} onClick={() => setConfirm(false)}>
                Abbrechen
              </button>
            </div>
          ) : (
            <button
              className="primary"
              disabled={readonly || !!offer.reason}
              onClick={() => setConfirm(true)}
            >
              Kaufen · {credits(offer.price)}
            </button>
          )}
        </>
      )}
    </section>
  );
}
export function FacilityBrowser({
  s,
  onManage,
  onMap,
  readonly = false,
}: {
  s: Save;
  onManage: (id: string) => void;
  onMap?: () => void;
  readonly?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState<FacilityKind | "">("fire"),
    [fireKind, setFireKind] = useState(""),
    [status, setStatus] = useState("all"),
    [selected, setSelected] = useState(""),
    [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [query, kind, status, fireKind]);
  const { data, error, loading } = useFacilities<{
    offers: ListOffer[];
    snapshot: string;
    nextOffset: number | null;
  }>(
    new URLSearchParams({
      q: query,
      kind,
      fireKind: kind === "fire" ? fireKind : "",
      status: kind === "hospital" ? "all" : status,
      offset: String(offset),
    }).toString(),
    purchaseRevision(s),
  );
  const infra = useInfrastructure(
    (data?.offers ?? []).map((o) => o.facility.id),
  );
  return (
    <div className="facility-browser">
      <p className="view-intro">
        Wähle einen echten Standort aus dem Deutschlandkatalog. Standort und
        Zufahrt stehen fest. Einsteiger können mit einer nutzbaren Feuerwache
        und einem TSF-W beginnen.
      </p>
      {!s.buildings.some((b) => b.type === "fire" && !b.migrationReserve) && (
        <p>
          Kein freies, belegtes Gerätehaus in deinem Ort? Suche nach anderen
          realen Einstiegsstandorten in Deutschland.
          <button
            onClick={() => {
              setQuery("");
              setKind("fire");
              setFireKind("ff");
              setStatus("available");
              setOffset(0);
              setSelected("");
            }}
          >
            Freie FF für den Einstieg finden
          </button>
        </p>
      )}
      <div className="facility-filters">
        <label>
          Ort, Adresse oder Standortname
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="z. B. Berlin oder dein Ortsname"
          />
        </label>
        <label>
          Organisation
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as FacilityKind | "")}
          >
            <option value="">Alle Einrichtungen</option>
            {facilityKinds.map((k) => (
              <option key={k} value={k}>
                {facilityLabels[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kaufstatus
          <select
            value={kind === "hospital" ? "all" : status}
            disabled={kind === "hospital"}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Alle Standorte</option>
            <option value="available">Jetzt erwerbbar</option>
            <option value="owned">Eigene Standorte</option>
            <option value="locked">Noch gesperrt</option>
          </select>
        </label>
        {kind === "fire" && (
          <label>
            Wachtyp
            <select
              value={fireKind}
              onChange={(e) => setFireKind(e.target.value)}
            >
              <option value="">Alle Wachtypen</option>
              {fireProfileKinds.map((k) => (
                <option key={k} value={k}>
                  {fireProfileLabels[k]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {loading && <p role="status">Standorte werden gesucht …</p>}
      {error && <p role="alert">{error}</p>}
      <div className="facility-columns">
        <div className="facility-results" aria-label="Standortergebnisse">
          {data?.offers.map((o) => (
            <button
              key={o.facility.id}
              className="facility-result"
              aria-pressed={selected === o.facility.id}
              onClick={() => {
                setSelected(o.facility.id);
                window.dispatchEvent(
                  new CustomEvent("lv:map-focus", {
                    detail: { point: o.facility.pos, zoom: 16 },
                  }),
                );
              }}
            >
              <BuildingIcon type={o.facility.kind} />
              <span>
                <b>{o.facility.name || facilityLabels[o.facility.kind]}</b>
                {o.facility.fireProfile && (
                  <small>
                    {fireProfileLabels[o.facility.fireProfile.kind]}
                  </small>
                )}
                <small>{o.facility.address || o.facility.state}</small>
                <small>
                  {o.facility.kind === "hospital"
                    ? `Serverklinik · ${readonly ? "Offline · " : ""}${infra.clinics[`public:${o.facility.id}`] ? `${infra.clinics[`public:${o.facility.id}`].free} / ${infra.clinics[`public:${o.facility.id}`].total} Betten frei` : "gemeinsame Aufnahme"}`
                    : o.owned
                      ? "✓ Eigener Standort"
                      : infra.ownership.find(
                            (p) => p.facility === o.facility.id,
                          )
                        ? `Besitz von ${infra.ownership.find((p) => p.facility === o.facility.id)!.name}`
                        : o.reason
                          ? `⊘ ${o.reason}`
                          : `+ ${credits(o.price)} · Stufe ${o.level}`}
                </small>
              </span>
            </button>
          ))}
          {data && !data.offers.length && (
            <p>
              Keine passenden Standorte gefunden. Suche erweitern oder
              Organisation und Kaufstatus ändern.
            </p>
          )}
          <div aria-label="Standortseiten">
            <button
              disabled={loading || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 80))}
            >
              Zurück
            </button>
            <span>Seite {Math.floor(offset / 80) + 1}</span>
            <button
              disabled={loading || data?.nextOffset == null}
              onClick={() => setOffset(data!.nextOffset!)}
            >
              Weitere Standorte
            </button>
          </div>
        </div>
        {selected && (
          <FacilityDetails
            s={s}
            id={selected}
            readonly={readonly}
            onManage={onManage}
            onClose={() => setSelected("")}
          />
        )}
      </div>
      {onMap && (
        <button onClick={onMap}>
          Standorte direkt auf der Karte auswählen
        </button>
      )}
    </div>
  );
}
