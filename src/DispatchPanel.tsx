import { useEffect, useState } from "react";
import type { Save, Mission } from "./model";
import { bt, vt, capabilities } from "./catalog";
import { capacity } from "./engine";
import { useNetwork } from "./network";
import { useGame, command } from "./store";
import { useCommandForm } from "./use-command-form";
import { fleetReadiness } from "./fleet-view";
import { ForceNeeds, ReserveOverview } from "./ForceNeeds";
import { requirements } from "./simulation/hazards";
import { effectiveSkills } from "./simulation/major-resources";
import { reserveWarning } from "./simulation/staffing";
import { priorities, visiblePriority } from "./simulation/priority";
import { travelNames } from "./simulation/traffic";
import type { TravelMode } from "./simulation/dynamics-schema";
import type { Alarm, Priority } from "./simulation/schema";
import { orgSchema } from "./simulation/schema";
import { alarmNames, operativeCode } from "./simulation/fms";
import { VehicleIcon } from "./map-icons";
import { ApproachText } from "./germany/GeoQueries";
const orgs = ["Alle", ...orgSchema.options];
export function DispatchPanel({ s, m }: { s: Save; m: Mission }) {
  const { readonly } = useGame();
  const c = m.control!;
  const ready = fleetReadiness(s);
  const net = useNetwork();
  const support = net.support.filter(
    (f) => f.mission === m.id && f.round === m.round,
  );
  const [selected, setSelected] = useState<string[]>([]),
    [aao, setAao] = useState(""),
    [priority, setPriority] = useState<Priority | undefined>(),
    [alarm, setAlarm] = useState<Alarm | "">(""),
    [travel, setTravel] = useState<TravelMode>("priority"),
    [home, setHome] = useState(""),
    [org, setOrg] = useState("Alle");
  const form = useCommandForm(selected.length > 0, () => setSelected([]));
  const proposal = c.proposal;
  useEffect(() => {
    if (proposal) setSelected(proposal.vehicles);
  }, [proposal?.id]); // A fresh server proposal is an editable selection, never an alarm.
  const selectedReady = selected.filter((id) => {
    const v = s.vehicles.find((v) => v.id === id);
    return v && !ready(v);
  });
  const chosen = s.vehicles.filter((v) => selectedReady.includes(v.id)),
    skills = { ...capacity(s, m.id) };
  for (const v of chosen)
    for (const [k, n] of Object.entries(effectiveSkills(m, v)))
      skills[k] = (skills[k] || 0) + n;
  for (const f of support.filter(
    (f) =>
      f.vehicle.status === "scene" &&
      (!f.vehicle.fault || f.vehicle.fault.state === "repaired"),
  ))
    for (const [k, n] of Object.entries(effectiveSkills(m, f.vehicle)))
      skills[k] = (skills[k] || 0) + n;
  const selectedAAO = s.desk.aaos.find((x) => x.id === aao);

  return (
    <section className="dispatch-area" aria-label="Disposition">
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      {(!c.locationKnown || !c.reportedTemplate) && (
        <p className="empty-state">
          Für die Alarmierung zuerst den Anfahrtspunkt und das Meldebild
          erfragen. Das Gespräch kann anschließend weiterlaufen.
        </p>
      )}
      <fieldset className="command-fields" disabled={form.busy || readonly}>
        {c.locationKnown &&
          c.reportedTemplate &&
          (!m.location || m.location.state === "verified") &&
          m.phase !== "done" && (
            <section data-hud-section="vehicles">
              <h3>Kräfte alarmieren / nachfordern</h3>
              <p>
                {c.briefed
                  ? "Bestätigter Bedarf"
                  : "Vermuteter Bedarf · Erkundung steht aus."}
              </p>
              <div className="dispatch-need-summary">
                {Object.entries(requirements(m)).map(([skill, n]) => (
                  <span key={skill}>
                    {Math.min(n, skills[skill] ?? 0)}/{n}{" "}
                    {capabilities[skill] ?? skill}
                  </span>
                ))}
              </div>
              <details>
                <summary>Bedarf und verbleibende Reserve</summary>
                <ForceNeeds
                  required={Object.fromEntries(
                    Object.entries(requirements(m))
                      .map(([key, n]) => [
                        key,
                        Math.max(n, selectedAAO?.skills[key] ?? 0),
                      ])
                      .concat(
                        Object.entries(selectedAAO?.skills ?? {}).filter(
                          ([key]) => !requirements(m)[key],
                        ),
                      ),
                  )}
                  available={skills}
                />
                <ReserveOverview s={s} selected={chosen} />
              </details>
              <div className="desk-form">
                <label>
                  AAO auswählen
                  <select
                    aria-label="AAO auswählen"
                    value={aao}
                    onChange={(e) => {
                      setAao(e.target.value);
                      const a = s.desk.aaos.find(
                        (a) => a.id === e.target.value,
                      );
                      if (a) {
                        setPriority(a.priority);
                        setAlarm(a.alarm);
                      }
                    }}
                  >
                    <option value="">Freie Disposition</option>
                    {s.desk.aaos.map((a) => (
                      <option value={a.id} key={a.id}>
                        {a.keyword} · {a.name} · Stufe {a.level}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={!aao}
                  onClick={() =>
                    void form.run(() =>
                      command({ type: "aao-propose", mission: m.id, aao }),
                    )
                  }
                >
                  AAO-Vorschlag berechnen
                </button>
              </div>
              {proposal && (
                <p>
                  {proposal.vehicles.length} Fahrzeuge vorgeschlagen ·{" "}
                  {proposal.missing.join(" · ") || "AAO vollständig verfügbar"}.
                  Auswahl vor der Alarmierung prüfen.
                </p>
              )}
              <details>
                <summary>
                  Fahrzeuge filtern, Priorität und Alarmierungsart
                </summary>{" "}
                <label>
                  Anfahrtsart
                  <select
                    aria-label="Anfahrtsart"
                    value={travel}
                    onChange={(e) => setTravel(e.target.value as TravelMode)}
                  >
                    {Object.entries(travelNames).map(([id, name]) => (
                      <option value={id} key={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="desk-form">
                  <label>
                    Wache
                    <select
                      aria-label="Wache"
                      value={home}
                      onChange={(e) => setHome(e.target.value)}
                    >
                      <option value="">Alle Wachen</option>
                      {s.buildings.map((b) => (
                        <option value={b.id} key={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Organisation
                    <select
                      aria-label="Organisation"
                      value={org}
                      onChange={(e) => setOrg(e.target.value)}
                    >
                      {orgs.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Priorität
                    <select
                      aria-label="Priorität"
                      value={visiblePriority(priority ?? c.priority)}
                      onChange={(e) => setPriority(e.target.value as Priority)}
                    >
                      {priorities.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Alarmierungsart
                    <select
                      aria-label="Alarmierungsart"
                      value={alarm}
                      onChange={(e) => setAlarm(e.target.value as Alarm | "")}
                    >
                      <option value="">Profil der jeweiligen Wache</option>
                      {Object.entries(alarmNames).map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
              <div className="dispatch-list">
                {s.vehicles
                  .filter(
                    (v) =>
                      (!home || v.home === home) &&
                      (org === "Alle" || bt(vt(v.type).home).org === org),
                  )
                  .map((v) => (
                    <label key={v.id}>
                      <input
                        type="checkbox"
                        disabled={!!ready(v)}
                        checked={selectedReady.includes(v.id)}
                        onChange={(e) => {
                          const checked = e.currentTarget.checked;
                          setSelected((ids) =>
                            checked
                              ? [...ids, v.id]
                              : ids.filter((id) => id !== v.id),
                          );
                        }}
                      />
                      <span>
                        <b>
                          <VehicleIcon type={v.type} /> {v.name} · FMS{" "}
                          {s.desk.fleet[v.id]?.code ?? operativeCode(v)}
                        </b>
                        <small className="dispatch-approach">
                          {ready(v) || (
                            <>
                              <span>
                                {v.availability?.dispatchable === false
                                  ? "Besatzung wird mobilisiert · "
                                  : "Einsatzbereit · "}
                              </span>
                              <ApproachText
                                s={s}
                                vehicle={v}
                                target={m.pos}
                                mode={travel}
                                alarm={alarm || undefined}
                              />
                            </>
                          )}
                        </small>
                        <small>{reserveWarning(s, v)}</small>
                      </span>
                    </label>
                  ))}
              </div>
              <div className="dispatch-submit">
                <button
                  className="primary"
                  disabled={!selectedReady.length}
                  onClick={() => {
                    void form.run(async () => {
                      await command({
                        type: "dispatch",
                        travel,
                        mission: m.id,
                        vehicles: selectedReady,
                        priority: priority ?? c.priority,
                        alarm: alarm || undefined,
                      });
                      setSelected([]);
                      setPriority(undefined);
                    });
                  }}
                >
                  Alarmieren ({selectedReady.length})
                </button>
              </div>
            </section>
          )}
      </fieldset>
    </section>
  );
}
