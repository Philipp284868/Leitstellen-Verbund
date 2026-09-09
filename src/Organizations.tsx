import { useState } from "react";
import type { Save, Building, Vehicle, Mission } from "./model";
import { act } from "./store";
import { vt, bt } from "./catalog";
import {
  stationProfile,
  personAvailable,
  absenceNames,
  roleNames,
  crewSummary,
  stationCapacity,
  reserveWarning,
  PROFESSIONAL_FIRE,
} from "./simulation/staffing";
import {
  stationKinds,
  specialties,
  taskNames,
  type Duty,
  type Station,
} from "./simulation/organizations-schema";
import { useHospitalOptions, DutyLocation } from "./germany/GeoQueries";
import { IS_GERMANY } from "./world-choice";
import { nodes, districts, nearest, districtAt } from "./world";
import { duration } from "./travel";
import { level } from "./model";
import "./Organizations.css";
export function StationSettings({ s, b }: { s: Save; b: Building }) {
  const [profile, setProfile] = useState(stationProfile(b));
  if (!bt(b.type).people) return null;
  const ff = stationProfile(b).kind === "ff",
    capacity = stationCapacity(b);
  return (
    <details className="org-settings">
      <summary>Organisation, Ausrücken und Reserve</summary>
      <p>
        <strong>{stationKinds[stationProfile(b).kind]}</strong> ·{" "}
        {capacity.slots} Stellplätze · {capacity.people} Personalplätze
      </p>
      <div className="org-form">
        {!ff && (
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
          Besatzungsregel
          <select
            value={profile.crew}
            onChange={(e) =>
              setProfile({
                ...profile,
                crew: e.target.value as Station["crew"],
              })
            }
          >
            <option value="minimum">Fahrzeugabhängige Mindestbesatzung</option>
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
        {ff
          ? "Freiwillige werden bei Alarm aus dem Wachenpool mobilisiert. Ihre Verfügbarkeit und ihre Anreise entstehen in der Simulation. Fahrzeuge rücken erst aus, wenn genügend entsprechend ausgebildete Kräfte eingetroffen sind."
          : "Die Wachbesatzung steht vor Ort bereit. Fahrzeuge rücken mit der zugewiesenen, geeigneten Besatzung aus."}
      </p>
      <small>
        Reservewarnungen informieren dich. Die Dispositionsentscheidung bleibt
        bei dir.
      </small>
      <button
        onClick={() =>
          void act({ type: "station-profile", home: b.id, profile })
        }
      >
        Wachenprofil speichern
      </button>
      {ff && (
        <div className="bf-expansion">
          <h3>Ausbau zur Berufsfeuerwehr</h3>
          <p>
            Doppelte Fahrzeug- und Personalplätze, durchgehende Wachbesatzung
            und 20 Sekunden Grundausrückzeit. Andere freiwillige Wachen bleiben
            erhalten.
          </p>
          <p>
            Ab Stufe {PROFESSIONAL_FIRE.level} ·{" "}
            {PROFESSIONAL_FIRE.price.toLocaleString("de-DE")} Credits
          </p>
          <button
            disabled={
              level(s) < PROFESSIONAL_FIRE.level ||
              s.money < PROFESSIONAL_FIRE.price ||
              b.ready > s.time ||
              s.vehicles.some((v) => v.home === b.id && v.status !== "ready")
            }
            onClick={() => void act({ type: "station-upgrade-bf", home: b.id })}
          >
            Zur Berufsfeuerwehr ausbauen
          </button>
        </div>
      )}
    </details>
  );
}
export function PersonSettings({
  s,
  person,
}: {
  s: Save;
  person: Save["people"][number];
}) {
  const b = s.buildings.find((b) => b.id === person.home)!;
  if (stationProfile(b).kind === "ff")
    return (
      <div className="volunteer-profile">
        <small>
          Freiwillige Einsatzkraft ·{" "}
          {person.skills.length ? person.skills.join(" · ") : "Grundausbildung"}
        </small>
        <p>
          {person.training
            ? "In Ausbildung"
            : person.vehicle &&
                s.vehicles.some(
                  (v) => v.id === person.vehicle && v.status !== "ready",
                )
              ? "Für einen Einsatz gebunden"
              : "Mitglied im Wachenpool"}
        </p>
      </div>
    );
  if (!person.duty)
    return (
      <p className="person-profile-unavailable">
        Das Personalprofil ist in diesem Serverstand noch nicht verfügbar. Eine
        erneute Verbindung lädt den aktuellen Stand.
      </p>
    );
  return <RegularPersonSettings s={s} person={person} />;
}
function RegularPersonSettings({
  s,
  person,
}: {
  s: Save;
  person: Save["people"][number];
}) {
  const initial = person.duty!;
  const [duty, setDuty] = useState<Duty>({
      ...initial,
      absence:
        initial.until && initial.until <= s.time ? "none" : initial.absence,
    }),
    [hours, setHours] = useState(
      initial.until > s.time
        ? Number(((initial.until - s.time) / 3600).toFixed(2))
        : 0,
    );
  const busy =
    !!person.vehicle &&
    s.vehicles.some((v) => v.id === person.vehicle && v.status !== "ready");
  const patch = (value: Partial<Duty>) => setDuty({ ...duty, ...value });
  return (
    <details className="person-settings">
      <summary>
        {person.duty!.name} · {personAvailable(s, person) || "Verfügbar"} ·{" "}
        {person.duty!.load} Alarmierungen
      </summary>
      <fieldset disabled={busy}>
        <div className="org-form">
          <label>
            Name
            <input
              value={duty.name}
              maxLength={48}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <label>
            Funktion
            <select
              value={duty.role}
              onChange={(e) => patch({ role: e.target.value as Duty["role"] })}
            >
              {Object.entries(roleNames).map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Schicht
            <select
              value={duty.shift}
              onChange={(e) =>
                patch({ shift: e.target.value as Duty["shift"] })
              }
            >
              <option value="24h">24 Stunden</option>
              <option value="day">Tag 06–14 Uhr</option>
              <option value="late">Spät 14–22 Uhr</option>
              <option value="night">Nacht 22–06 Uhr</option>
              {["A", "B", "C"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Verfügbarkeit
            <select
              value={duty.absence}
              onChange={(e) =>
                patch({ absence: e.target.value as Duty["absence"] })
              }
            >
              {Object.entries(absenceNames).map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Abwesenheit für Stunden (0: unbefristet)
            <input
              type="number"
              min={0}
              max={8760}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            />
          </label>
          <label>
            Alarmquittierung FF in Prozent
            <input
              type="number"
              min={0}
              max={100}
              value={duty.reachability}
              onChange={(e) => patch({ reachability: Number(e.target.value) })}
            />
          </label>
          {(["homeNode", "workNode"] as const).map((key) =>
            IS_GERMANY ? (
              <DutyLocation
                key={key}
                label={key === "homeNode" ? "Wohnort" : "Arbeitsort"}
                nodeId={duty[key]}
                home={s.buildings.find((b) => b.id === person.home)!.pos}
                onChange={(nodeId) => patch({ [key]: nodeId })}
              />
            ) : (
              <label key={key}>
                {key === "homeNode" ? "Wohnort" : "Arbeitsort"}
                <select
                  value={duty[key]}
                  onChange={(e) => patch({ [key]: Number(e.target.value) })}
                >
                  <option value={duty[key]}>
                    {districtAt(nodes[duty[key]])} · Standort {duty[key]}
                  </option>
                  {districts.map((d) => (
                    <option key={d.name} value={nearest(d)}>
                      {d.name}
                    </option>
                  ))}
                  <option
                    value={nearest(
                      s.buildings.find((b) => b.id === person.home)!.pos,
                    )}
                  >
                    Direkt an der Wache
                  </option>
                </select>
              </label>
            ),
          )}
          <label>
            Anreise
            <select
              value={duty.commute}
              onChange={(e) =>
                patch({ commute: e.target.value as Duty["commute"] })
              }
            >
              <option value="car">Eigenes Auto</option>
              <option value="bicycle">Fahrrad</option>
              <option value="walk">Zu Fuß</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={duty.workdays}
              onChange={(e) => patch({ workdays: e.target.checked })}
            />
            Mo–Fr 08–17 Uhr am Arbeitsort
          </label>
          <label>
            <input
              type="checkbox"
              checked={duty.standby}
              onChange={(e) => patch({ standby: e.target.checked })}
            />
            Bereitschaft auf der Wache
          </label>
        </div>
        <small>
          Schichtzeiten gelten für Rettungsdienst. BF A/B/C bezeichnet die
          Wachabteilung bei durchgehender Besetzung. Die regionale Spieluhr
          nutzt UTC+1.
        </small>
        <button
          onClick={() =>
            void act({
              type: "person-duty",
              person: person.id,
              duty: { ...duty, until: hours ? s.time + hours * 3600 : 0 },
            })
          }
        >
          Personalprofil speichern
        </button>
      </fieldset>
    </details>
  );
}
export function VehicleStaffing({ s, v }: { s: Save; v: Vehicle }) {
  const [to, setTo] = useState("");
  const ff =
    stationProfile(s.buildings.find((b) => b.id === v.home)!).kind === "ff";
  const crew = crewSummary(s, v),
    warning = reserveWarning(s, v);
  return (
    <div className="vehicle-staffing">
      <strong>
        Besatzung: {crew.present}/{crew.capacity} · {crew.required} zum
        Ausrücken benötigt
      </strong>
      <small>
        {v.status === "ready" && ff
          ? `${crew.eligible} geeignete Kräfte im Wachenpool · Anreise nach Alarm`
          : crew.present >= crew.required
            ? "Besatzung vollständig: Ausrücken möglich"
            : "Besatzung fehlt: Ausrücken noch nicht möglich"}
      </small>
      {warning && <p className="banner">{warning}</p>}
      {v.status === "ready" && (
        <>
          <label className="inline">
            <input
              type="checkbox"
              checked={!!v.reserve}
              onChange={(e) =>
                void act({
                  type: "vehicle-reserve",
                  vehicle: v.id,
                  reserve: e.target.checked,
                })
              }
            />
            Als Reserve vormerken (nur Hinweis)
          </label>
          {!ff && (
            <div className="inline">
              <select
                aria-label={`Umbesetzen ${v.name}`}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              >
                <option value="">Alternativfahrzeug besetzen …</option>
                {s.vehicles
                  .filter(
                    (other) =>
                      other.id !== v.id &&
                      other.home === v.home &&
                      other.status === "ready",
                  )
                  .map((other) => (
                    <option key={other.id} value={other.id}>
                      {other.name}
                    </option>
                  ))}
              </select>
              <button
                disabled={!to}
                onClick={() =>
                  void act({ type: "crew-transfer", from: v.id, to })
                }
              >
                Besatzung umsetzen
              </button>
            </div>
          )}
        </>
      )}
      {v.status === "alarmed" && v.turnout && (
        <div className="volunteer-turnout" aria-label="Besatzungsbildung">
          <strong>
            {ff
              ? "Besatzung auf dem Weg zur Wache"
              : "Besatzung übernimmt Fahrzeug"}{" "}
            · {crew.present}/{crew.required} anwesend
          </strong>
          <progress
            max={crew.required}
            value={Math.min(crew.required, crew.present)}
          />
          <p>
            {
              v.turnout.arrivals.filter((a) => a.available && a.at > s.time)
                .length
            }{" "}
            Kräfte noch auf Anreise
          </p>
          {v.turnout.arrivals.filter((a) => a.available && a.at > s.time)
            .length > 0 && (
            <small>
              Nächste Ankunft in{" "}
              {duration(
                Math.min(
                  ...v.turnout.arrivals
                    .filter((a) => a.available && a.at > s.time)
                    .map((a) => a.at - s.time),
                ),
              )}
            </small>
          )}
          {v.turnout.arrivals.filter((a) => a.available).length <
            crew.required && (
            <p className="banner">
              Zu wenige Alarmrückmeldungen. Fahrzeug wartet auf Besatzung;
              gegebenenfalls ein kleineres Fahrzeug oder andere Kräfte
              alarmieren.
            </p>
          )}
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
  const [profile, setProfile] = useState(
    b.hospital ?? {
      open: true,
      capacity: 20 * b.level,
      specialties: Object.keys(specialties) as (keyof typeof specialties)[],
    },
  );
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
        Bereits fahrende Transporte behalten ihre Aufnahmezusage. Neue Patienten
        werden nach Fachbereich und freien Betten zugeteilt; bei Ablehnung wird
        eine geeignete Alternative angefahren.
      </p>
      <button
        disabled={!profile.specialties.length}
        onClick={() =>
          void act({ type: "hospital-profile", home: b.id, profile })
        }
      >
        Aufnahmeprofil speichern
      </button>
    </details>
  );
}
export function OrganizationTasks({ s, m }: { s: Save; m: Mission }) {
  const v = s.vehicles.find((v) => v.mission === m.id && vt(v.type).capacity);
  const hospitals = useHospitalOptions(s, m.pos, 1, m, v, !!m.control?.briefed);
  const options = hospitals.options;
  if (!m.control?.briefed) return null;
  return (
    <section className="organization-tasks" aria-label="Organisationsaufträge">
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
                void act({
                  type: "organization-task",
                  mission: m.id,
                  task: t.kind,
                })
              }
            >
              Beauftragen
            </button>
          )}
        </article>
      ))}
      {m.organization?.tasks.some((t) => t.kind === "secure" && !t.done) && (
        <p className="banner">
          Rettungsdienst wartet auf polizeiliche Sicherung. Polizei disponieren,
          Lagemeldung bearbeiten und Absicherung beauftragen.
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
                void act({
                  type: "hospital-select",
                  mission: m.id,
                  home: e.target.value,
                })
              }
            >
              <option value="auto">
                Automatisch: geeignete Aufnahme mit kürzester Anfahrt
              </option>
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
    </section>
  );
}
