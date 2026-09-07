import { useState } from "react";
import type { Save, Building, Vehicle, Mission } from "./model";
import { act } from "./store";
import { vt, bt } from "./catalog";
import {
  stationProfile,
  personDuty,
  personAvailable,
  absenceNames,
  roleNames,
  suitableCrew,
  crewRequired,
} from "./simulation/staffing";
import {
  stationKinds,
  specialties,
  taskNames,
  type Duty,
  type Station,
} from "./simulation/organizations-schema";
import { hospitalOptions } from "./simulation/hospitals";
import { nodes, districts, nearest, districtAt } from "./world";
import { duration } from "./travel";
import "./Organizations.css";
export function StationSettings({ b }: { s: Save; b: Building }) {
  const [profile, setProfile] = useState(stationProfile(b));
  if (!bt(b.type).people) return null;
  const kinds =
    b.type === "fire"
      ? ["bf", "ff", "works", "company", "airport"]
      : [b.type === "heli" ? "ems" : b.type];
  return (
    <details className="org-settings">
      <summary>Organisation, Ausrücken und Reserve</summary>
      <div className="org-form">
        <label>
          Organisation
          <select
            aria-label="Organisation"
            value={profile.kind}
            onChange={(e) =>
              setProfile({
                ...profile,
                kind: e.target.value as Station["kind"],
              })
            }
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {stationKinds[k as keyof typeof stationKinds]}
              </option>
            ))}
          </select>
        </label>
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
            <option value="minimum">Mindestbesatzung (Feuerwehr: 3)</option>
            <option value="normal">Regelbesatzung</option>
            <option value="full">Vollbesatzung</option>
          </select>
        </label>
        <label>
          Verbleibende Gebietsreserve
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
        {profile.kind === "ff"
          ? "Freiwillige erhalten den Alarm, quittieren entsprechend ihrer Erreichbarkeit und fahren von Wohn- oder Arbeitsort zur Wache. Ausrücken erst mit der erforderlichen Besatzung."
          : "Diensthabende Kräfte sind auf der Wache. Führungsfahrzeuge verwenden die halbe Grundzeit, mindestens zehn Sekunden."}
      </p>
      <small>
        Gespeicherte Grundzeit ersetzt die bisherige Verzögerung des
        Alarmprofils. Mindestbesatzung ist eine vereinfachte Spielregel;
        Ausbildung bleibt erforderlich. Änderungen erst nach Rückkehr aller
        Fahrzeuge.
      </small>
      <button
        onClick={() =>
          void act({ type: "station-profile", home: b.id, profile })
        }
      >
        Wachenprofil speichern
      </button>
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
  const initial = personDuty(s, person);
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
        {personDuty(s, person).name} ·{" "}
        {personAvailable(s, person) || "Verfügbar"} ·{" "}
        {personDuty(s, person).load} Alarmierungen
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
          {(["homeNode", "workNode"] as const).map((key) => (
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
          ))}
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
  return (
    <div className="vehicle-staffing">
      <small>
        {suitableCrew(s, v).length} verfügbar · {crewRequired(s, v)} benötigt ·{" "}
        {v.reserve ? "Reserve gesperrt" : "Disposition freigegeben"}
      </small>
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
            Als Reserve zurückhalten
          </label>
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
        </>
      )}
      {v.status === "alarmed" && v.turnout && (
        <details open>
          <summary>
            Besatzung auf dem Weg ·{" "}
            {
              v.turnout.arrivals.filter((a) => a.available && a.at <= s.time)
                .length
            }
            /{v.turnout.minimum} anwesend
          </summary>
          {v.turnout.arrivals.map((a) => (
            <p key={a.person}>
              {s.people.find((p) => p.id === a.person)?.duty?.name ||
                `Einsatzkraft ${a.person.slice(-5)}`}{" "}
              ·{" "}
              {a.available
                ? a.at <= s.time
                  ? "An Wache eingetroffen"
                  : `Ankunft in ${duration(a.at - s.time)}`
                : a.reason}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
export function HospitalSettings({ s, b }: { s: Save; b: Building }) {
  const [profile, setProfile] = useState(
    b.hospital ?? {
      open: true,
      capacity: 20 * b.level,
      specialties: Object.keys(specialties) as (keyof typeof specialties)[],
    },
  );
  if (b.type !== "hospital") return null;
  const h = hospitalOptions(s, b.pos, 0).find((h) => h.id === b.id) ?? {
    occupied: 0,
    reserved: 0,
  };
  return (
    <details className="org-settings">
      <summary>
        Krankenhausaufnahme · {h.occupied} belegt · {h.reserved} zugesagt
      </summary>
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
  if (!m.control?.briefed) return null;
  const v = s.vehicles.find((v) => v.mission === m.id && vt(v.type).capacity),
    options = hospitalOptions(s, m.pos, 1, m, v);
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
