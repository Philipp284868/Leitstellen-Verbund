import { useState } from "react";
import type { Save, Building } from "../shared/model";
import { command, useGame } from "./store";
import { useCommandForm } from "./use-command-form";
import {
  civilReadinessReason,
  civilStationTypes,
  readinessRecommendation,
} from "../simulation/civil-protection";
import { fleetReadiness } from "../shared/fleet-view";
import "./RadioDesk.css";
import { readinessHalfHour } from "../simulation/operating-costs";
import { credits } from "./ui";

export function CivilStationSettings({ s, b }: { s: Save; b: Building }) {
  const { readonly, workspace } = useGame();
  const form = useCommandForm(false, () => {});
  if (!civilStationTypes.includes(b.type)) return null;
  const c = b.civilProtection;
  return (
    <section aria-label={`KatS-Einrichtung ${b.name}`}>
      <h3>Katastrophenbereitschaft</h3>
      <p>
        Auch ohne Katastrophenalarm regulär alarmierbar. Bereitschaft sammelt
        vorhandene freiwillige Kräfte vorab an der Wache; erst nach ihrer
        Anreise entfällt das erneute Sammeln.
      </p>
      {b.readinessCore && (
        <p>
          {b.readinessCore.count} hauptamtliche Kräfte bilden den ständigen
          Bereitschaftskern. Gebundene oder verletzte Kräfte stehen nicht
          doppelt zur Verfügung.
        </p>
      )}
      <p>{civilReadinessReason(s, b)}</p>
      <p>
        Bei aktivierter Bereitschaft: derzeit {credits(readinessHalfHour(s, b))}{" "}
        je 30 Minuten, abhängig von Personal, Fahrzeugen und Einsatzbindung.
      </p>
      {!!c?.billing && (
        <p>
          Bereits abgerechnet: {credits(c.billing.paid)} · offene Kosten:{" "}
          {credits(c.billing.due)}
        </p>
      )}
      {form.error && (
        <p role="alert" className="error">
          {form.error}
        </p>
      )}
      <button
        disabled={
          readonly ||
          form.busy ||
          workspace?.canManage === false ||
          b.ready > s.time ||
          (!!c && c.state !== "inactive")
        }
        onClick={() =>
          void form.run(() =>
            command({
              type: "civil-station",
              home: b.id,
              enabled: !c?.enabled,
              preparation: 600,
            }),
          )
        }
      >
        {c?.enabled
          ? "Vorauswahl für Bereitschaft aufheben"
          : "Für Bereitschaft vormerken"}
      </button>
    </section>
  );
}
export function CivilProtectionDesk({
  s,
  onOpen,
  onFacilities,
}: {
  s: Save;
  onOpen: (id: string) => void;
  onFacilities: () => void;
}) {
  const { readonly, workspace } = useGame();
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const form = useCommandForm(selected.length > 0 || !!reason, () => {
    setSelected([]);
    setReason("");
  });
  const ready = fleetReadiness(s),
    recommendation = readinessRecommendation(s);
  const stations = s.buildings.filter((b) =>
    civilStationTypes.includes(b.type),
  );
  const operation = async (op: "mobilize" | "stand-down") => {
    if (
      await form.run(() =>
        command({
          type: "civil-readiness",
          homes: selected,
          op,
          reason: reason.trim() || undefined,
        }),
      )
    ) {
      setSelected([]);
      setReason("");
    }
  };
  return (
    <section className="radio-workspace" aria-label="Katastrophenbereitschaft">
      <p>
        Die Leitstellenleitung kann Kräfte unabhängig vom Wetter vorab sammeln.
        Nach zehn Minuten kann die Bereitschaft beendet werden; die freie
        Reserve kehrt gestaffelt zurück. Laufende Einsätze bleiben besetzt.
      </p>
      <p role="status">
        {recommendation.recommended ? "Empfehlung: Bereitschaft prüfen. " : ""}
        {recommendation.reason}
      </p>
      <p>
        Ausgewählte Wachen: derzeit{" "}
        {credits(
          s.buildings
            .filter((b) => selected.includes(b.id))
            .reduce((sum, b) => sum + readinessHalfHour(s, b), 0),
        )}{" "}
        je 30 Minuten. Gebundene und externe Fahrzeuge werden nach tatsächlichem
        Einsatz abgerechnet.
      </p>
      <button onClick={onFacilities}>Realen Standort kaufen</button>
      {workspace?.canManage === false && (
        <p>
          Nur die Leitstellenleitung darf Bereitschaft anordnen und beenden.
        </p>
      )}
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
      <fieldset
        className="command-fields"
        disabled={readonly || form.busy || workspace?.canManage === false}
      >
        <label>
          Anlass der Bereitschaft
          <input
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Erhöhtes Einsatzaufkommen"
          />
        </label>
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
        {stations.map((b) => {
          const c = b.civilProtection,
            fleet = s.vehicles.filter((v) => v.home === b.id);
          return (
            <article className="radio-conversation" key={b.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(b.id)}
                  disabled={b.ready > s.time}
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
                {civilReadinessReason(s, b)} ·{" "}
                {fleet.filter((v) => !ready(v)).length}/{fleet.length} Fahrzeuge
                alarmierbar
              </p>
              {c?.state === "mobilizing" && (
                <progress
                  aria-label={`Vorbereitung ${b.name}`}
                  max={Math.max(
                    1,
                    c.staging?.filter((a) => a.available).length ?? 0,
                  )}
                  value={
                    c.staging?.filter((a) => a.available && a.at <= s.time)
                      .length ?? 0
                  }
                />
              )}
              {c?.reason && <p>Anlass: {c.reason}</p>}
              <ul>
                {fleet.map((v) => (
                  <li key={v.id}>
                    {v.name}: {ready(v) || "Alarmierbar"}
                  </li>
                ))}
              </ul>
              <details>
                <summary>
                  Bereitschaftsverlauf · {c?.history.length ?? 0} Einträge
                </summary>
                <ol>
                  {[...(c?.history ?? [])].reverse().map((e, i) => (
                    <li key={i}>
                      {new Date(e.at * 1000).toLocaleString("de-DE")} ·{" "}
                      {workspace?.members.find((u) => u.id === e.actor)?.name ??
                        e.actor}{" "}
                      · {e.text}
                    </li>
                  ))}
                </ol>
              </details>
              <button onClick={() => onOpen(b.id)}>Wachendetails öffnen</button>
            </article>
          );
        })}
      </fieldset>
      {!stations.length && (
        <p>
          Noch kein geeigneter Standort gebaut. Katastrophenschutzwachen stehen
          ab Stufe 8 zur Verfügung.
        </p>
      )}
    </section>
  );
}
