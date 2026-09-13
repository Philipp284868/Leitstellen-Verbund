import type { Mission } from "../shared/model";
import { command, useGame } from "./store";
import { useCommandForm } from "./use-command-form";
export function WaterSupplyControls({ m }: { m: Mission }) {
  const form = useCommandForm(),
    { readonly } = useGame(),
    w = m.waterSupply;
  if (!w || !m.control?.briefed) return null;
  return (
    <details open={!!w.shortage}>
      <summary>Löschwasser und Schlauchmaterial</summary>
      <p>
        Benötigt: {w.hoseB} m B · {w.hoseC} m C. Durchfluss{" "}
        {Math.round(w.flow * 60)} l/min · Verbrauch {Math.round(w.consumed)} l.
      </p>
      <p>
        Quellen stammen aus kartierter Infrastruktur oder gekennzeichneten,
        ortsabhängigen Ergänzungen. Ihre endliche Förderleistung ist ein
        gemeinsam genutzter Spielwert. Gewässerentnahme benötigt einen
        bestätigten Zugang, Pumpen und Schlauchmaterial.
      </p>
      {(w.connection?.source ?? w.refillSource) && (
        <p>
          {(w.connection?.source ?? w.refillSource)!.origin === "openstreetmap"
            ? "Kartierte Entnahmestelle"
            : "Simulierte Ergänzung"}{" "}
          · {(w.connection?.source ?? w.refillSource)!.id} ·{" "}
          {(w.connection?.source ?? w.refillSource)!.flowLpm} l/min insgesamt
          {w.connection &&
            ` · ${Math.ceil(w.connection.meters)} m geprüfter Schlauchweg`}
        </p>
      )}
      {w.setupUntil && (
        <small>
          Leitungsaufbau bis{" "}
          {new Date(w.setupUntil * 1000).toLocaleTimeString("de-DE")}.
          Tankversorgung bleibt währenddessen verfügbar.
        </small>
      )}
      {w.shortage && (
        <p className="warning" role="status">
          {w.shortage}
        </p>
      )}
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <label>
        Wasserentnahme
        <select
          disabled={readonly || form.busy || m.phase === "done"}
          value={w.source}
          onChange={(e) =>
            void form.run(() =>
              command({
                type: "water-source",
                mission: m.id,
                source: e.target.value as typeof w.source,
              }),
            )
          }
        >
          <option value="tank">Fahrzeugtanks</option>
          <option value="hydrant">Hydrant</option>
          <option value="open-water">Offenes Gewässer</option>
          <option value="shuttle">Tankpendelverkehr</option>
        </select>
      </label>
    </details>
  );
}
