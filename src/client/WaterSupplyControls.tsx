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
        Hydrantenleistung ist ein Simulationswert des Einsatzszenarios.
        Gewässerentnahme benötigt ein kartiertes Gewässer und Pumpen.
        Tankpendelverkehr bindet Tanker an den Wassernachschub.
      </p>
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
