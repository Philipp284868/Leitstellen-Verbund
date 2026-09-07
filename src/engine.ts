import { buildReason, purchaseReason } from "./purchase";
import { vehiclePosition } from "./vehicle-position";
import { addXp, missionXp } from "./progression";
import { selectHospital } from "./simulation/hospitals";
import { measureTravel, telemetry } from "./simulation/reports";
import { effectiveSkills, canTransport } from "./simulation/major-resources";
import {
  suitableCrew,
  crewRequired,
  reserveReason,
  personAvailable,
} from "./simulation/staffing";
import { requirements } from "./simulation/hazards";
import { dynamicsTick, dynamicsComplete } from "./simulation/dynamics";
import {
  patientSeats,
  transportCandidates,
  boardPatients,
  deliverPatients,
} from "./simulation/patients";
import { updateWeather, weatherWeight } from "./simulation/weather";
import { routePlan, trafficTick } from "./simulation/traffic";
import { faultsTick } from "./simulation/faults";
import type { TravelMode } from "./simulation/dynamics-schema";
import { setFms } from "./simulation/fms";
import { beforeStep, afterVehicles, afterStep } from "./simulation/incidents";
import { simId } from "./simulation/events";
import {
  BALANCE,
  bt,
  vt,
  mt,
  missions,
  extensions,
  type Skills,
} from "./catalog";
import { level, type Save, type Mission, type Vehicle } from "./model";
import {
  nodes,
  nearest,
  docks,
  isWaterSite,
  WORLD_WIDTH,
  WORLD_HEIGHT,
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
  s.journal.unshift({ id: receipt ?? simId(s), at: s.time, amount, text });
  s.journal = s.journal.slice(0, 2000);
  return true;
}
export function readiness(s: Save, v: Vehicle) {
  const t = vt(v.type),
    b = s.buildings.find((b) => b.id === v.home);
  if (v.fault && v.fault.state !== "repaired")
    return "Fahrzeugdefekt: Reparatur erforderlich";
  if (s.desk.fleet[v.id]?.code === 6) return "FMS 6: nicht einsatzbereit";
  if (v.status !== "ready") return "Fahrzeug bereits gebunden";
  if (!b || b.ready > s.time) return "Wache im Bau";
  const reserve = reserveReason(s, v);
  if (reserve) return reserve;
  const crew = suitableCrew(s, v),
    needed = crewRequired(s, v);
  if (crew.length < needed)
    return `${needed - crew.length} geeignete Besatzungsmitglieder fehlen${t.training ? " · " + t.training : ""}`;
  return "";
}
export function capacity(s: Save, atScene?: string): Skills {
  const total: Skills = {};
  for (const v of s.vehicles.filter((v) =>
    atScene ? v.mission === atScene && v.status === "scene" : true,
  )) {
    if (atScene && v.fault && v.fault.state !== "repaired") continue;
    for (const [k, n] of Object.entries(
      effectiveSkills(
        atScene ? s.missions.find((m) => m.id === atScene) : undefined,
        v,
      ),
    ))
      total[k] = (total[k] || 0) + n;
  }
  return total;
}
export const missing = (m: Mission, skills: Skills) =>
  Object.entries(requirements(m))
    .filter(([k, n]) => (skills[k] || 0) < n)
    .map(([k, n]) => [k, n - (skills[k] || 0)] as const);
