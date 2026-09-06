import { z } from "zod";
import { useSyncExternalStore } from "react";
import { WORLD, along, type Point } from "./world";
import {
  uid,
  point,
  missionSchema,
  buildingSchema,
  vehicleSchema,
  type Mission,
  type Vehicle,
  type Building,
} from "./model";
import {
  state,
  change,
  notice,
  setRemoteProvider,
  onProfileChange,
} from "./store";
import {
  readiness,
  beginTrip,
  recall,
  money,
  transport,
  endCooperation,
} from "./engine";
import { vt, mt, bt, type Skills } from "./catalog";
const short = z.string().min(1).max(100);
const signalSchema = z
  .object({
    protocol: z.literal(1),
    world: z.literal(WORLD),
    session: short,
    expires: z.number().finite(),
    player: short,
    name: z.string().min(1).max(48),
    generation: short,
    description: z
      .object({
        type: z.enum(["offer", "answer"]),
        sdp: z.string().max(100000),
      })
      .strict(),
  })
  .strict();
const payloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("chat"), text: z.string().min(1).max(500) }),
  z.object({
    type: z.literal("view"),
    revision: z.number().int().nonnegative(),
    reset: z.boolean().default(false),
    removed: z.array(short).max(500).default([]),
    buildings: z.array(buildingSchema).max(150),
    vehicles: z
      .array(
        vehicleSchema.extend({
          position: point,
          eta: z.number().finite().nonnegative().max(1e9),
        }),
      )
      .max(500),
    missions: z.array(missionSchema).max(60),
  }),
  z.object({
    type: z.literal("offer"),
    mission: short,
    round: short,
    assignment: short,
    vehicle: vehicleSchema,
  }),
  z.object({
    type: z.literal("accept"),
    mission: short,
    round: short,
    assignment: short,
    vehicle: short,
  }),
  z.object({
    type: z.literal("force"),
    mission: short,
    round: short,
    assignment: short,
    vehicle: vehicleSchema,
  }),
  z.object({
    type: z.literal("complete"),
    mission: short,
    round: short,
    receipt: short,
    amount: z.number().int().min(0).max(100000),
  }),
  z.object({ type: z.literal("ack"), receipt: short }),
  z.object({
    type: z.literal("withdraw"),
    mission: short,
    round: short,
    assignment: short,
  }),
  z.object({ type: z.literal("abort"), mission: short, round: short }),
  z.object({
    type: z.literal("transport"),
    mission: short,
    round: short,
    assignment: short,
    patients: z.number().int().min(1).max(10),
  }),
  z.object({
    type: z.literal("delivered"),
    mission: short,
    round: short,
    assignment: short,
    patients: z.number().int().min(1).max(10),
  }),
]);
export const packetSchema = z
  .object({
    protocol: z.literal(1),
    world: z.literal(WORLD),
    session: short,
    sender: short,
    generation: short,
    id: short,
    seq: z.number().int().positive(),
    payload: payloadSchema,
  })
  .strict();
type Payload = z.infer<typeof payloadSchema>;
export interface Friend {
  id: string;
  name: string;
  status: string;
  buildings: Building[];
  vehicles: (Vehicle & { position: Point; eta: number })[];
  missions: Mission[];
  revision: number;
}
interface Peer {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  session: string;
  id: string;
  name: string;
  generation: string;
  seq: number;
  received: number;
  last: number;
  sentView: number;
  viewHash: string;
  rate: number[];
  objects: Map<string, string>;
  resetSent: boolean;
  attempts: Map<string, number>;
  seen: Set<string>;
}
interface Contribution {
  peer: string;
  mission: string;
  round: string;
  assignment: string;
  vehicle: Vehicle;
  at: number;
}
let peers: Peer[] = [];
let pending: Peer | null = null;
const forces = new Map<string, Contribution>();
const offers = new Map<
  string,
  { peer: string; mission: Mission; vehicle: string; until: number }
