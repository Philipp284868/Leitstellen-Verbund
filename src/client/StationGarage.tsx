import { useState } from "react";
import "./StationGarage.css";
import type { Building, Save, Vehicle } from "../shared/model";
import { VehicleIcon } from "../shared/map-icons";
import { vt } from "../shared/catalog";
import { operativeCode } from "../simulation/fms";
import { useGame } from "./store";
import { requestDialogTransition } from "./dialog-state";

import { garageIndex } from "../simulation/garage";
export { garageIndex } from "../simulation/garage";
export function StationGarage({
  s,
  b,
  onOpen,
  group,
}: {
  s: Save;
  b: Building;
  onOpen: (id: string) => void;
  group?: ReturnType<typeof garageIndex> extends Map<string, infer V>
    ? V
    : never;
}) {
  const { user, mode } = useGame();
  const key = `lv-garage-v1:${user?.id ?? s.player.id}:${mode}:${s.generation}:${b.id}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const fleet = group ?? garageIndex(s).get(b.id)!;

  const list = (values: Vehicle[]) => (
    <ul className="garage-list">
      {values.map((v) => (
        <li key={v.id}>
          <button onClick={() => requestDialogTransition(() => onOpen(v.id))}>
            <VehicleIcon type={v.type} />
            <span>
              <b>{v.name}</b>
              <small>
                {vt(v.type).name} · FMS{" "}
                {s.desk.fleet[v.id]?.code ?? operativeCode(v)}
              </small>
              <small>
                {v.availability?.reason ||
                  (v.availability?.alarmable
                    ? "Einsatzbereit"
                    : "Status wird aktualisiert")}
              </small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <details
      className="station-garage"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        setOpen(next);
        try {
          localStorage.setItem(key, next ? "1" : "0");
        } catch {
          /* Storage may be disabled; the current disclosure stays usable. */
        }
      }}
    >
      <summary>Fahrzeuge in der Garage ({fleet.inside.length})</summary>
      {open && (
        <>
          {fleet.inside.length ? (
            list(fleet.inside)
          ) : (
            <p>Kein Fahrzeug physisch an diesem Standort.</p>
          )}
          {fleet.away.length > 0 && (
            <>
              <h4>Zugehörige Fahrzeuge unterwegs ({fleet.away.length})</h4>
              {list(fleet.away)}
            </>
          )}
        </>
      )}
    </details>
  );
}
