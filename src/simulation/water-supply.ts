import type { Mission, Save, Vehicle } from "../model";
import type { Skills } from "../catalog";
import { mt } from "../catalog";
import { equipmentProfile } from "./vehicle-equipment";
import { request } from "./incidents";
import { beginTrip } from "./trip-start";
import { setFms } from "./fms";
import { germanyProvider, distance } from "../germany/world";

/** Uses the regular road journey, traffic and mileage machinery. A tanker stays
 * bound to its incident and cannot count as suppression while refilling. */
export function waterTripTick(s: Save, v: Vehicle) {
  const trip = v.waterTrip;
  if (!trip) return false;
  const home = s.buildings.find((b) => b.id === v.home);
  if (!home || !v.mission || !v.assignment) {
    delete v.waterTrip;
    return false;
  }
  if (trip.stage === "queued") {
    beginTrip(s, v, home.pos, "travel", "normal");
    trip.stage = "outbound";
    setFms(s, v, 7, "server", "Wasserpendel: Fahrt zur Nachfüllstelle");
  } else if (trip.stage === "outbound") {
    if (v.journey?.blockedUntil || v.arrive > s.time) return true;
    v.status = "scene";
    trip.stage = "refilling";
    delete v.journey;
    trip.readyAt =
      s.time +
      Math.max(1, (equipmentProfile(v).water - (v.supplies?.water ?? 0)) / 20);
    setFms(s, v, 8, "server", "Wasserpendel: Tank an der Wache füllen");
  } else if (trip.stage === "refilling" && s.time >= trip.readyAt) {
    v.supplies = { water: equipmentProfile(v).water, refilledAt: s.time };
    beginTrip(s, v, trip.target, "travel");
    trip.stage = "inbound";
    setFms(s, v, 3, "server", "Wasserpendel: Rückkehr zur Einsatzstelle");
  } else if (
    trip.stage === "inbound" &&
    !v.journey?.blockedUntil &&
    v.arrive <= s.time
  ) {
    v.status = "scene";
    delete v.waterTrip;
    setFms(s, v, 4, "server", "Wasserpendel: Löschwasser an der Einsatzstelle");
  }
  return true;
}

export function ensureWaterSupply(s: Save, m: Mission) {
  if (!m.dynamics?.fire) return;
  if (m.waterSupply) return m.waterSupply;
  const site =
    m.dynamics.scenario?.site ?? mt(m.template).profile?.site ?? "street";
  const rural = ["forest", "field"].includes(site);
  const large = (m.dynamics.scenario?.severity ?? 1) >= 3 || !!m.major;
  m.waterSupply = {
    version: 1,
    source: rural ? "tank" : "hydrant",
    hoseB: rural && large ? 500 : rural ? 160 : 100,
    hoseC: large ? 240 : 60,
    flow: 0,
    consumed: 0,
    shortage: "",
    last: s.time,
  };
  return m.waterSupply;
}
export function waterSupplyTick(
  s: Save,
  m: Mission,
  skills: Skills,
  dt: number,
  remote: Vehicle[] = [],
) {
  const w = ensureWaterSupply(s, m);
  if (!w) return;
  const units = [...s.vehicles.filter((v) => v.mission === m.id), ...remote]
    .filter(
      (v) =>
        v.status === "scene" &&
        !v.waterTrip &&
        (!v.fault || v.fault.state === "repaired") &&
        !v.postIncident,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const profiles = units.map((v) => ({ v, p: equipmentProfile(v) }));
  for (const { v, p } of profiles)
    v.supplies ??= { water: p.water, refilledAt: s.time };
  const burning = m.dynamics!.hazards.some(
    (h) => h.kind === "fire" && !h.resolved,
  );
  if (!burning) {
    w.shortage = "";
    w.flow = 0;
    w.last = s.time;
    return;
  }
  const hoseB = profiles.reduce((n, { p }) => n + p.hoseB, 0),
    hoseC = profiles.reduce((n, { p }) => n + p.hoseC, 0);
  const lines = hoseB >= w.hoseB && hoseC >= w.hoseC ? 1 : 0;
  const need = Math.max(0, skills.fire ?? 0) * 6 * dt;
  const pump = profiles.reduce((n, { p }) => n + (p.skills.pump ?? 0), 0);
  let incoming = w.source === "hydrant" ? 10 * dt : 0;
  if (w.source === "open-water") incoming = pump * 14 * dt;
  incoming *= lines;
  const available =
    incoming + profiles.reduce((n, { v }) => n + v.supplies!.water, 0);
  const supplied = Math.min(need, available) * lines;
  let draw = Math.max(0, supplied - incoming);
  for (const { v, p } of profiles) {
    const used = Math.min(v.supplies!.water, draw);
    v.supplies!.water -= used;
    draw -= used;
    if (incoming > need && p.water) {
      const refill = Math.min(p.water - v.supplies!.water, incoming - need);
      v.supplies!.water += refill;
      incoming -= refill;
    }
  }
  const factor = need ? Math.min(1, supplied / need) : 1;
  skills.fire = (skills.fire ?? 0) * factor;
  skills.water = (skills.water ?? 0) * factor;
  w.flow = dt ? supplied / dt : 0;
  w.consumed += supplied;
  w.last = s.time;
  const shortage = units.length
    ? [
        hoseB < w.hoseB
          ? `B-Schlauch: ${Math.ceil(w.hoseB - hoseB)} m fehlen`
          : "",
        hoseC < w.hoseC
          ? `C-Schlauch: ${Math.ceil(w.hoseC - hoseC)} m fehlen`
          : "",
        factor < 1 && lines >= 1
          ? "Löschwasser knapp: Entnahmestelle oder Tanklöschfahrzeuge nachfordern."
          : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  if (shortage && shortage !== w.shortage && m.control?.briefed)
    request(s, m, units[0].id, "request", shortage, "DRINGEND");
  w.shortage = shortage;
  if (w.source === "shuttle")
    for (const { v, p } of profiles)
      if (
        /^(tlf|abwasser|flf)/.test(v.type) &&
        p.water &&
        v.supplies!.water <= p.water * 0.1
      )
        v.waterTrip = {
          stage: "queued",
          target: { ...m.pos },
          readyAt: s.time,
        };
  if (m.major) {
    m.major.water = profiles.reduce((n, { v }) => n + v.supplies!.water, 0);
    m.major.demand = need / dt;
  }
}
export function setWaterSource(
  s: Save,
  m: Mission,
  source: NonNullable<Mission["waterSupply"]>["source"],
) {
  const w = ensureWaterSupply(s, m);
  if (!w || m.phase === "done" || !m.control?.briefed)
    throw Error(
      "Wasserversorgung ist erst nach der Erkundung eines Brandeinsatzes verfügbar.",
    );
  const site = m.dynamics?.scenario?.site ?? mt(m.template).profile?.site;
  if (source === "hydrant" && ["forest", "field"].includes(site ?? ""))
    throw Error(
      "Am ländlichen Einsatzort ist kein Hydrant im Szenario verfügbar.",
    );
  if (
    source === "open-water" &&
    !germanyProvider()
      .queryIncidentSites?.(m.pos, 100, "water", 8)
      .some((p) => distance(p, m.pos) <= 100)
  )
    throw Error(
      "Kein nachgewiesenes Gewässer im Umfeld; Tankversorgung verwenden.",
    );
  w.source = source;
}
