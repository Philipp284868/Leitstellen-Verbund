import { useEffect, useState } from "react";
import { BuildingIcon } from "../../shared/map-icons";
import type { Save } from "../../shared/model";
import { command, useGame } from "../store";
import { credits } from "../ui";
import type { facilityOffer } from "../../shared/facilities/purchase";
import {
  facilityKinds,
  facilityLabels,
  type FacilityKind,
} from "../../shared/facilities/types";
import "./Facilities.css";
type Offer = ReturnType<typeof facilityOffer>;
export function useFacilities<T>(query: string, revision: string | number = 0) {
  const { mode } = useGame();
  const [result, setResult] = useState<{
    data?: T;
    error?: string;
    loading: boolean;
  }>({ loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setResult({ loading: true });
    const timer = setTimeout(() => {
      void fetch(`/api/facilities?${query}`, {
        signal: controller.signal,
        credentials: "same-origin",
        headers: { "x-game-mode": mode },
      })
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok)
            throw Error(
              data.error || "Standorte konnten nicht geladen werden.",
            );
          if (!controller.signal.aborted) setResult({ data, loading: false });
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setResult({ error: String(e.message), loading: false });
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, revision, mode]);
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
  const response = useFacilities<Offer>(
    new URLSearchParams({ id }).toString(),
    `${s.money}:${s.xp}:${s.buildings.map((b) => b.facility?.id).join(",")}`,
  );
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setConfirm(false);
    setError("");
  }, [id]);
  const offer = response.data,
    f = offer?.facility;
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
          <p>
            {f.address || "Adresse nicht vollständig erfasst"} · {f.state}
          </p>
          <p className="facility-status">
            {offer.owned
              ? "✓ Eigener Standort"
              : offer.reason
                ? "⊘ Derzeit gesperrt"
                : "+ Erwerbbar"}
          </p>
          <dl>
            <dt>Kaufpreis im Spiel</dt>
            <dd>{credits(offer.price)}</dd>
            <dt>Freischaltung</dt>
            <dd>Stufe {offer.level}</dd>
            <dt>Spielkapazität</dt>
            <dd>
              {offer.slots
                ? `${offer.slots} Stellplätze · automatische Grundbesetzung`
                : f.kind === "hospital"
                  ? "20 Behandlungsplätze · simulierte Fachbereiche"
                  : "Ausbildungsbetrieb"}
            </dd>
            <dt>Untertyp laut Quelle</dt>
            <dd>{f.subtype === "unknown" ? "Nicht belegt" : f.subtype}</dd>
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
          <p className="hint">
            {f.kind !== "hospital" &&
              "Nach dem Kauf wird der Spielbetrieb innerhalb von 25 Sekunden vorbereitet. "}
            Personal, Fahrzeuge, Betten und Preise sind Spielwerte. Du erwirbst
            das Verwaltungsrecht für deine Leitstelle; andere Leitstellen
            bleiben unabhängig.
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
          {offer.reason && !offer.owned && <p role="status">{offer.reason}</p>}
          {error && <p role="alert">{error}</p>}
          {offer.owned ? (
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
                  void command({ type: "purchase-facility", facility: f.id })
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
    [status, setStatus] = useState("all"),
    [selected, setSelected] = useState("");
  const { data, error, loading } = useFacilities<{
    offers: Offer[];
    snapshot: string;
  }>(
    new URLSearchParams({ q: query, kind, status }).toString(),
    `${s.money}:${s.xp}:${s.buildings.map((b) => b.facility?.id).join(",")}`,
  );
  return (
    <div className="facility-browser">
      <p className="view-intro">
        Wähle einen echten Standort aus dem Deutschlandkatalog. Standort und
        Zufahrt stehen fest. Einsteiger können mit einer nutzbaren Feuerwache
        und einem TSF-W beginnen.
      </p>
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
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Alle Standorte</option>
            <option value="available">Jetzt erwerbbar</option>
            <option value="owned">Eigene Standorte</option>
            <option value="locked">Noch gesperrt</option>
          </select>
        </label>
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
                <small>{o.facility.address || o.facility.state}</small>
                <small>
                  {o.owned
                    ? "✓ Eigener Standort"
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
          <p className="hint">
            Bis zu 80 Treffer. Suche eingrenzen, um weitere Orte zu finden.
          </p>
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
