import {
  BALANCE,
  bt,
  vt,
  mt,
  missions,
  extensions,
  type Skills,
} from "./catalog";
import { uid, level, type Save, type Mission, type Vehicle } from "./model";
import {
  nodes,
  nearest,
  route,
  length,
  publicHospital,
  docks,
  isWaterSite,
  along,
  distance,
  type Point,
} from "./world";
export type Action =
  | { type: "build"; kind: string; pos: Point }
  | { type: "buy"; kind: string; home: string }
  | { type: "hire"; home: string; count: number }
  | { type: "assign"; vehicle: string }
  | { type: "unassign"; vehicle: string }
  | { type: "dismiss"; person: string }
  | { type: "relief" }
  | { type: "extension"; id: string; kind: string }
  | { type: "train"; person: string; skill: string }
  | { type: "upgrade"; id: string }
  | { type: "rename"; id: string; name: string }
  | { type: "sell"; id: string }
  | { type: "move"; id: string; home: string }
  | { type: "dispatch"; mission: string; vehicles: string[] }
  | { type: "recall"; id: string }
  | { type: "favorite"; id: string };
export function money(s: Save, amount: number, text: string, receipt?: string) {
  if (receipt && s.receipts.includes(receipt)) return false;
  if (
    !Number.isSafeInteger(amount) ||
    s.money + amount < 0 ||
    !Number.isSafeInteger(s.money + amount)
  )
    throw Error("Nicht genügend Credits oder ungültiger Betrag.");
  s.money += amount;
  if (receipt) s.receipts.push(receipt);
  s.journal.unshift({ id: receipt ?? uid(), at: s.time, amount, text });
  s.journal = s.journal.slice(0, 2000);
  return true;
}
export function readiness(s: Save, v: Vehicle) {
  const t = vt(v.type),
    b = s.buildings.find((b) => b.id === v.home);
  if (v.status !== "ready") return "Fahrzeug bereits gebunden";
  if (!b || b.ready > s.time) return "Wache im Bau";
  const crew = s.people.filter(
    (p) =>
      p.vehicle === v.id &&
      p.ready <= s.time &&
      (!t.training || p.skills.includes(t.training)),
  );
  if (crew.length < t.crew)
    return `${t.crew - crew.length} geeignete Besatzungsmitglieder fehlen${t.training ? " · " + t.training : ""}`;
  return "";
}
export function capacity(s: Save, atScene?: string): Skills {
  const total: Skills = {};
  for (const v of s.vehicles.filter((v) =>
    atScene ? v.mission === atScene && v.status === "scene" : true,
  )) {
    for (const [k, n] of Object.entries(vt(v.type).skills))
      total[k] = (total[k] || 0) + n;
  }
  return total;
}
export const missing = (m: Mission, skills: Skills) =>
  Object.entries(mt(m.template).requirements)
    .filter(([k, n]) => (skills[k] || 0) < n)
    .map(([k, n]) => [k, n - (skills[k] || 0)] as const);
