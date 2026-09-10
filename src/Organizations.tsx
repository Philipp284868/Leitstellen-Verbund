import { useState } from "react";
import type { Save, Building, Vehicle, Mission } from "./model";
import { command } from "./store";
import { useCommandForm } from "./use-command-form";
import { vt, bt } from "./catalog";
import {
  stationProfile,
  isVolunteerStation,
  crewSummary,
  stationCapacity,
  reserveWarning,
  PROFESSIONAL_FIRE,
} from "./simulation/staffing";
import { buildingStaffingStatus } from "./simulation/building-staffing";
import { vehicleAvailability } from "./simulation/availability";
import { injuryReason } from "./simulation/responder-recovery";
import {
  stationKinds,
  specialties,
  taskNames,
  type Station,
} from "./simulation/organizations-schema";
import { useHospitalOptions } from "./germany/GeoQueries";
import { duration } from "./travel";
import { level } from "./model";
import { formatMoney } from "./money";
import "./Organizations.css";

export function StationSettings({ s, b }: { s: Save; b: Building }) {
  const [draft, setProfile] = useState<Station | null>(null);
  const profile = draft ?? stationProfile(b);
  const form = useCommandForm(
    draft !== null &&
      JSON.stringify(draft) !== JSON.stringify(stationProfile(b)),
    () => setProfile(null),
  );
  const [confirmBF, setConfirmBF] = useState(false);
  if (!bt(b.type).slots) return null;
  const ff = stationProfile(b).kind === "ff",
    volunteer = isVolunteerStation(b),
    capacity = stationCapacity(b),
    status = buildingStaffingStatus(s, b);
  const unavailable =
    level(s) < PROFESSIONAL_FIRE.level ||
    s.money < PROFESSIONAL_FIRE.price ||
    b.ready > s.time ||
    s.vehicles.some((v) => v.home === b.id && v.status !== "ready");
  return (
    <details className="org-settings">
      <summary>Betriebsprofil · {status.label}</summary>
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <fieldset className="command-fields" disabled={form.busy}>
        <p>
          <strong>{stationKinds[stationProfile(b).kind]}</strong> ·{" "}
          {capacity.slots} Stellplätze
        </p>
        {status.reason && <p role="status">{status.reason}</p>}
        <small>
          Passende Besatzung und freigeschaltete Qualifikationen sind enthalten.
          Ergänzungen und Vertretung organisiert die Wache automatisch.
        </small>
        <div className="org-form">
          {!volunteer && (
            <label>
              Ausrück-Grundzeit in Sekunden
              <input
                type="number"
                min={10}
                max={600}
                value={profile.turnout}
                onChange={(e) =>
                  setProfile({ ...profile, turnout: Number(e.target.value) })
                }
              />
            </label>
          )}
          <label>
            Ausrückprofil
            <select
              value={profile.crew}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  crew: e.target.value as Station["crew"],
                })
              }
            >
              <option value="minimum">
                Fahrzeugabhängige Mindestbesatzung
              </option>
              <option value="normal">Regelbesatzung</option>
              <option value="full">Vollbesatzung abwarten</option>
            </select>
          </label>
          <label>
            Warnschwelle für Gebietsreserve
            <input
              type="number"
              min={0}
              max={20}
              value={profile.reserve}
              onChange={(e) =>
                setProfile({ ...profile, reserve: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <p>
          {volunteer
            ? "Die zugesagte Grundbesetzung reagiert zuverlässig auf Alarm. Freiwillige Kräfte fahren zur Wache; das Fahrzeug wartet auf die tatsächliche Ankunft."
            : "Die Wachbesatzung übernimmt bereitstehende Fahrzeuge automatisch."}
        </p>
        <small>
          Reservewarnungen informieren; sie verhindern keine Alarmierung.
        </small>
        <button
          onClick={() =>
            void form.run(async () => {
              await command({ type: "station-profile", home: b.id, profile });
              setProfile(null);
            })
          }
        >
          Betriebsprofil speichern
        </button>
        <button disabled={draft === null} onClick={() => setProfile(null)}>
          Änderungen verwerfen
        </button>
        {ff && (
          <div className="bf-expansion">
            <h3>Berufsfeuerwehr</h3>
            <p>
              Doppelte Stellplätze, Besatzung vor Ort und 20 Sekunden
              Grundausrückzeit.
            </p>
            <p>
              Ab Stufe {PROFESSIONAL_FIRE.level} ·{" "}
              {formatMoney(PROFESSIONAL_FIRE.price)}
            </p>
            {!confirmBF ? (
              <button disabled={unavailable} onClick={() => setConfirmBF(true)}>
                BF-Ausbau prüfen
              </button>
            ) : (
              <div role="group" aria-label="BF-Ausbau bestätigen">
                <p>
                  Kosten: {formatMoney(PROFESSIONAL_FIRE.price)} · Budget
                  danach: {formatMoney(s.money - PROFESSIONAL_FIRE.price)}
                </p>
                <button
                  disabled={unavailable}
                  onClick={() => {
                    void form.run(async () => {
                      await command({ type: "station-upgrade-bf", home: b.id });
                      setConfirmBF(false);
                      setProfile(null);
                    });
                  }}
                >
                  Kostenpflichtig ausbauen
                </button>
                <button onClick={() => setConfirmBF(false)}>Abbrechen</button>
              </div>
            )}
          </div>
        )}
      </fieldset>
    </details>
  );
}

/** Compatibility export for older building detail integrations; no editable NPC data. */
export function PersonSettings({
  s,
  person,
}: {
  s: Save;
  person: Save["people"][number];
}) {
  return (
    <p className="person-profile-unavailable">
      {injuryReason(s, person) ||
        "Besetzung und Qualifikationen werden automatisch durch die Wache bereitgestellt."}
    </p>
  );
}

export function VehicleStaffing({ s, v }: { s: Save; v: Vehicle }) {
  const form = useCommandForm();
  const ff = isVolunteerStation(s.buildings.find((b) => b.id === v.home)!);
  const crew = crewSummary(s, v),
    readiness = v.availability ?? vehicleAvailability(s, v),
    warning = reserveWarning(s, v);
  return (
    <div className="vehicle-staffing">
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <strong>
        {readiness.alarmable ? "Betriebsbereit" : readiness.reason}
      </strong>
      {readiness.alarmable && (
        <small>
          {ff && v.status === "ready"
            ? "Automatische Besetzung · Anreise freiwilliger Kräfte nach Alarm"
            : "Automatisch besetzt"}
        </small>
      )}
      {warning && <p className="banner">{warning}</p>}
      {v.status === "ready" && (
        <label className="inline">
          <input
            type="checkbox"
            checked={!!v.reserve}
            disabled={form.busy}
            onChange={(e) =>
              void form.run(() =>
                command({
                  type: "vehicle-reserve",
                  vehicle: v.id,
                  reserve: e.target.checked,
                }),
              )
            }
          />
          Als Reserve vormerken (nur Hinweis)
        </label>
      )}
      {v.status === "alarmed" && v.turnout && (
        <div className="volunteer-turnout" aria-label="Besatzungsbildung">
          <strong>
            {ff
              ? "Besatzung auf dem Weg zur Wache"
              : "Besatzung übernimmt Fahrzeug"}
          </strong>
          <progress
            aria-label="Besatzungsbildung"
            max={crew.required}
            value={Math.min(crew.required, crew.present)}
          />
          <small>
            Geplantes Ausrücken in {duration(Math.max(0, v.depart - s.time))}
          </small>
        </div>
      )}
    </div>
  );
}
export function HospitalSettings({ s, b }: { s: Save; b: Building }) {
  const hospitals = useHospitalOptions(
    s,
    b.pos,
    0,
    undefined,
    undefined,
    b.type === "hospital",
  );
  const [draft, setProfile] = useState<NonNullable<
    Building["hospital"]
  > | null>(null);
  const profile = draft ??
    b.hospital ?? {
      open: true,
      capacity: 20 * b.level,
      specialties: Object.keys(specialties) as (keyof typeof specialties)[],
    };
  const form = useCommandForm(draft !== null, () => setProfile(null));
  if (b.type !== "hospital") return null;
  const h = hospitals.options.find((h) => h.id === b.id) ?? {
    occupied: 0,
    reserved: 0,
  };
  return (
    <details className="org-settings">
      <summary>
        Krankenhausaufnahme · {h.occupied} belegt · {h.reserved} zugesagt
      </summary>
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <fieldset className="command-fields" disabled={form.busy}>
        {hospitals.loading && (
          <p role="status">Aufnahmekapazitäten werden geladen …</p>
        )}
        {hospitals.error && <p role="alert">{hospitals.error}</p>}
        <label>
          <input
            type="checkbox"
            checked={profile.open}
            onChange={(e) => setProfile({ ...profile, open: e.target.checked })}
          />
          Aufnahme geöffnet
        </label>
        <label>
          Verfügbare Betten
          <input
            type="number"
            min={1}
            max={20 * b.level}
            value={profile.capacity}
            onChange={(e) =>
              setProfile({ ...profile, capacity: Number(e.target.value) })
            }
          />
        </label>
        {Object.entries(specialties).map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={profile.specialties.includes(
                key as keyof typeof specialties,
              )}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  specialties: e.target.checked
                    ? [...profile.specialties, key as keyof typeof specialties]
                    : profile.specialties.filter((x) => x !== key),
                })
              }
            />
            {label}
          </label>
        ))}
        <p>
          Bereits fahrende Transporte behalten ihre Aufnahmezusage. Neue
          Patienten werden nach Fachbereich und freien Betten zugeteilt; bei
          Ablehnung wird eine geeignete Alternative angefahren.
        </p>
        <button
          disabled={!profile.specialties.length}
          onClick={() =>
            void form.run(async () => {
              await command({ type: "hospital-profile", home: b.id, profile });
              setProfile(null);
            })
          }
        >
          Aufnahmeprofil speichern
        </button>
        <button disabled={draft === null} onClick={() => setProfile(null)}>
          Änderungen verwerfen
        </button>
      </fieldset>
    </details>
  );
}
export function OrganizationTasks({ s, m }: { s: Save; m: Mission }) {
  const form = useCommandForm();
  const v = s.vehicles.find((v) => v.mission === m.id && vt(v.type).capacity);
  const hospitals = useHospitalOptions(s, m.pos, 1, m, v, !!m.control?.briefed);
  const options = hospitals.options;
  if (!m.control?.briefed) return null;
  return (
    <section className="organization-tasks" aria-label="Organisationsaufträge">
      {form.error && (
        <p className="error" role="alert">
          {form.error}
        </p>
      )}
      <fieldset className="command-fields" disabled={form.busy}>
        <h3>Organisationen im Einsatz</h3>
        {m.organization?.tasks.map((t) => (
          <article key={t.kind}>
            <div>
              <b>{taskNames[t.kind]}</b>
              <small>
                {t.done
                  ? "Abgeschlossen"
                  : t.ordered
                    ? "Beauftragt · Fortschritt nur mit geeigneten Kräften vor Ort"
                    : "Auftrag ausstehend"}
              </small>
            </div>
            <progress max={t.seconds} value={t.progress} />
            {!t.ordered && m.phase !== "done" && (
              <button
                onClick={() =>
                  void form.run(() =>
                    command({
                      type: "organization-task",
                      mission: m.id,
                      task: t.kind,
                    }),
                  )
                }
              >
                Beauftragen
              </button>
            )}
          </article>
        ))}
        {m.organization?.tasks.some((t) => t.kind === "secure" && !t.done) && (
          <p className="banner">
            Rettungsdienst wartet auf polizeiliche Sicherung. Polizei
            disponieren, Lagemeldung bearbeiten und Absicherung beauftragen.
          </p>
        )}
        {m.dynamics?.patients.length ? (
          <>
            {hospitals.loading && (
              <p role="status">Erreichbare Kliniken werden geladen …</p>
            )}
            {hospitals.error && <p role="alert">{hospitals.error}</p>}
            <label>
              Bevorzugtes Krankenhaus
              <select
                value={m.organization?.hospital || "auto"}
                disabled={m.phase === "done"}
                onChange={(e) =>
                  void form.run(() =>
                    command({
                      type: "hospital-select",
                      mission: m.id,
                      home: e.target.value,
                    }),
                  )
                }
              >
                <option value="auto">
                  Automatisch: geeignete Aufnahme mit kürzester Anfahrt
                </option>
                {m.organization?.hospital === "public" && (
                  <option value="public">
                    Öffentliche Regionalklinik (gespeicherte Auswahl)
                  </option>
                )}
                {options.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ·{" "}
                    {h.reason ||
                      `${Math.max(0, h.capacity - h.occupied - h.reserved)} frei`}
                  </option>
                ))}
              </select>
            </label>
            <small>
              Keine geeignete Aufnahme am Wunschziel: automatische Umleitung.
              Fremde Rettungsmittel nutzen die Krankenhäuser ihrer
              Heimatleitstelle.
            </small>
          </>
        ) : null}
      </fieldset>
    </section>
  );
}
