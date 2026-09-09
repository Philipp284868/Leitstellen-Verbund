import type { Save, Vehicle } from "./model";
import { bt, vt, type Skills } from "./catalog";
import { forceRows, openForceLabels } from "./simulation/force-plan";
import { fleetReadiness } from "./fleet-view";
import { stationProfile } from "./simulation/staffing";

export function ForceNeeds({
  required,
  available,
}: {
  required: Skills;
  available: Skills;
}) {
  const rows = forceRows(required, available),
    missing = openForceLabels(required, available);
  return (
    <section className="force-needs" aria-label="Benötigte Kräfte">
      <h3>Benötigte Kräfte</h3>
      <div className="force-rows">
        {rows.map((row) => (
          <span
            key={row.type}
            className={row.present >= row.required ? "good" : "warning"}
          >
            {row.present >= row.required ? "✓" : "○"}{" "}
            <b>
              {row.present}/{row.required}
            </b>{" "}
            {row.name}
          </span>
        ))}
      </div>
      <p>
        {missing.length
          ? `Offen: ${missing.join(" · ")}`
          : "Bekannte Anforderungen sind gedeckt."}
      </p>
      <small>
        Fahrzeugvorschlag: Gleichwertige Fähigkeiten anderer Fahrzeuge werden
        angerechnet. Anfahrende Kräfte stehen erst nach Ankunft vor Ort zur
        Verfügung.
      </small>
    </section>
  );
}
export function ReserveOverview({
  s,
  selected = [],
}: {
  s: Save;
  selected?: Vehicle[];
}) {
  const ready = fleetReadiness(s),
    picked = new Set(selected.map((v) => v.id));
  const groups = new Map<
    string,
    { total: number; available: number; after: number; threshold: number }
  >();
  for (const v of s.vehicles) {
    const org = bt(vt(v.type).home).org;
    const group = groups.get(org) ?? {
      total: 0,
      available: 0,
      after: 0,
      threshold: 1,
    };
    group.total++;
    if (!ready(v)) {
      group.available++;
      if (!picked.has(v.id)) group.after++;
    }
    groups.set(org, group);
  }
  for (const b of s.buildings) {
    const group = groups.get(bt(b.type).org);
    if (group)
      group.threshold = Math.max(group.threshold, stationProfile(b).reserve);
  }
  return (
    <section className="reserve-overview" aria-label="Ressourcenreserve">
      <h3>Ressourcenreserve</h3>
      {[...groups].map(([org, group]) => (
        <p key={org} className={group.after < group.threshold ? "warning" : ""}>
          <b>{org}</b>: {group.available}/{group.total} alarmierbar
          {selected.length ? ` · nach Auswahl ${group.after}` : ""}
          {group.after === 0
            ? " · Keine freie eigene Reserve. Nachbarleitstelle bei Bedarf anfragen."
            : group.after < group.threshold
              ? " · Reserve kritisch."
              : ""}
        </p>
      ))}
      <small>
        Reservehinweise sperren keine Alarmierung. Die Entscheidung bleibt bei
        dir.
      </small>
    </section>
  );
}
