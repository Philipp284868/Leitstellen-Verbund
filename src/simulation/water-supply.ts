import { resolveRadioTopic } from "./radio-requests";
import type { Mission, Save, Vehicle } from "../shared/model";
import type { Skills } from "../shared/catalog";
import { equipmentProfile } from "./vehicle-equipment";
import { request } from "./incidents";
import { germanyProvider } from "../shared/germany/world";
import { GermanyRoutingError } from "../shared/germany/errors";
import { drawWater } from "./water-authority";
export { waterTripTick } from "./water-shuttle";

export function ensureWaterSupply(s: Save, m: Mission) {
  if (!m.dynamics?.fire) return;
  if (m.waterSupply?.version === 2) return m.waterSupply;
  const old = m.waterSupply;
  return (m.waterSupply = {
    version: 2,
    source: "tank",
    hoseB: 0,
    hoseC: (m.dynamics.scenario?.severity ?? 1) >= 3 || m.major ? 240 : 60,
    flow: 0,
    flowLpm: 0,
    consumed: old?.consumed ?? 0,
    shortage: "",
    last: s.time,
  });
}
function findConnection(m: Mission, kind: "hydrant" | "open-water") {
  const provider = germanyProvider();
  for (const source of (provider.waterSources?.(m.pos, 600, 24) ?? [])
    .filter((s) => s.usable !== false && s.kind === kind)
    .slice(0, 6)) {
    const connection = provider.waterConnection?.(
      source,
      m.location?.access ?? m.pos,
    );
    if (connection) return connection;
  }
}
export function waterSupplyTick(
  s: Save,
  m: Mission,
  skills: Skills,
  dt: number,
  remote: Vehicle[] = [],
) {
  const w = ensureWaterSupply(s, m);
  if (!w || dt <= 0) return;
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
  if (!m.dynamics!.hazards.some((h) => h.kind === "fire" && !h.resolved)) {
    w.shortage = "";
    w.flow = 0;
    w.flowLpm = 0;
    w.last = s.time;
    return;
  }
  const hoseB = profiles.reduce((n, { p }) => n + p.hoseB, 0),
    hoseC = profiles.reduce((n, { p }) => n + p.hoseC, 0),
    pump = profiles.reduce((n, { p }) => n + p.pumpLpm, 0);
  if (
    units.length &&
    !w.manual &&
    !w.connection &&
    (w.checkedAt === undefined || s.time >= w.checkedAt + 60)
  ) {
    w.checkedAt = s.time;
    try {
      const connection = findConnection(m, "hydrant");
      if (connection) {
        w.source = "hydrant";
        w.connection = connection;
        w.hoseB = Math.ceil(connection.meters / 20) * 20;
        w.setupUntil = s.time + 20 + connection.meters / 2;
      }
    } catch (error) {
      if (!(error instanceof GermanyRoutingError)) throw error;
    }
  }
  const attackLines = hoseC >= w.hoseC && pump > 0;
  const connected =
    w.connection &&
    w.connection.source.kind === w.source &&
    hoseB >= w.hoseB &&
    s.time >= (w.setupUntil ?? 0) &&
    (w.source !== "open-water" || profiles.some(({ p }) => p.suctionHose >= 8));
  const needLpm = Math.max(0, skills.fire ?? 0) * 360,
    need = (needLpm * dt) / 60;
  const empty = profiles.reduce(
    (n, { v, p }) => n + Math.max(0, p.water - v.supplies!.water),
    0,
  );
  const incoming = connected
    ? drawWater(
        w.connection!.source,
        m.id,
        s.time,
        Math.min(need + empty, (pump * dt) / 60),
        dt,
      )
    : 0;
  const tank = profiles.reduce((n, { v }) => n + v.supplies!.water, 0);
  const supplied = attackLines
    ? Math.min(need, incoming + tank, (pump * dt) / 60)
    : 0;
  let draw = Math.max(0, supplied - incoming),
    surplus = Math.max(0, incoming - supplied);
  for (const { v, p } of profiles) {
    const used = Math.min(v.supplies!.water, draw);
    v.supplies!.water -= used;
    draw -= used;
    const refill = Math.min(Math.max(0, p.water - v.supplies!.water), surplus);
    v.supplies!.water += refill;
    surplus -= refill;
  }
  const factor = need ? Math.min(1, supplied / need) : 1;
  skills.fire = (skills.fire ?? 0) * factor;
  skills.water = (skills.water ?? 0) * factor;
  w.flow = supplied / dt;
  w.flowLpm = w.flow * 60;
  w.consumed += supplied;
  w.last = s.time;
  const shortage = units.length
    ? [
        hoseC < w.hoseC
          ? `C-Schlauch: ${Math.ceil(w.hoseC - hoseC)} m fehlen`
          : "",
        w.connection && hoseB < w.hoseB
          ? `B-Schlauch: ${Math.ceil(w.hoseB - hoseB)} m fehlen`
          : "",
        pump <= 0 ? "Geeignete Pumpe fehlt" : "",
        factor < 1 && attackLines
          ? "Löschwasser knapp: Entnahmestelle, Schlauchmaterial oder Tanklöschfahrzeuge nachfordern."
          : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  if (shortage && shortage !== w.shortage && m.control?.briefed)
    request(s, m, units[0].id, "request", shortage, "DRINGEND", "water-supply");
  if (!shortage)
    resolveRadioTopic(
      s,
      m,
      "water-supply",
      "Löschwasser und Schlauchmaterial ausreichend.",
    );
  w.shortage = shortage;
  if (w.source === "shuttle" && w.refillSource)
    for (const { v, p } of profiles)
      if (
        /^(tlf|abwasser|flf)/.test(v.type) &&
        p.water &&
        v.supplies!.water <= p.water * 0.1
      )
        v.waterTrip = {
          stage: "queued",
          target: { ...(m.location?.access ?? m.pos) },
          readyAt: s.time,
          source: w.refillSource,
          last: s.time,
        };
  if (m.major) {
    m.major.water = profiles.reduce((n, { v }) => n + v.supplies!.water, 0);
    m.major.demand = needLpm / 60;
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
  if (source === "tank") {
    w.source = source;
    w.manual = true;
    w.hoseB = 0;
    delete w.connection;
    return;
  }
  if (source === "shuttle") {
    const provider = germanyProvider();
    const refill = (provider.waterSources?.(m.pos, 1200, 24) ?? []).find(
      (candidate) =>
        candidate.kind === "hydrant" &&
        provider.waterConnection?.(candidate, m.location?.access ?? m.pos),
    );
    if (!refill)
      throw Error(
        "Keine erreichbare Nachfüllstelle nachgewiesen. Tankversorgung erhalten; andere Kräfte nachfordern.",
      );
    w.source = source;
    w.manual = true;
    w.refillSource = refill;
    w.hoseB = 0;
    delete w.connection;
    return;
  }
  const connection = findConnection(m, source);
  if (!connection)
    throw Error(
      "Keine erreichbare Entnahmestelle dieser Art nachgewiesen. Eine nahe Wasserfläche allein genügt nicht.",
    );
  w.source = source;
  w.manual = true;
  w.connection = connection;
  w.hoseB = Math.ceil(connection.meters / 20) * 20;
  w.setupUntil = s.time + 20 + connection.meters / 2;
}
