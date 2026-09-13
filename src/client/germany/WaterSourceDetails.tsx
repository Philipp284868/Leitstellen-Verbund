import type { WaterSource } from "../../shared/germany/water";
import { useFacilities } from "../facilities/FacilityBrowser";
export function WaterSourceDetails({
  source,
  onClose,
}: {
  source: WaterSource;
  onClose: () => void;
}) {
  const { data, loading, error } = useFacilities<{ source: WaterSource }>(
    new URLSearchParams({
      source: source.id,
      x: String(source.pos.x),
      y: String(source.pos.y),
    }).toString(),
    0,
    "/api/water",
  );
  const checked = data?.source;
  return (
    <section
      className="facility-map-panel facility-details"
      aria-label="Wasserentnahmestelle"
    >
      <button
        className="close"
        aria-label="Wasserquelle schließen"
        onClick={onClose}
      >
        ×
      </button>
      <h3>
        {source.kind === "hydrant" ? "Hydrant" : "Gewässerentnahmestelle"}
      </h3>
      <p>
        {source.origin === "openstreetmap"
          ? "Kartierte OSM-Quelle"
          : "Simulierte Infrastrukturergänzung"}{" "}
        · {source.id}
      </p>
      {loading && (
        <p role="status">Zugang und Quellenangaben werden geprüft …</p>
      )}
      {error && <p role="alert">{error}</p>}
      {checked && (
        <>
          <p>
            {checked.usable === false
              ? checked.reason
              : `${checked.flowLpm} l/min modellierte Förderleistung insgesamt`}
          </p>
          <p>
            Gemeinsam genutzter Spielwert, keine reale Versorgungszusage.
            Schlauchweg, Material und Aufbau werden im Einsatz geprüft.
          </p>
          <details>
            <summary>Quellen und Eigenschaften</summary>
            <p>Datenstand {checked.snapshot}</p>
            {checked.quality.map((q) => (
              <p key={q}>{q}</p>
            ))}
            <dl>
              {Object.entries(checked.properties).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      )}
    </section>
  );
}