>();
const acknowledged = new Set<string>();
const lostAt = new Map<string, number>();
let lastChat = 0;
let net = {
  friends: [] as Friend[],
  support: [] as Contribution[],
  chat: [] as { name: string; text: string }[],
  output: "",
  status: "Bereit für eine direkte Verbindung",
  error: "",
};
const listeners = new Set<() => void>();
const emit = (patch: Partial<typeof net>) => {
  net = { ...net, ...patch };
  listeners.forEach((f) => f());
};
export const useNetwork = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => net,
  );
export let ice: RTCIceServer[] = [];
export function configureIce(url: string, user: string, password: string) {
  if (!url.trim()) {
    ice = [];
    return;
  }
  if (!/^(stun|turn|turns):[^\s]{3,200}$/.test(url))
    throw Error("STUN-/TURN-Adresse ungültig.");
  ice = [
    {
      urls: url,
      ...(url.startsWith("turn")
        ? { username: user, credential: password }
        : {}),
    },
  ];
}
function send(p: Peer, payload: Payload) {
  const s = state();
  if (!s || p.dc?.readyState !== "open") return;
  if (p.dc.bufferedAmount > 256000) return;
  const text = JSON.stringify({
    protocol: 1,
    world: WORLD,
    session: p.session,
    sender: s.player.id,
    generation: s.generation,
    id: uid(),
    seq: ++p.seq,
    payload,
  });
  if (new TextEncoder().encode(text).length > 32000) return false;
  p.dc.send(text);
  return true;
}
function close(p: Peer) {
  p.dc?.close();
  p.pc.close();
  peers = peers.filter((x) => x !== p);
  emit({
    friends: net.friends.map((f) =>
      f.id === p.id ? { ...f, status: "Offline · Ansicht veraltet" } : f,
    ),
  });
  notice(
    `${p.name || "Freund"} getrennt. Unterstützung wird nach 30 Sekunden zurückgerufen.`,
  );
}
export function disconnect(id: string) {
  const p = peers.find((p) => p.id === id);
  if (p) close(p);
}
export function cancel() {
  if (pending) {
    close(pending);
    pending = null;
  }
  emit({ output: "", status: "Verbindungsaufbau abgebrochen", error: "" });
}
function attach(p: Peer, dc: RTCDataChannel) {
  p.dc = dc;
  dc.onopen = () => {
    if (peers.filter((x) => x.dc?.readyState === "open").length >= 3) {
      close(p);
      return;
    }
    peers = peers.filter((x) => x !== p);
    peers.push(p);
    p.last = Date.now();
    emit({
      status: "DataChannel geöffnet · verbunden",
      output: "",
      friends: [
        ...net.friends.filter((f) => f.id !== p.id),
        {
          id: p.id,
          name: p.name,
          status: "Verbunden",
          buildings: [],
          vehicles: [],
          missions: [],
          revision: -1,
        },
      ],
    });
    pending = null;
    sync(p);
    void p.pc
      .getStats()
      .then((report) => {
        const pair = [...report.values()].find(
          (r) =>
            r.type === "candidate-pair" &&
            r.state === "succeeded" &&
            (r.nominated || r.selected),
        );
        if (!pair) return;
        const local = report.get(pair.localCandidateId),
          remote = report.get(pair.remoteCandidateId);
        const mode =
          local?.candidateType === "relay" || remote?.candidateType === "relay"
            ? "TURN-Relay"
            : "direkt";
        emit({
          friends: net.friends.map((f) =>
            f.id === p.id && p.dc?.readyState === "open"
              ? { ...f, status: `Verbunden · ${mode}` }
              : f,
          ),
        });
      })
      .catch(() => {});
  };
  dc.onclose = () => {
    if (peers.includes(p)) close(p);
  };
  dc.onerror = () =>
    emit({ error: "Datenkanal gestört. Einzelspieler läuft weiter." });
  dc.onmessage = (e) => {
    void receive(p, e.data).catch(() =>
      emit({ error: "Ungültige oder unzulässige Nachricht verworfen." }),
    );
  };
}
async function receive(p: Peer, raw: unknown) {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > 32000)
    throw Error("Größe");
  const packet = packetSchema.parse(JSON.parse(raw));
  if (
    packet.session !== p.session ||
    packet.sender !== p.id ||
    packet.generation !== p.generation
  )
    throw Error("Absender/Reihenfolge");
  if (packet.seq <= p.received || p.seen.has(packet.id)) return;
  p.seen.add(packet.id);
  if (p.seen.size > 2048) p.seen.delete(p.seen.values().next().value!);
  const now = Date.now();
  p.rate = p.rate.filter((t) => now - t < 1000);
  if (p.rate.length > 350) throw Error("Rate");
  p.rate.push(now);
  p.received = packet.seq;
  p.last = now;
  const x = packet.payload;
  if (x.type === "withdraw") {
    const force = forces.get(x.assignment);
    if (
      !force ||
      force.peer !== p.id ||
      force.mission !== x.mission ||
      force.round !== x.round
    )
      return;
    forces.delete(x.assignment);
    emit({ support: [...forces.values()] });
    await change((s) => {
      const m = s.missions.find(
        (m) => m.id === x.mission && m.round === x.round,
      );
      if (m)
        m.transports = m.transports.filter(
          (t) => t.assignment !== x.assignment || t.status === "delivered",
        );
    });
    notice(`${p.name} hat ein Unterstützungsfahrzeug zurückgerufen.`);
    return;
  }
  if (x.type === "chat") {
    emit({ chat: [...net.chat, { name: p.name, text: x.text }].slice(-100) });
    return;
  }
  if (x.type === "view") {
    if (
      x.buildings.some((b) => b.owner !== p.id) ||
      x.vehicles.some((v) => v.owner !== p.id)
    )
      throw Error("Besitz");
    for (const b of x.buildings) bt(b.type);
    for (const v of x.vehicles) vt(v.type);
    for (const m of x.missions) mt(m.template);
    emit({
      friends: net.friends.map((f) =>
        f.id === p.id && x.revision >= f.revision
          ? {
              ...f,
              revision: x.revision,
              buildings: [
                ...(x.reset ? [] : f.buildings).filter(
                  (o) =>
                    !x.removed.includes(o.id) &&
                    !x.buildings.some((n) => n.id === o.id),
                ),
                ...x.buildings,
              ],
              vehicles: [
                ...(x.reset ? [] : f.vehicles).filter(
                  (o) =>
                    !x.removed.includes(o.id) &&
                    !x.vehicles.some((n) => n.id === o.id),
                ),
                ...x.vehicles,
              ],
              missions: [
                ...(x.reset ? [] : f.missions).filter(
                  (o) =>
                    !x.removed.includes(o.id) &&
                    !x.missions.some((n) => n.id === o.id),
                ),
                ...x.missions,
              ],
            }
          : f,
      ),
    });
    return;
  }
  if (x.type === "offer") {
    const m = state()?.missions.find(
      (m) => m.id === x.mission && m.round === x.round && m.shared,
    );
    if (!m || x.vehicle.owner !== p.id) throw Error("Runde");
    vt(x.vehicle.type);
    forces.set(x.assignment, {
      peer: p.id,
      mission: m.id,
      round: m.round,
      assignment: x.assignment,
      vehicle: { ...x.vehicle, status: "travel" },
      at: now,
    });
    send(p, {
      type: "accept",
      mission: m.id,
      round: m.round,
      assignment: x.assignment,
      vehicle: x.vehicle.id,
    });
    return;
  }
  if (x.type === "accept") {
    if (
      state()?.contributions.some(
        (c) =>
          c.assignment === x.assignment &&
          c.peer === p.id &&
          c.round === x.round &&
          c.status === "active",
      )
    )
      return;
    const offer = offers.get(x.assignment);
    if (
      !offer ||
      offer.peer !== p.id ||
      offer.until < now ||
      offer.mission.id !== x.mission ||
      offer.mission.round !== x.round ||
      offer.vehicle !== x.vehicle
    )
      throw Error("Reservierung abgelaufen");
    await change((s) => {
      const v = s.vehicles.find((v) => v.id === x.vehicle);
      if (!v || readiness(s, v)) throw Error("Fahrzeug nicht verfügbar");
      const c = s.contributions.find((c) => c.assignment === x.assignment);
      if (!c || c.status !== "reserved") throw Error("Reservierung fehlt");
      c.status = "active";
      v.assignment = x.assignment;
      v.mission = `remote:${p.id}:${x.mission}`;
      beginTrip(s, v, offer.mission.pos, "travel");
    });
    offers.delete(x.assignment);
    notice("Unterstützung bestätigt. Fahrzeug fährt zum gemeinsamen Einsatz.");
    return;
  }
  if (x.type === "force") {
    const force = forces.get(x.assignment);
    if (
      !force ||
      force.peer !== p.id ||
      force.vehicle.id !== x.vehicle.id ||
      force.vehicle.type !== x.vehicle.type ||
      x.vehicle.assignment !== x.assignment ||
      x.vehicle.mission !== `remote:${state()?.player.id}:${x.mission}` ||
      x.vehicle.owner !== p.id ||
      force.round !== x.round ||
      force.mission !== x.mission
    )
      throw Error("Zuweisung");
    force.vehicle = x.vehicle;
    force.at = now;
    emit({ support: [...forces.values()] });
    if (
      x.vehicle.status === "scene" &&
      state()?.missions.some(
        (m) =>
          m.id === x.mission &&
          m.round === x.round &&
          m.shared &&
          !m.contributors.includes(p.id),
      )
    )
      await change((s) => {
        const m = s.missions.find(
          (m) => m.id === x.mission && m.round === x.round && m.shared,
        );
        if (m && !m.contributors.includes(p.id)) m.contributors.push(p.id);
      });
    return;
  }
  if (x.type === "complete") {
    const expected = `coop:${x.round}:${state()?.player.id}`;
    if (x.receipt !== expected) throw Error("Beleg");
    if (state()?.receipts.includes(x.receipt)) {
      send(p, { type: "ack", receipt: x.receipt });
      notice(
        "Belohnung verbucht · Abschlussbeleg bereits bekannt, keine erneute Gutschrift.",
      );
      return;
    }
    const f = net.friends.find((f) => f.id === p.id);
    const mission = f?.missions.find(
      (m) => m.id === x.mission && m.round === x.round,
    );
    const hasVehicle = state()?.vehicles.some(
      (v) => v.mission === `remote:${p.id}:${x.mission}`,
    );
    const contribution = state()?.contributions.find(
      (c) =>
        c.peer === p.id &&
        c.mission === x.mission &&
        c.round === x.round &&
        ["active", "returned"].includes(c.status),
    );
    if (!hasVehicle && !contribution && !state()?.receipts.includes(x.receipt))
      throw Error("Kein Beitrag");
    if (contribution && x.amount > contribution.maxReward)
      throw Error("Ungültige Belohnung");
    if (mission && x.amount > Math.floor(mt(mission.template).reward / 2))
      throw Error("Betrag");
    await change((s) => {
      money(s, x.amount, `Verbundbelohnung von ${p.name}`, x.receipt);
      for (const v of s.vehicles.filter(
        (v) => v.mission === `remote:${p.id}:${x.mission}`,
      ))
        recall(s, v);
    });
    send(p, { type: "ack", receipt: x.receipt });
    notice("Gemeinsamer Einsatz abgeschlossen · Belohnung verbucht.");
    return;
  }
  if (x.type === "transport") {
    await change((s) => {
      const c = s.contributions.find(
        (c) =>
          c.assignment === x.assignment &&
          c.peer === p.id &&
          c.round === x.round &&
          c.mission === x.mission &&
          c.status === "active",
      );
      if (!c) throw Error("Transport ohne bestätigte Unterstützung");
      const existing = s.transfers.find((t) => t.assignment === x.assignment);
      if (existing) {
        if (existing.patients !== x.patients)
          throw Error("Widersprüchlicher Transport");
        return;
      }
      const v = s.vehicles.find(
        (v) => v.assignment === x.assignment && v.status === "scene",
      );
      if (!v || x.patients > vt(v.type).capacity)
        throw Error("Transportfahrzeug nicht verfügbar");
      transport(s, v, x.patients);
      s.transfers.push({
        peer: p.id,
        assignment: x.assignment,
        round: x.round,
        mission: x.mission,
        patients: x.patients,
        delivered: false,
      });
    });
    return;
  }
  if (x.type === "delivered") {
    await change((s) => {
      const m = s.missions.find(
        (m) => m.id === x.mission && m.round === x.round && m.shared,
      );
      const order = m?.transports.find(
        (t) =>
          t.assignment === x.assignment &&
          t.owner === p.id &&
          t.patients === x.patients,
      );
      if (order) order.status = "delivered";
    });
    return;
  }
  if (x.type === "abort") {
    await change((s) => {
      for (const c of s.contributions.filter(
        (c) =>
          c.peer === p.id &&
          c.mission === x.mission &&
          c.round === x.round &&
          ["reserved", "active"].includes(c.status),
      )) {
        c.status = "cancelled";
        const v = s.vehicles.find((v) => v.assignment === c.assignment);
        if (v && v.status !== "transport") recall(s, v);
      }
    });
    notice(
      `${p.name} hat die Kooperationsrunde beendet. Unbestätigte Belohnungen entfallen.`,
    );
    return;
  }
  if (x.type === "ack") {
    acknowledged.add(x.receipt);
    await change((s) => {
      if (
        !s.deliveryAcks.includes(x.receipt) &&
        s.archive.some(
          (m) =>
            m.contributors.includes(p.id) &&
            x.receipt === `coop:${m.round}:${p.id}`,
        )
      )
        s.deliveryAcks.push(x.receipt);
    });
  }
}
function sync(p: Peer) {
  const s = state();
  if (!s) return;
  for (const c of s.contributions.filter(
    (c) =>
      c.peer === p.id &&
      c.status === "returned" &&
      !s.receipts.includes(`coop:${c.round}:${s.player.id}`) &&
      !s.transfers.some((t) => t.assignment === c.assignment),
  )) {
    const key = `withdraw:${c.assignment}`;
    if (
      (p.attempts.get(key) ?? 0) < 5 &&
      send(p, {
        type: "withdraw",
        mission: c.mission,
        round: c.round,
        assignment: c.assignment,
      })
    )
      p.attempts.set(key, (p.attempts.get(key) ?? 0) + 1);
  }
  if (!p.sentView) {
    p.sentView = 1;
    for (const c of s.contributions.filter(
      (c) => c.peer === p.id && c.status === "active",
    )) {
      const v = s.vehicles.find((v) => v.assignment === c.assignment);
      if (v)
        send(p, {
          type: "offer",
          mission: c.mission,
          round: c.round,
          assignment: c.assignment,
          vehicle: v,
        });
    }
  }
  if (!p.resetSent) {
    if (
      send(p, {
        type: "view",
        revision: s.revision,
        reset: true,
        removed: [],
        buildings: [],
        vehicles: [],
        missions: [],
      })
    )
      p.resetSent = true;
    else return;
  }
  const publicVehicles = s.vehicles.map((v) => ({
    ...v,
    position: ["travel", "transport", "return"].includes(v.status)
      ? along(v.path, (s.time - v.depart) / (v.arrive - v.depart))
      : v.path.at(-1)!,
    eta: Math.max(0, Math.ceil((v.arrive - s.time) / s.speed)),
  }));
  const objects = [
    ...s.buildings,
    ...publicVehicles,
    ...s.missions.filter((m) => m.shared),
  ];
  const deleted = [...p.objects.keys()].filter(
    (id) => !objects.some((o) => o.id === id),
  );
  if (
    deleted.length &&
    send(p, {
      type: "view",
      revision: s.revision,
      reset: false,
      removed: deleted,
      buildings: [],
      vehicles: [],
      missions: [],
    })
  )
    deleted.forEach((id) => p.objects.delete(id));
  let budget = 8;
  for (const kind of ["buildings", "vehicles", "missions"] as const) {
    const list =
      kind === "missions"
        ? s.missions.filter((m) => m.shared)
        : kind === "vehicles"
          ? publicVehicles
          : s.buildings;
    const changed = list.filter(
      (o) => p.objects.get(o.id) !== JSON.stringify(o),
    );
    for (let i = 0; i < changed.length && budget > 0; i += 5, budget--) {
      const batch = changed.slice(i, i + 5);
      const payload = payloadSchema.parse({
        type: "view",
        revision: s.revision,
        reset: false,
        removed: [],
        buildings: [],
        vehicles: [],
        missions: [],
        [kind]: batch,
      });
      if (send(p, payload))
        for (const o of batch) p.objects.set(o.id, JSON.stringify(o));
    }
  }
  send(p, { type: "ping" });
  for (const v of s.vehicles.filter(
    (v) => v.assignment && v.mission?.startsWith(`remote:${p.id}:`),
  )) {
    const mission = v.mission!.slice(`remote:${p.id}:`.length);
    const remote = net.friends
      .find((f) => f.id === p.id)
      ?.missions.find((m) => m.id === mission);
    if (remote)
      send(p, {
        type: "force",
        mission,
        round: remote.round,
        assignment: v.assignment!,
        vehicle: v,
      });
  }
  for (const t of s.transfers.filter((t) => t.peer === p.id && t.delivered))
    send(p, {
      type: "delivered",
      mission: t.mission,
      round: t.round,
      assignment: t.assignment,
      patients: t.patients,
    });
  for (const m of s.missions.filter(
    (m) => m.shared && m.phase === "transport",
  )) {
    for (const order of m.transports.filter(
      (t) => t.owner === p.id && t.status === "ordered",
    ))
      send(p, {
        type: "transport",
        mission: m.id,
        round: m.round,
        assignment: order.assignment,
        patients: order.patients,
      });
    const remaining =
      mt(m.template).patients -
      m.transports.reduce((n, t) => n + t.patients, 0);
    if (remaining > 0) {
      const f = [...forces.values()].find(
        (f) =>
          f.peer === p.id &&
          f.mission === m.id &&
          f.round === m.round &&
          f.vehicle.status === "scene" &&
          Date.now() - f.at < 6000 &&
          vt(f.vehicle.type).capacity > 0 &&
          !m.transports.some((t) => t.assignment === f.assignment),
      );
      if (f)
        void change((s) => {
          const current = s.missions.find(
            (x) => x.id === m.id && x.round === m.round,
          );
          if (
            !current ||
            current.transports.some((t) => t.assignment === f.assignment)
          )
            return;
          const count = Math.min(
            vt(f.vehicle.type).capacity,
            mt(current.template).patients -
              current.transports.reduce((n, t) => n + t.patients, 0),
          );
          if (count > 0)
            current.transports.push({
              assignment: f.assignment,
              owner: p.id,
              vehicle: f.vehicle.id,
              patients: count,
              status: "ordered",
            });
        }).catch(() => {});
    }
  }
  for (const m of s.archive.filter(
    (m) => m.shared && m.contributors.includes(p.id),
  )) {
    const receipt = `coop:${m.round}:${p.id}`;
    if (
      !acknowledged.has(receipt) &&
      !s.deliveryAcks.includes(receipt) &&
      (p.attempts.get(receipt) ?? 0) < 5
    ) {
      if (
        send(p, {
          type: "complete",
          mission: m.id,
          round: m.round,
          receipt,
          amount: Math.floor(mt(m.template).reward / 2 / m.contributors.length),
        })
      )
        p.attempts.set(receipt, (p.attempts.get(receipt) ?? 0) + 1);
    }
  }
}
export function resync(id: string) {
  const p = peers.find((p) => p.id === id);
  if (!p) return;
  p.objects.clear();
  p.resetSent = false;
  p.attempts.clear();
  p.sentView = 0;
  sync(p);
  notice("Zustandsabgleich und ausstehende Belege erneut angefordert.");
}
function createPeer(session = uid()): Peer {
  if (peers.length >= 3) throw Error("Maximal vier Spieler.");
  const pc = new RTCPeerConnection({ iceServers: ice });
  const p: Peer = {
    pc,
    dc: null,
    session,
    id: "",
    name: "",
    generation: "",
    seq: 0,
    received: 0,
    last: Date.now(),
    sentView: 0,
    viewHash: "",
    rate: [],
    objects: new Map(),
    resetSent: false,
    attempts: new Map(),
    seen: new Set(),
  };
  pc.ondatachannel = (e) => attach(p, e.channel);
  pc.onconnectionstatechange = () => {
    if (["failed", "disconnected"].includes(pc.connectionState))
      emit({
        error:
          "Verbindung unterbrochen. Ohne eigenen TURN-Server sind manche Anschlüsse nicht erreichbar.",
      });
  };
  return p;
}
async function gather(p: Peer) {
  if (p.pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          Error(
            "ICE-Sammlung nach 20 Sekunden abgebrochen. STUN-/TURN-Einstellungen prüfen.",
          ),
        ),
      20000,
    );
    p.pc.addEventListener("icegatheringstatechange", () => {
      if (p.pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}
function encode(p: Peer) {
  const s = state();
  if (!s || !p.pc.localDescription) throw Error("Profil fehlt");
  return JSON.stringify({
    protocol: 1,
    world: WORLD,
    session: p.session,
    expires: Date.now() + 600000,
    player: s.player.id,
    name: s.player.name,
    generation: s.generation,
    description: p.pc.localDescription.toJSON(),
  });
}
function parse(text: string) {
  if (text.length > 110000) throw Error("Verbindungstext zu groß");
  const s = signalSchema.parse(JSON.parse(text));
  if (s.expires < Date.now() || s.expires > Date.now() + 660000)
    throw Error("Einladung abgelaufen");
  if (s.player === state()?.player.id)
    throw Error("Gleiches Profil: Kopien nicht gleichzeitig verbinden.");
  return s;
}
export async function makeOffer() {
  try {
    cancel();
    pending = createPeer();
    attach(
      pending,
      pending.pc.createDataChannel("leitstellen-verbund", { ordered: true }),
    );
    emit({ status: "ICE-Kandidaten werden gesammelt …", error: "" });
    await pending.pc.setLocalDescription(await pending.pc.createOffer());
    await gather(pending);
    emit({
      output: encode(pending),
      status:
        "Angebot vollständig. An Freund senden; anschließend Antwort einfügen.",
    });
  } catch (e) {
    emit({ error: String(e) });
  }
}
export async function useSignal(text: string) {
  try {
    const signal = parse(text);
    const existing = peers.find((p) => p.id === signal.player);
    if (existing && existing.generation !== signal.generation)
      throw Error(
        "Dieses Profil ist bereits mit einer anderen Spielstandgeneration verbunden. Zuerst die alte Verbindung trennen.",
      );
    if (existing) close(existing);
    if (signal.description.type === "offer") {
      cancel();
      pending = createPeer(signal.session);
      pending.id = signal.player;
      pending.name = signal.name;
      pending.generation = signal.generation;
      await pending.pc.setRemoteDescription(signal.description);
      await pending.pc.setLocalDescription(await pending.pc.createAnswer());
      await gather(pending);
      emit({
        output: encode(pending),
        status: "Antwort vollständig. An Einladenden zurücksenden.",
        error: "",
      });
    } else {
      if (!pending || pending.session !== signal.session)
        throw Error("Antwort gehört nicht zum aktuellen Angebot.");
      pending.id = signal.player;
      pending.name = signal.name;
      pending.generation = signal.generation;
      await pending.pc.setRemoteDescription(signal.description);
      emit({
        status: "Antwort übernommen. Warte auf offenen DataChannel …",
        error: "",
      });
    }
  } catch (e) {
    emit({ error: `Verbindungstext abgelehnt: ${String(e)}` });
  }
}
export function chat(text: string) {
  if (!text.trim() || text.length > 500) return;
  if (Date.now() - lastChat < 500) {
    emit({ error: "Höchstens zwei Chatnachrichten pro Sekunde." });
    return;
  }
  lastChat = Date.now();
  const s = state();
  if (!s) return;
  for (const p of peers) send(p, { type: "chat", text: text.trim() });
  emit({
    chat: [...net.chat, { name: s.player.name, text: text.trim() }].slice(-100),
  });
}
export async function share(id: string) {
  await change((s) => {
    const m = s.missions.find((m) => m.id === id);
    if (!m) throw Error("Einsatz fehlt");
    m.shared = true;
  });
  peers.forEach(sync);
}
export async function stopSharing(id: string) {
  const m = state()?.missions.find((m) => m.id === id && m.shared);
  if (!m) return;
  const round = m.round;
  await change((s) => endCooperation(s, id));
  for (const p of peers) send(p, { type: "abort", mission: id, round });
  for (const [key, f] of forces)
    if (f.mission === id && f.round === round) forces.delete(key);
  notice(
    "Kooperationsrunde beendet. Eigene Kräfte können den Einsatz unabhängig fortsetzen.",
  );
}
export async function support(peer: string, mission: Mission, vehicle: string) {
  const p = peers.find((p) => p.id === peer),
    s = state(),
    v = s?.vehicles.find((v) => v.id === vehicle);
  if (!p || !s || !v) throw Error("Freund oder Fahrzeug fehlt");
  const reason = readiness(s, v);
  if (reason) throw Error(reason);
  if ([...offers.values()].some((o) => o.vehicle === vehicle))
    throw Error("Reservierung läuft bereits.");
  const assignment = uid();
  await change((s) => {
    s.contributions.push({
      assignment,
      peer,
      mission: mission.id,
      round: mission.round,
      vehicle,
      maxReward: Math.floor(mt(mission.template).reward / 2),
      status: "reserved",
    });
  });
  offers.set(assignment, { peer, mission, vehicle, until: Date.now() + 15000 });
  send(p, {
    type: "offer",
    mission: mission.id,
    round: mission.round,
    assignment,
    vehicle: v,
  });
  notice("Unterstützungsangebot gesendet · warte auf Bestätigung.");
}
setRemoteProvider(() => {
  const result: Record<string, Skills> = {};
  for (const f of forces.values()) {
    if (
      Date.now() - f.at > 6000 ||
      f.vehicle.status !== "scene" ||
      !peers.some((p) => p.id === f.peer)
    )
      continue;
    const m = state()?.missions.find(
      (m) => m.id === f.mission && m.round === f.round && m.shared,
    );
    if (!m) continue;
    const skills = (result[m.id] ??= {});
    for (const [k, n] of Object.entries(vt(f.vehicle.type).skills))
      skills[k] = (skills[k] || 0) + n;
  }
  return result;
});
setInterval(() => {
  const now = Date.now();
  if (pending && now - pending.last > 600000) {
    cancel();
    emit({ error: "Einladung abgelaufen. Bitte ein neues Angebot erstellen." });
  }
  for (const p of [...peers]) {
    if (now - p.last > 15000) close(p);
    else sync(p);
  }
  for (const [key, o] of offers)
    if (o.until < now) {
      offers.delete(key);
      void change((s) => {
        const c = s.contributions.find(
          (c) => c.assignment === key && c.status === "reserved",
        );
        if (c) c.status = "cancelled";
      }).catch(() => {});
    }
  for (const [key, f] of forces)
    if (now - f.at > 30000) {
      forces.delete(key);
      void stopSharing(f.mission).catch(() => {});
    }
  const s = state();
  if (!s) return;
  for (const v of s.vehicles.filter((v) => v.mission?.startsWith("remote:"))) {
    if (peers.some((p) => v.mission!.startsWith(`remote:${p.id}:`))) {
      lostAt.delete(v.id);
      continue;
    }
    if (!lostAt.has(v.id)) {
      lostAt.set(v.id, now);
      continue;
    }
    if (now - lostAt.get(v.id)! >= 30000) {
      const assignment = v.assignment;
      void change((s) => {
        const current = s.vehicles.find(
          (x) => x.id === v.id && x.assignment === assignment,
        );
        if (current && current.status !== "transport") recall(s, current);
      }).catch(() => {});
      lostAt.delete(v.id);
    }
  }
}, 2000);

onProfileChange(() => {
  for (const p of [...peers]) close(p);
  cancel();
  forces.clear();
  offers.clear();
  lostAt.clear();
  emit({ friends: [], support: [], chat: [] });
});