export function endCooperation(s: Save, id: string) {
  const m = s.missions.find((m) => m.id === id);
  if (!m || !m.shared) return;
  m.shared = false;
  m.round = simId(s);
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
  mode: TravelMode = status === "return" ? "normal" : "priority",
) {
  const origin = ["travel", "return", "transport"].includes(v.status)
    ? vehiclePosition(v, s.time)
    : v.status === "alarmed"
      ? v.path[0]
      : (v.path.at(-1) ?? s.buildings.find((b) => b.id === v.home)!.pos);
  const plan = routePlan(s, v, origin, target, mode);
  v.path = plan.path;
  v.depart = s.time;
  v.arrive = s.time + plan.seconds;
  v.journey = {
    motion: plan.motion,
    motionVersion: 1,
    wait: plan.wait,
    mode,
    planned: plan.planned,
    plannedSeconds: plan.plannedSeconds,
    delay: plan.delay,
    distanceDone: 0,
    events: [...plan.events, `weather-${s.environment?.period ?? 0}`],
    nextCheck: s.time + 60,
    serial: 0,
    target,
    blockedUntil: plan.blockedUntil,
    reason: plan.blockedUntil
      ? "Fahrt wetter- oder verkehrsbedingt ausgesetzt; warte auf Freigabe"
      : "",
  };
  v.status = status;
}
export function recall(s: Save, v: Vehicle) {
  if (v.fault && v.fault.state !== "repaired") return;
  for (const c of s.contributions.filter(
    (c) => c.assignment === v.assignment && c.status === "active",
  ))
    c.status = "returned";
  v.patients = 0;
  beginTrip(s, v, s.buildings.find((b) => b.id === v.home)!.pos, "return");
  setFms(s, v, 1, "server", "Rückfahrt zur Wache");
  v.assignment = null;
  delete v.turnout;
  delete v.destination;
  v.mission = null;
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
      const reason = buildReason(s, a.kind, a.pos);
      if (reason) throw Error(reason);
      const t = bt(a.kind);
      if (level(s) < t.level) throw Error(`Freischaltung ab Stufe ${t.level}.`);
      if (
        !Number.isFinite(a.pos.x) ||
        !Number.isFinite(a.pos.y) ||
        a.pos.x < 0 ||
        a.pos.y < 0 ||
        a.pos.x > WORLD_WIDTH ||
        a.pos.y > WORLD_HEIGHT
      )
        throw Error("Bauplatz außerhalb des Spielgebiets.");
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
        id: simId(s),
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
      const reason = purchaseReason(s, a.kind, a.home);
      if (reason) throw Error(reason);
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
        id: simId(s),
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
          id: simId(s),
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
            !personAvailable(s, p) &&
            (!t.training || p.skills.includes(t.training)),
        )
        .slice(0, t.crew - assigned);
      for (const p of candidates) p.vehicle = v.id;
      if (assigned + candidates.length < crewRequired(s, v))
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
      const required = Math.max(bt(b.type).level, b.level * 2);
      if (level(s) < required) throw Error(`Ausbau ab Stufe ${required}.`);
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
        v.assignment = simId(s);
        beginTrip(s, v, m.pos, "travel");
      }
      s.tutorial = Math.max(4, s.tutorial);
      break;
    }
    case "recall": {
      const v = s.vehicles.find((v) => v.id === a.id);
      if (!v || v.status === "ready" || v.status === "return")
        throw Error("Kein laufender Auftrag.");
      if (v.fault && v.fault.state !== "repaired")
        throw Error("Vor dem Rückruf die Reparatur beauftragen und abwarten.");
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
  const weighted = candidates.flatMap((t) =>
    Array.from({ length: weatherWeight(s, t.id) }, () => t),
  );
  const t = weighted[(s.seed >>> 16) % weighted.length];
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
    bases.some(
      (b) => distance(b.pos, p) <= (s.vehicles.length <= 4 ? 180 : 400),
    ),
  );
  if (!sites.length) return;
  const pos = t.water
    ? docks[s.seed % docks.length]
    : sites[s.seed % sites.length];
  s.missions.push({
    id: simId(s),
    template: t.id,
    pos,
    progress: 0,
    phase: "offered",
    created: s.time,
    completed: 0,
    shared: false,
    round: simId(s),
    contributors: [],
    transports: [],
  });
  s.nextMission = s.time + BALANCE.missionInterval;
}
export function hospital(
  s: Save,
  origin: Point,
  seats: number,
  m?: Mission,
  v?: Vehicle,
) {
  return selectHospital(s, origin, seats, m, v);
}
export function transport(s: Save, v: Vehicle, patients: number, m?: Mission) {
  const target = hospital(s, v.path.at(-1)!, patients, m, v);
  if (!target)
    throw Error(
      "Keine geeignete Krankenhausaufnahme. Patienten warten versorgt am Einsatzort.",
    );
  v.patients = patients;
  v.destination = target.id;
  beginTrip(s, v, target.pos, "transport");
}
export function tick(
  s: Save,
  wall: number,
  remote: Record<string, Skills> = {},
  offline = false,
  allowGeneration = true,
  carriers: Record<string, Skills> = {},
  remoteDynamic: Set<string> = new Set(),
  remoteUnits: Record<string, Vehicle[]> = {},
) {
  const delta = Math.max(0, Math.min(BALANCE.offlineMax, wall - s.time));
  const end = s.time + delta;
  while (s.time < end - 1e-8) {
    let next = Math.min(end, Math.floor(s.time + 1 + 1e-8));
    for (const v of s.vehicles)
      if (
        ["travel", "transport", "return"].includes(v.status) &&
        !v.journey?.blockedUntil &&
        v.arrive > s.time + 1e-8
      )
        next = Math.min(next, v.arrive);
    const dt = next - s.time;
    s.time = next;
    updateWeather(s);
    beforeStep(s);
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
      measureTravel(s, v, s.time - dt);
      faultsTick(s, v, remoteDynamic.has(v.mission || ""));
      if (v.fault && v.fault.state !== "repaired") continue;
      trafficTick(s, v);
      if (v.journey?.blockedUntil || v.arrive > s.time) continue;
      if (v.status === "travel") v.status = "scene";
      else if (v.status === "return") {
        v.status = "ready";
        v.path = [s.buildings.find((b) => b.id === v.home)!.pos];
      } else if (v.status === "transport") {
        const home =
          v.destination ??
          s.buildings.find(
            (b) => b.type === "hospital" && distance(b.pos, v.path.at(-1)!) < 1,
          )?.id ??
          "public";
        s.beds.push(
          ...Array.from({ length: v.patients }, () => ({
            id: simId(s),
            home,
            until: s.time + BALANCE.hospitalSeconds,
          })),
        );
        const m = s.missions.find((m) => m.id === v.mission);
        if (m) deliverPatients(s, m, v);
        const order = m?.transports.find((t) => t.assignment === v.assignment);
        if (order) order.status = "delivered";
        setFms(
          s,
          v,
          8,
          "server",
          "Transportziel erreicht und Patient übergeben",
        );
        for (const t of s.transfers.filter(
          (t) => t.assignment === v.assignment,
        ))
          t.delivered = true;
        recall(s, v);
      }
    }
    for (const m of s.missions)
      dynamicsTick(s, m, remote[m.id], carriers, remoteUnits[m.id]);
    afterVehicles(s, remote);
    for (const m of s.missions) {
      if (m.control && !m.control.briefed) continue;
      if (m.shared && offline) continue;
      const t = mt(m.template),
        skills = { ...capacity(s, m.id) };
      for (const [k, n] of Object.entries(remote[m.id] ?? {}))
        skills[k] = (skills[k] || 0) + n;
      if (m.phase === "offered" || m.phase === "working") {
        if (!missing(m, skills).length) {
          m.phase = "working";
          m.progress = Math.min(
            t.seconds,
            m.progress + dt * (m.dynamics?.tactic === "defensive" ? 0.65 : 1),
          );
          if (m.progress >= t.seconds && dynamicsComplete(m, s.time))
            m.phase = "transport";
        }
      }
      if (m.phase === "transport" || canTransport(m)) {
        let remaining =
          (patientSeats(m) ?? t.patients) -
          m.transports.reduce((n, t) => n + t.patients, 0);
        for (const v of s.vehicles.filter(
          (v) =>
            v.mission === m.id &&
            v.status === "scene" &&
            (!v.fault || v.fault.state === "repaired") &&
            canTransport(m, v) &&
            !m.transports.some((t) => t.assignment === v.assignment),
        )) {
          const seats = Math.min(
            remaining,
            vt(v.type).capacity,
            m.major ? transportCandidates(m).length : Infinity,
          );
          if (!seats || !hospital(s, v.path.at(-1)!, seats, m, v)) continue;
          transport(s, v, seats, m);
          boardPatients(s, m, v, seats);
          m.transports.push({
            assignment: v.assignment!,
            owner: s.player.id,
            vehicle: v.id,
            patients: seats,
            status: "ordered",
          });
          remaining -= seats;
        }
        if (m.phase !== "transport") continue;
        if (
          m.transports
            .filter((t) => t.status === "delivered")
            .reduce((n, t) => n + t.patients, 0) <
          (patientSeats(m) ?? t.patients)
        )
          continue;
        if (m.dynamics) m.dynamics.state = "resolved";
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
          const measured = telemetry(s, m);
          measured.credits = reward;
          measured.xp = missionXp(t);
          addXp(s, measured.xp);
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
    afterStep(s);
  }
  s.time = end;
  if (allowGeneration && !offline && s.time >= s.nextMission) generate(s);
}
