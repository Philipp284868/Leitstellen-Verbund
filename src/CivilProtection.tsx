import { useState } from "react";
import type { Save, Building } from "./model";
import { bt } from "./catalog";
import { command, useGame } from "./store";
import { useCommandForm } from "./use-command-form";
import {
  civilReadinessReason,
  civilStationTypes,
} from "./simulation/civil-protection";
import { fleetReadiness } from "./fleet-view";
import { duration } from "./travel";
import "./RadioDesk.css";

export function CivilStationSettings({ s, b }: { s: Save; b: Building }) {
  const { readonly } = useGame();
  const [minutes, setMinutes] = useState<number | null>(null);
  const preparation =
    minutes === null ? (b.civilProtection?.preparation ?? 600) : minutes * 60;
  const form = useCommandForm(
    minutes !== null && preparation !== b.civilProtection?.preparation,
    () => setMinutes(null),
  );
  if (!civilStationTypes.includes(b.type)) return null;
  const c = b.civilProtection;
  const configure = async (enabled: boolean) => {
    if (
      await form.run(() =>
        command({ type: "civil-station", home: b.id, enabled, preparation }),
      )
    )
      setMinutes(null);
  };
  return (
    <section aria-label={`KatS-Einrichtung ${b.name}`}>
      <h3>KatS-Wache</h3>
      <p>
        Feuerwehr, Rettungsdienst und THW behalten ihre Fahrzeuge, Stellplätze
        und Besatzung. Eine KatS-Wache muss vor der Alarmierung mobilisiert
        werden.
      </p>
      {form.error && (
        <p role="alert" className="error">
          {form.error}
        </p>
      )}
      <fieldset
        className="command-fields"
        disabled={
          readonly ||
          form.busy ||
          b.ready > s.time ||
          (!!c && c.state !== "inactive")
        }
      >
        <label>
          Vorbereitungszeit in Minuten
          <input
            type="number"
            min="1"
            max="30"
            step="1"
            value={preparation / 60}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </label>
        <button onClick={() => void configure(true)}>
          {c?.enabled ? "Vorbereitungszeit speichern" : "Als KatS-Wache führen"}
        </button>
        {c?.enabled && (
          <button onClick={() => void configure(false)}>
            Als reguläre Wache führen
          </button>
        )}
      </fieldset>
      {c && c.state !== "inactive" && (
        <p>Zum Ändern zuerst die Bereitschaft beenden.</p>
      )}
    </section>
  );
}

export function CivilProtectionDesk({
  s,
  onOpen,
  onBuild,
}: {
  s: Save;
  onOpen: (id: string) => void;
  onBuild: () => void;
}) {
  const { readonly, workspace } = useGame();
  const [selected, setSelected] = useState<string[]>([]);
  const form = useCommandForm(selected.length > 0, () => setSelected([]));
  const ready = fleetReadiness(s);
  const stations = s.buildings.filter((b) =>
    civilStationTypes.includes(b.type),
  );
  const operation = async (op: "mobilize" | "stand-down") => {
    if (
      await form.run(() =>
        command({ type: "civil-readiness", homes: selected, op }),
      )
    )
      setSelected([]);
  };
  return (
    <section className="radio-workspace" aria-label="Katastrophenbereitschaft">
      <p>
        KatS-Wachen auswählen und gemeinsam mobilisieren. Die Vorbereitung läuft
        auf dem Server weiter. Danach bleiben Fahrzeugzustand, Besatzung und
        reguläre Ausrückzeit maßgeblich.
      </p>
      <button onClick={onBuild}>Neuen Standort bauen</button>
      {readonly && (
        <p role="status">
          Verbindung unterbrochen. Bereitschaftsaktionen sind gesperrt.
        </p>
      )}
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <fieldset className="command-fields" disabled={readonly || form.busy}>
        <div className="action-grid">
          <button
            disabled={!selected.length}
            onClick={() => void operation("mobilize")}
          >
            Ausgewählte Wachen mobilisieren
          </button>
          <button
            disabled={!selected.length}
            onClick={() => void operation("stand-down")}
          >
            Bereitschaft beenden
          </button>
        </div>
        {stations
          .filter((b) => b.civilProtection?.enabled)
          .map((b) => {
            const c = b.civilProtection!;
            const fleet = s.vehicles.filter((v) => v.home === b.id);
            const reason = civilReadinessReason(s, b);
            return (
              <article className="radio-conversation" key={b.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(b.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, b.id]
                          : selected.filter((id) => id !== b.id),
                      )
                    }
                  />
                  {b.name}
                </label>
                <p>
                  {reason || "Vorbereitung abgeschlossen"} ·{" "}
                  {fleet.filter((v) => !ready(v)).length}/{fleet.length}{" "}
                  Fahrzeuge alarmierbar
                </p>
                {c.state === "mobilizing" && (
                  <progress
                    max={c.preparation}
                    value={Math.max(0, c.preparation - (c.readyAt - s.time))}
                    aria-label={`Vorbereitung ${b.name}`}
                  />
                )}
                <ul>
                  {fleet.map((v) => (
                    <li key={v.id}>
                      {v.name}: {ready(v) || "Alarmierbar"}
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>
                    Bereitschaftsverlauf · {c.history.length} Einträge
                  </summary>
                  <ol>
                    {[...c.history].reverse().map((e, i) => (
                      <li key={i}>
                        {new Date(e.at * 1000).toLocaleString("de-DE")} ·{" "}
                        {workspace?.members.find((u) => u.id === e.actor)
                          ?.name ?? e.actor}{" "}
                        · {e.text}
                      </li>
                    ))}
                  </ol>
                </details>
                <button onClick={() => onOpen(b.id)}>
                  Wachendetails öffnen
                </button>
              </article>
            );
          })}
      </fieldset>
      {!stations.some((b) => b.civilProtection?.enabled) && (
        <p>
          Noch keine KatS-Wache eingerichtet. Einen vorhandenen Standort unten
          auswählen oder einen neuen Standort bauen.
        </p>
      )}
      <h3>Standorte einrichten</h3>
      {stations.map((b) => (
        <details key={b.id}>
          <summary>
            {b.name} · {bt(b.type).org}
            {b.civilProtection?.enabled
              ? ` · KatS · ${duration(b.civilProtection.preparation)} Vorbereitung`
              : ""}
          </summary>
          <CivilStationSettings s={s} b={b} />
        </details>
      ))}
      <p>
        Die letzten 200 Bereitschaftseinträge je Standort bleiben gespeichert.
        Das Beenden ist erst nach Rückkehr und Nachbereitung aller Fahrzeuge
        möglich.
      </p>
    </section>
  );
}
