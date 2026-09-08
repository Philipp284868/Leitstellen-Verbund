import { tripLabel } from "./travel";
import { ApproachText } from "./germany/GeoQueries";
import { mt, vt, capabilities, type Skills } from "./catalog";
import { type Save, type Mission } from "./model";
import { type Friend, support } from "./network";
import { readiness, missing } from "./engine";
import { emit } from "./store";
import { statuses } from "./ui";
export function SharedMission({
  s,
  friend,
  m,
  friends,
}: {
  s: Save;
  friend: Friend;
  m: Mission;
  friends: Friend[];
}) {
  const t = mt(m.template),
    remoteKey = `remote:${friend.id}:${m.id}`;
  const force = [
    ...s.vehicles
      .filter((v) => v.mission === remoteKey)
      .map((v) => ({
        v,
        name: s.player.name,
        active: true,
        journey: tripLabel(v, s.time),
      })),
    ...friends.flatMap((f) =>
      f.vehicles
        .filter((v) => v.mission === (f.id === friend.id ? m.id : remoteKey))
        .map((v) => ({
          v,
          name: f.name,
          journey: tripLabel(v, v.arrive - v.eta),
          active: f.status.startsWith("Verbunden"),
        })),
    ),
  ];
  const skills: Skills = {};
  for (const { v, active } of force.filter((f) => f.v.status === "scene"))
    if (active)
      for (const [k, n] of Object.entries(vt(v.type).skills))
        skills[k] = (skills[k] || 0) + n;
  const needed = missing(m, skills);
  return (
    <article className="shop-card">
      <span className="eyebrow">{friend.name} · Fremder Einsatz</span>
      <h3>{t.name}</h3>
      <progress value={m.progress} max={t.seconds} />
      <p>
        {Math.floor((m.progress / t.seconds) * 100)} % bestätigt ·{" "}
        {m.phase === "transport"
          ? "Patiententransporte laufen"
          : needed.length
            ? "Wartet auf passende Kräfte"
            : "Kräfte vollständig vor Ort"}
      </p>
      <div className="requirements">
        {Object.entries(t.requirements).map(([k, n]) => (
          <div key={k} className={(skills[k] || 0) >= n ? "fulfilled" : ""}>
            <span>{capabilities[k]}</span>
            <b>
              {skills[k] || 0} / {n}
            </b>
          </div>
        ))}
      </div>
      {force.map(({ v, name, active, journey }) => (
        <div className="person" key={v.id}>
          <span>
            {v.name}
            <small>
              {name} · {active ? statuses[v.status] : "Offline · veraltet"} ·{" "}
              {journey}
            </small>
          </span>
        </div>
      ))}
      {t.patients > 0 && (
        <p>
          {m.transports
            .filter((t) => t.status === "delivered")
            .reduce((n, t) => n + t.patients, 0)}{" "}
          / {t.patients} Patientenübernahmen bestätigt
        </p>
      )}
      <label>
        Eigenes Fahrzeug anbieten
        <select
          disabled={!friend.status.startsWith("Verbunden")}
          defaultValue=""
          onChange={(e) => {
            void support(friend.id, m, e.target.value).catch((err) =>
              emit({ error: String(err) }),
            );
            e.target.value = "";
          }}
        >
          <option value="">Fahrzeug auswählen …</option>
          {s.vehicles
            .filter((v) => !readiness(s, v))
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · <ApproachText s={s} vehicle={v} target={m.pos} />
              </option>
            ))}
        </select>
      </label>
    </article>
  );
}