export function endCooperation(s: Save, id: string) {
  const m = s.missions.find((m) => m.id === id);
  if (!m || !m.shared) return;
  m.shared = false;
  m.round = uid();
  m.contributors = [];
  m.transports = m.transports.filter(
    (t) => t.status === "delivered" || t.owner === s.player.id,
  );
}
export function beginTrip(
  s: Save,
  v: Vehicle,
  target: Point,
  status: Vehicle["status"],
) {
  const origin = ["travel", "return", "transport"].includes(v.status)
    ? along(v.path, (s.time - v.depart) / (v.arrive - v.depart))
    : (v.path.at(-1) ?? s.buildings.find((b) => b.id === v.home)!.pos);
  v.path = route(origin, target, vt(v.type).mode);
  v.depart = s.time;
  v.arrive =
    s.time + Math.max(3, (length(v.path) * 12) / (vt(v.type).speed / 3.6));
  v.status = status;
}
export function recall(s: Save, v: Vehicle) {
  for (const c of s.contributions.filter(
    (c) => c.assignment === v.assignment && c.status === "active",
  ))
    c.status = "returned";
  v.assignment = null;
  v.mission = null;
  v.patients = 0;
  beginTrip(s, v, s.buildings.find((b) => b.id === v.home)!.pos, "return");
}
export function apply(s: Save, a: Action) {
  switch (a.type) {
    case "extension": {
      const b = s.buildings.find((b) => b.id === a.id),
        e = extensions.find((e) => e.id === a.kind);
      if (
        !b ||
        !e ||
        e.home !== b.type ||
        b.ready > s.time ||
        b.extensions.includes(e.id as (typeof b.extensions)[number]) ||
        level(s) < e.level
      )
        throw Error("Erweiterung derzeit nicht möglich.");
      money(s, -e.price, e.name);
      b.extensions.push(e.id as (typeof b.extensions)[number]);
      b.ready = s.time + BALANCE.upgradeSeconds;
      break;
    }
    case "relief":
      if (s.reliefActive) throw Error("Bereitschaftsdienst läuft bereits.");
      s.reliefActive = true;
      s.reliefReady = s.time + 120;
      break;
    case "unassign": {
      const v = s.vehicles.find((v) => v.id === a.vehicle);
      if (!v || v.status !== "ready")
        throw Error("Fahrzeug muss an der Wache stehen.");
      s.people
        .filter((p) => p.vehicle === v.id)
        .forEach((p) => (p.vehicle = null));
      break;
    }
    case "dismiss": {
      const p = s.people.find((p) => p.id === a.person);
      if (!p || p.vehicle || p.training)
        throw Error(
          "Nur freies Personal ohne Ausbildung kann entlassen werden.",
        );
      s.people = s.people.filter((x) => x.id !== p.id);
      break;
    }
    case "build": {
      const t = bt(a.kind);
      if (level(s) < t.level) throw Error(`Freischaltung ab Stufe ${t.level}.`);
      const pos = nodes[nearest(a.pos)];
      if (
        s.buildings.some(
          (b) => Math.hypot(b.pos.x - pos.x, b.pos.y - pos.y) < 20,
        )
      )
        throw Error("Bauplatz bereits belegt.");
      if (t.water && !isWaterSite(pos))
        throw Error("Wasserrettung benötigt einen markierten Hafenbauplatz.");
      money(s, -t.price, `Bau: ${t.name}`);
      s.buildings.push({
        id: uid(),
        owner: s.player.id,
        type: t.id,
        name: `${t.name} ${s.buildings.length + 1}`,
        pos,
        level: 1,
        ready: s.time + BALANCE.buildSeconds,
        extensions: [],
      });
      s.tutorial = Math.max(1, s.tutorial);
      break;
    }
    case "buy": {
      const t = vt(a.kind),
        b = s.buildings.find((b) => b.id === a.home);
      if (!b || b.type !== t.home || b.ready > s.time)
        throw Error("Keine passende fertige Wache.");
      if (level(s) < t.level) throw Error(`Freischaltung ab Stufe ${t.level}.`);
      const extension = extensions.find((e) => e.types.includes(t.id));
      if (
        extension &&
        !b.extensions.includes(extension.id as (typeof b.extensions)[number])
      )
        throw Error("Benötigte Wachenerweiterung: " + extension.name);
      if (
        s.vehicles.filter((v) => v.home === b.id).length >=
        bt(b.type).slots * b.level
      )
        throw Error("Keine freien Stellplätze.");
      money(s, -t.price, `Kauf: ${t.name}`);
      s.vehicles.push({
        id: uid(),
        owner: s.player.id,
        type: t.id,
        name: `${t.name} / ${s.vehicles.length + 1}`,
        home: b.id,
        favorite: false,
        status: "ready",
        mission: null,
        assignment: null,
        path: [b.pos],
        depart: s.time,
        arrive: s.time,
        patients: 0,
      });
      s.tutorial = Math.max(2, s.tutorial);
      break;
    }
    case "hire": {
      const b = s.buildings.find((b) => b.id === a.home);
      if (!b || !Number.isInteger(a.count) || a.count < 1 || a.count > 30)
        throw Error("Ungültige Einstellung.");
      if (
        s.people.filter((p) => p.home === b.id).length + a.count >
        bt(b.type).people * b.level
      )
        throw Error("Keine freien Personalplätze.");
      money(s, -a.count * BALANCE.hire, "Personal eingestellt");
      for (let i = 0; i < a.count; i++)
        s.people.push({
          id: uid(),
          home: b.id,
          vehicle: null,
          skills: [],
          training: "",
          ready: 0,
        });
      break;
    }
    case "assign": {
      const v = s.vehicles.find((v) => v.id === a.vehicle);
      if (!v || v.status !== "ready")
        throw Error("Fahrzeug muss an der Wache sein.");
      const t = vt(v.type),
        assigned = s.people.filter((p) => p.vehicle === v.id).length;
      const candidates = s.people
        .filter(
          (p) =>
            p.home === v.home &&
            !p.vehicle &&
            p.ready <= s.time &&
            (!t.training || p.skills.includes(t.training)),
        )
        .slice(0, t.crew - assigned);
      for (const p of candidates) p.vehicle = v.id;
      if (assigned + candidates.length < t.crew)
        throw Error(
          "Zuerst ausreichend geeignetes Personal einstellen oder ausbilden.",
        );
      s.tutorial = Math.max(3, s.tutorial);
      break;
    }
    case "train": {
      const p = s.people.find((p) => p.id === a.person);
      if (
        !p ||
        p.ready > s.time ||
        !s.buildings.some((b) => b.type === "school" && b.ready <= s.time) ||
        ![
          "Drehleiter",
          "Führung",
          "Bergung",
          "Gefahrgut",
          "Atemschutz",
          "Notarzt",
          "Luftrettung",
          "Wasserrettung",
        ].includes(a.skill)
      )
        throw Error("Ausbildungszentrum und freies Personal erforderlich.");
      if (
        p.vehicle &&
        s.vehicles.find((v) => v.id === p.vehicle)?.status !== "ready"
      )
        throw Error("Personal ist im Einsatz.");
      if (p.skills.includes(a.skill))
        throw Error("Ausbildung bereits vorhanden.");
      money(s, -BALANCE.training, `Ausbildung: ${a.skill}`);
      p.training = a.skill;
      p.ready = s.time + BALANCE.trainingSeconds;
      break;
    }
    case "upgrade": {
      const b = s.buildings.find((b) => b.id === a.id);
      if (!b || b.ready > s.time || b.level >= 10)
        throw Error("Ausbau derzeit nicht möglich.");
      money(s, -BALANCE.upgrade * b.level, "Wachenausbau");
      b.level++;
      b.ready = s.time + BALANCE.upgradeSeconds;
      if (s.tutorial >= 5) s.tutorial = 6;
      break;
    }
    case "rename": {
      const o =
        s.buildings.find((b) => b.id === a.id) ??
        s.vehicles.find((v) => v.id === a.id);
      if (!o || !a.name.trim() || a.name.length > 48)
        throw Error("Name muss 1–48 Zeichen enthalten.");
      o.name = a.name.trim();
      break;
    }
    case "sell": {
      const v = s.vehicles.find((v) => v.id === a.id);
      if (v) {
        if (v.status !== "ready")
          throw Error("Fahrzeug ist nicht an der Wache.");
        s.people
          .filter((p) => p.vehicle === v.id)
          .forEach((p) => (p.vehicle = null));
        s.vehicles = s.vehicles.filter((x) => x.id !== v.id);
        money(s, Math.floor(vt(v.type).price * 0.6), "Fahrzeugverkauf");
      } else {
        const b = s.buildings.find((b) => b.id === a.id);
        if (
          !b ||
          s.vehicles.some((v) => v.home === b.id) ||
          s.people.some((p) => p.home === b.id) ||
          s.beds.some((x) => x.home === b.id)
        )
          throw Error(
            "Wache muss ohne Fahrzeuge, Personal und Patienten sein.",
          );
        s.buildings = s.buildings.filter((x) => x.id !== b.id);
        money(s, Math.floor(bt(b.type).price * 0.6), "Gebäudeverkauf");
      }
      break;
    }
    case "move": {
      const v = s.vehicles.find((v) => v.id === a.id),
        b = s.buildings.find((b) => b.id === a.home);
      if (
        !v ||
        v.status !== "ready" ||
        !b ||
        b.ready > s.time ||
        b.type !== vt(v.type).home ||
        s.vehicles.filter((v) => v.home === b.id).length >=
          bt(b.type).slots * b.level
      )
        throw Error("Versetzung derzeit nicht möglich.");
      s.people
        .filter((p) => p.vehicle === v.id)
        .forEach((p) => (p.vehicle = null));
      v.home = b.id;
      v.path = [b.pos];
      break;
    }
    case "dispatch": {
      const m = s.missions.find((m) => m.id === a.mission);
      if (!m || m.phase === "done") throw Error("Einsatz nicht verfügbar.");
      const ids = [...new Set(a.vehicles)];
      if (!ids.length) throw Error("Mindestens ein Fahrzeug auswählen.");
      for (const id of ids) {
        const v = s.vehicles.find((v) => v.id === id);
        if (!v) throw Error("Fahrzeug fehlt.");
        const reason = readiness(s, v);
        if (reason) throw Error(`${v.name}: ${reason}`);
        if (vt(v.type).mode === "water" && !mt(m.template).water)
          throw Error("Boot nur an Gewässereinsätzen einsetzbar.");
      }
      for (const id of ids) {
        const v = s.vehicles.find((v) => v.id === id)!;
        v.mission = m.id;
        v.assignment = uid();
        beginTrip(s, v, m.pos, "travel");
      }
      s.tutorial = Math.max(4, s.tutorial);
      break;
    }
    case "recall": {
      const v = s.vehicles.find((v) => v.id === a.id);
      if (!v || v.status === "ready" || v.status === "return")
        throw Error("Kein laufender Auftrag.");
      if (v.patients)
        throw Error("Patiententransport muss zuerst abgeschlossen werden.");
      recall(s, v);
      break;
    }
    case "favorite": {
      const v = s.vehicles.find((v) => v.id === a.id);
      if (v) v.favorite = !v.favorite;
      break;
    }
  }
}
export function generate(s: Save) {
  if (s.missions.length >= BALANCE.activeMax) return;
  const available = capacity(s);
  const candidates = missions.filter(
    (m) =>
      m.level <= level(s) &&
      Object.entries(m.requirements).every(
        ([k, n]) => (available[k] || 0) >= n,
      ),
  );
  if (!candidates.length) return;
  s.seed = (s.seed * 1664525 + 1013904223) >>> 0;
  const t = candidates[(s.seed >>> 16) % candidates.length];
  s.seed = (s.seed * 1664525 + 1013904223) >>> 0;
  const relevantHomes = new Set(
    s.vehicles
      .filter((v) =>
        Object.keys(vt(v.type).skills).some((k) => t.requirements[k]),
      )
      .map((v) => v.home),
  );
  const bases = s.buildings.filter(
    (b) => b.ready <= s.time && relevantHomes.has(b.id),
  );
  const sites = nodes.filter((p) =>
    bases.some((b) => distance(b.pos, p) <= 600),
  );
  if (!sites.length) return;
  const pos = t.water
    ? docks[s.seed % docks.length]
    : sites[s.seed % sites.length];
  s.missions.push({
    id: uid(),
    template: t.id,
    pos,
    progress: 0,
    phase: "offered",
    created: s.time,
    completed: 0,
    shared: false,
    round: uid(),
    contributors: [],
    transports: [],
  });
  s.nextMission = s.time + BALANCE.missionInterval;
}
export function hospital(s: Save, origin: Point, seats: number) {
  const options = [
    { id: "public", pos: publicHospital, capacity: 100 },
    ...s.buildings
      .filter((b) => b.type === "hospital" && b.ready <= s.time)
      .map((b) => ({ id: b.id, pos: b.pos, capacity: 20 * b.level })),
  ];
  return options
    .filter(
      (h) =>
        s.beds.filter((b) => b.home === h.id).length +
          s.vehicles
            .filter(
              (v) =>
                v.status === "transport" && distance(v.path.at(-1)!, h.pos) < 1,
            )
            .reduce((a, v) => a + v.patients, 0) +
          seats <=
        h.capacity,
    )
    .sort((a, b) => distance(a.pos, origin) - distance(b.pos, origin))[0];
}
export function transport(s: Save, v: Vehicle, patients: number) {
  const target = hospital(s, v.path.at(-1)!, patients);
  if (!target)
    throw Error(
      "Alle Krankenhäuser belegt. Patienten warten versorgt am Einsatzort.",
    );
  v.patients = patients;
  beginTrip(s, v, target.pos, "transport");
}
export function tick(
  s: Save,
  wall: number,
  remote: Record<string, Skills> = {},
  offline = false,
  allowGeneration = true,
) {
  const delta = Math.max(0, Math.min(BALANCE.offlineMax, wall - s.time));
  const end = s.time + delta;
  const steps = Math.min(1200, Math.ceil(delta / 10));
  const dt = steps ? delta / steps : 0;
  for (let step = 0; step < steps; step++) {
    s.time += dt;
    if (s.reliefActive && s.reliefReady <= s.time) {
      money(s, 1500, "Öffentlicher Bereitschaftsdienst");
      s.reliefActive = false;
    }
    for (const p of s.people)
      if (p.training && p.ready <= s.time) {
        p.skills.push(p.training);
        p.training = "";
      }
    s.beds = s.beds.filter((b) => {
      if (b.until <= s.time) {
        s.treated++;
        return false;
      }
      return true;
    });
    for (const v of s.vehicles) {
      if (v.arrive > s.time) continue;
      if (v.status === "travel") v.status = "scene";
      else if (v.status === "return") {
        v.status = "ready";
        v.path = [s.buildings.find((b) => b.id === v.home)!.pos];
      } else if (v.status === "transport") {
        const home =
          s.buildings.find(
            (b) => b.type === "hospital" && distance(b.pos, v.path.at(-1)!) < 1,
          )?.id ?? "public";
        s.beds.push(
          ...Array.from({ length: v.patients }, () => ({
            id: uid(),
            home,
            until: s.time + BALANCE.hospitalSeconds,
          })),
        );
        const m = s.missions.find((m) => m.id === v.mission);
        const order = m?.transports.find((t) => t.assignment === v.assignment);
        if (order) order.status = "delivered";
        for (const t of s.transfers.filter(
          (t) => t.assignment === v.assignment,
        ))
          t.delivered = true;
        recall(s, v);
      }
    }
    for (const m of s.missions) {
      if (m.shared && offline) continue;
      const t = mt(m.template),
        skills = { ...capacity(s, m.id) };
      for (const [k, n] of Object.entries(remote[m.id] ?? {}))
        skills[k] = (skills[k] || 0) + n;
      if (m.phase === "offered" || m.phase === "working") {
        if (missing(m, skills).length) continue;
        m.phase = "working";
        m.progress = Math.min(t.seconds, m.progress + dt);
        if (m.progress >= t.seconds) m.phase = "transport";
      }
      if (m.phase === "transport") {
        let remaining =
          t.patients - m.transports.reduce((n, t) => n + t.patients, 0);
        for (const v of s.vehicles.filter(
          (v) =>
            v.mission === m.id &&
            v.status === "scene" &&
            !m.transports.some((t) => t.assignment === v.assignment),
        )) {
          const seats = Math.min(remaining, vt(v.type).capacity);
          if (!seats || !hospital(s, v.path.at(-1)!, seats)) continue;
          transport(s, v, seats);
          m.transports.push({
            assignment: v.assignment!,
            owner: s.player.id,
            vehicle: v.id,
            patients: seats,
            status: "ordered",
          });
          remaining -= seats;
        }
        if (
          m.transports
            .filter((t) => t.status === "delivered")
            .reduce((n, t) => n + t.patients, 0) < t.patients
        )
          continue;
        m.phase = "done";
        m.completed = s.time;
        const reward = m.contributors.length
          ? Math.floor(t.reward / 2)
          : t.reward;
        if (
          money(
            s,
            reward,
            `Abschluss: ${t.name}`,
            `solo:${m.round}:${s.player.id}`,
          )
        ) {
          s.xp += 50 + t.level * 10;
          s.completed++;
          s.tutorial = Math.max(5, s.tutorial);
        }
        for (const v of s.vehicles.filter((v) => v.mission === m.id))
          recall(s, v);
      }
    }
    s.archive.unshift(...s.missions.filter((m) => m.phase === "done"));
    s.archive = s.archive.slice(0, 500);
    s.missions = s.missions.filter((m) => m.phase !== "done");
  }
  s.time = end;
  if (allowGeneration && !offline && s.time >= s.nextMission) generate(s);
}
