import { callGenerationAllowed } from "./simulation/call-generation";
import { beginTrip } from "./simulation/trip-start";
export { beginTrip } from "./simulation/trip-start";
import { vehicleHomeAllowed } from "./catalog";
import { setWaterSource, waterTripTick } from "./simulation/water-supply";
import {
  maintenanceTick,
  serviceVehicle,
} from "./simulation/vehicle-maintenance";
import {
  equipmentPrice,
  equipmentProfile,
  type Equipment,
} from "./simulation/vehicle-equipment";
import { bookMoney, saleValue } from "./economy/ledger";
import { ECONOMY_PRICES } from "./economy/prices";
import { mulRatio } from "./money";
import { reconcileBuildingStaffing } from "./simulation/building-staffing";
import { purchaseReason } from "./purchase";
import { purchaseFacility } from "./facilities/purchase";
import { canGenerate } from "./simulation/feasibility";
import { dispatchReason } from "./simulation/availability";
import {
  queuePostIncident,
  startPostIncident,
  postIncidentTick,
} from "./simulation/post-incident";
import { addXp, missionXp } from "./progression";
import { selectHospital } from "./simulation/hospitals";
import { measureTravel, telemetry, qualityFactor } from "./simulation/reports";
import { effectiveSkills, canTransport } from "./simulation/major-resources";
import { stationCapacity, releaseVolunteerCrew } from "./simulation/staffing";
import { requirements } from "./simulation/hazards";
import { dynamicsTick, dynamicsComplete } from "./simulation/dynamics";
import { tasksComplete } from "./simulation/mission-tasks";
import {
  migratePatientTransports,
  transportSeatsAvailable,
  registerPatientTransport,
  completePatientTransport,
  patientTransportsComplete,
} from "./simulation/patient-transport";
import {
  patientTransportReason,
  transportCandidates,
} from "./simulation/patients";
import { updateWeather } from "./simulation/weather";
import { chooseIncidentTemplate } from "./simulation/incident-selection";
import { withdraw } from "./simulation/withdrawal";
import { trafficTick } from "./simulation/traffic";
import { withAutomaticRouting } from "./simulation/routing-context";
import { faultsTick } from "./simulation/faults";
import { setFms } from "./simulation/fms";
import { beforeStep, afterVehicles, afterStep } from "./simulation/incidents";
import { simId, record } from "./simulation/events";
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
import { distance, type Point } from "./world";
export type Action =
  | { type: "vehicle-service"; vehicle: string }
  | {
      type: "water-source";
      mission: string;
      source: "tank" | "hydrant" | "open-water" | "shuttle";
    }
  | { type: "purchase-facility"; facility: string }
  | { type: "build"; kind: string; pos: Point }
  | { type: "buy"; kind: string; home: string; equipment?: Equipment }
  | {
      type: "buy-batch";
      items: { kind: string; home: string; equipment?: Equipment }[];
    }
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
export const money = bookMoney;
export function readiness(s: Save, v: Vehicle) {
  return dispatchReason(s, v);
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
export function recall(s: Save, v: Vehicle) {
  delete v.waterTrip;
  if (v.fault && v.fault.state !== "repaired") return;
  if (v.patients > 0)
    throw Error(
      "Patienten oder betreute Personen sind noch an das Fahrzeug gebunden.",
    );
  queuePostIncident(s, v);
  for (const c of s.contributions.filter(
    (c) => c.assignment === v.assignment && c.status === "active",
  ))
    c.status = "returned";
  const incident =
    s.missions.find((m) => m.id === v.mission) ??
    s.archive.find((m) => m.id === v.mission);
  if (incident)
    record(
      s,
      incident,
      "VEHICLE_RELEASED",
      `${v.name}: Einsatzbindung beendet; Rückfahrt zur Wache.`,
      "server",
      v.id,
    );
  beginTrip(s, v, s.buildings.find((b) => b.id === v.home)!.pos, "return");
  setFms(
    s,
    v,
    v.postIncident ? 6 : 1,
    "server",
    v.postIncident
      ? "Rückfahrt mit erforderlicher Nachbereitung"
      : "Einsatzbereit über Funk · Rückfahrt zur Wache",
  );
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
      throw Error(
        "Passive Grundfinanzierung wurde abgeschafft. Einnahmen entstehen durch Einsatzabrechnungen.",
      );
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
    case "build":
      throw Error(
        "BUILDING_PURCHASE_ONLY: Bitte einen bestehenden Standort erwerben.",
      );
    case "purchase-facility":
      purchaseFacility(s, a.facility);
      break;
    case "vehicle-service":
      serviceVehicle(s, a.vehicle);
      break;
    case "water-source": {
      const m = s.missions.find((m) => m.id === a.mission);
      if (!m) throw Error("Einsatz fehlt.");
      setWaterSource(s, m, a.source);
      break;
    }
    case "buy-batch": {
      if (!a.items.length || a.items.length > 30)
        throw Error("Bestellung benötigt 1 bis 30 Fahrzeuge.");
      const trial = structuredClone(s);
      for (const item of a.items) apply(trial, { type: "buy", ...item });
      Object.assign(s, trial);
      break;
    }
    case "buy": {
      const reason = purchaseReason(s, a.kind, a.home);
      if (reason) throw Error(reason);
      const t = vt(a.kind),
        b = s.buildings.find((b) => b.id === a.home);
      if (!b || !vehicleHomeAllowed(t, b.type) || b.ready > s.time)
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
        stationCapacity(b).slots
      )
        throw Error("Keine freien Stellplätze.");
      const price = equipmentPrice(t.id, a.equipment);
      money(s, -price, `Kauf: ${t.name}`);
      s.vehicles.push({
        id: simId(s),
        owner: s.player.id,
        type: t.id,
        purchasePriceCents: price,
        ...(a.equipment?.length ? { equipment: [...a.equipment] } : {}),
        name:
          b.type === "kats"
            ? `KatS-${t.id === "ktwb" ? "NKTW" : t.id === "gwsan" ? "GW-SAN" : t.id.toUpperCase()}${String(s.vehicles.filter((v) => v.home === b.id && v.type === t.id).length + 1).padStart(2, "0")}`
            : `${t.name} / ${s.vehicles.length + 1}`,
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
      const purchased = s.vehicles.at(-1)!;
      maintenanceTick(s, purchased);
      purchased.supplies = {
        water: equipmentProfile(purchased).water,
        refilledAt: s.time,
      };
      s.tutorial = Math.max(2, s.tutorial);
      break;
    }
    case "hire": {
      if (
        !s.buildings.some((b) => b.id === a.home) ||
        !Number.isInteger(a.count) ||
        a.count < 1 ||
        a.count > 30
      )
        throw Error("Ungültige Wache oder Personalangabe.");
      reconcileBuildingStaffing(s);
      break;
    }
    case "assign": {
      if (!s.vehicles.some((v) => v.id === a.vehicle))
        throw Error("Fahrzeug nicht gefunden.");
      reconcileBuildingStaffing(s);
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
        if (v.status !== "ready" || (v.maintenance?.until ?? 0) > s.time)
          throw Error("Fahrzeug ist nicht an der Wache.");
        s.people
          .filter((p) => p.vehicle === v.id)
          .forEach((p) => (p.vehicle = null));
        s.vehicles = s.vehicles.filter((x) => x.id !== v.id);
        money(
          s,
          saleValue(v.purchasePriceCents ?? vt(v.type).price),
          "Fahrzeugverkauf",
        );
      } else {
        const b = s.buildings.find((b) => b.id === a.id);
        if (
          !b ||
          s.vehicles.some(
            (v) =>
              v.home === b.id ||
              (v.status === "transport" && v.destination === b.id),
          ) ||
          s.people.some((p) => p.home === b.id && (p.vehicle || p.injury)) ||
          s.beds.some((x) => x.home === b.id)
        )
          throw Error(
            "Standort muss ohne Fahrzeuge, gebundenes Personal, Patienten und laufende Transporte sein.",
          );
        s.people = s.people.filter((p) => p.home !== b.id);
        s.buildings = s.buildings.filter((x) => x.id !== b.id);
        money(
          s,
          saleValue(b.purchasePriceCents ?? bt(b.type).price),
          "Gebäudeverkauf",
        );
      }
      break;
    }
    case "move": {
      if (s.buildings.some((b) => b.id === a.id))
        throw Error(
          "BUILDING_PURCHASE_ONLY: Einrichtungsstandorte können nicht versetzt werden.",
        );
      const v = s.vehicles.find((v) => v.id === a.id),
        b = s.buildings.find((b) => b.id === a.home);
      if (
        !v ||
        v.status !== "ready" ||
        (v.maintenance?.until ?? 0) > s.time ||
        !b ||
        b.ready > s.time ||
        !vehicleHomeAllowed(vt(v.type), b.type) ||
        (vt(v.type).stationKinds &&
          !vt(v.type).stationKinds!.includes(b.organization?.kind ?? "")) ||
        s.vehicles.filter((v) => v.home === b.id).length >=
          stationCapacity(b).slots
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
        throw Error("Automatische Behebung der Fahrzeugstörung abwarten.");
      if (v.patients)
        throw Error("Patiententransport muss zuerst abgeschlossen werden.");
      const m = s.missions.find((m) => m.id === v.mission);
      if (m && v.status === "scene") withdraw(s, m, [v.id], s.player.id);
      else recall(s, v);
      break;
    }
    case "favorite": {
      const v = s.vehicles.find((v) => v.id === a.id);
      if (v) v.favorite = !v.favorite;
      break;
    }
  }
  if (["build", "buy", "upgrade", "extension", "sell", "move"].includes(a.type))
    reconcileBuildingStaffing(s);
}
export function generate(s: Save) {
  if (!callGenerationAllowed(s)) return;
  const available = capacity(s);
  const candidates = missions.filter((m) => canGenerate(s, m, available));
  if (!candidates.length) return;
  const previousSeed = s.seed;
  const previousWait = s.missionWait;
  s.seed = (s.seed * 1664525 + 1013904223) >>> 0;
  let t = chooseIncidentTemplate(s, candidates);
  let location: ReturnType<typeof verifyIncidentLocation>;
  const remaining = [...candidates];
  for (let attempt = 0; attempt < 8 && remaining.length; attempt++) {
    if (attempt) t = chooseIncidentTemplate(s, remaining);
    remaining.splice(
      remaining.findIndex((candidate) => candidate.id === t.id),
      1,
    );
    s.seed = (s.seed * 1664525 + 1013904223) >>> 0;
    const sites = generationLocations(s, t);
    if (sites === null) {
      // Transient routing outages delay this draw without losing simulation progress
      // or consuming its random choice. Existing persisted timers survive restart.
      s.seed = previousSeed;
      s.missionWait = Math.max(s.missionWait, 60);
      s.nextMission = s.time + 60;
      return;
    }
    for (let i = 0; i < sites.length; i++) {
      location = verifyIncidentLocation(
        s,
        t,
        sites[(s.seed + i) % sites.length],
      );
      if (location) break;
    }
    if (location) break;
  }
  if (!location) return;
  s.missionWait = previousWait;
  const pos = location.access;
  s.missions.push({
    location,
    id: simId(s),
    template: t.id,
    paymentCents: t.reward,
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
export function tick(...args: Parameters<typeof tickState>) {
  return withAutomaticRouting(() => tickState(...args));
}
function tickState(
  s: Save,
  wall: number,
  remote: Record<string, Skills> = {},
  offline = false,
  allowGeneration = true,
  carriers: Record<string, Skills> = {},
  remoteDynamic: Set<string> = new Set(),
  remoteUnits: Record<string, Vehicle[]> = {},
  _practice = false,
) {
  for (const m of s.missions) migratePatientTransports(m);
  const delta = Math.max(0, Math.min(BALANCE.offlineMax, wall - s.time));
  const end = s.time + delta;
  while (s.time < end - 1e-8) {
    let next = Math.min(end, Math.floor(s.time + 1 + 1e-8));
    for (const v of s.vehicles) {
      if (v.status === "alarmed" && v.depart > s.time + 1e-8)
        next = Math.min(next, v.depart);
      if (
        ["travel", "transport", "return"].includes(v.status) &&
        !v.journey?.blockedUntil &&
        v.arrive > s.time + 1e-8
      )
        next = Math.min(next, v.arrive);
    }
    const dt = next - s.time;
    s.time = next;
    reconcileBuildingStaffing(s);
    updateWeather(s);
    beforeStep(s);
    if (s.reliefActive && s.reliefReady <= s.time) {
      money(
        s,
        ECONOMY_PRICES.legacyReliefReward,
        "Abschluss alter Bereitschaftsdienst",
      );
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
      maintenanceTick(s, v);
      postIncidentTick(s, v);
      measureTravel(s, v, s.time - dt);
      faultsTick(s, v, remoteDynamic.has(v.mission || ""));
      if (v.fault && v.fault.state !== "repaired") continue;
      trafficTick(s, v);
      if (waterTripTick(s, v)) continue;
      if (v.journey?.blockedUntil || v.arrive > s.time) continue;
      if (v.status === "travel") v.status = "scene";
      else if (v.status === "return") {
        v.status = "ready";
        v.supplies = { water: equipmentProfile(v).water, refilledAt: s.time };
        v.path = [s.buildings.find((b) => b.id === v.home)!.pos];
        releaseVolunteerCrew(s, v);
        startPostIncident(s, v);
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
        const order = m?.transports.find(
          (t) => t.assignment === v.assignment && t.status === "ordered",
        );
        if (m && order) completePatientTransport(s, m, order);
        setFms(
          s,
          v,
          8,
          "server",
          "Transportziel erreicht und Patient übergeben",
        );
        for (const t of s.transfers.filter(
          (t) => t.assignment === v.assignment && !t.delivered,
        ))
          t.delivered = true;
        const repeat =
          !!m &&
          transportCandidates(m).length > 0 &&
          !patientTransportReason(m, v);
        if (!repeat) queuePostIncident(s, v);
        v.patients = 0;
        if (m && repeat) {
          beginTrip(s, v, m.location?.access ?? m.pos, "travel");
          v.destination = undefined;
          setFms(s, v, 3, "server", "Erneute Anfahrt für weitere Patienten");
        } else {
          queuePostIncident(s, v);
          recall(s, v);
        }
      }
    }
    for (const m of s.missions)
      if (m.location?.state !== "repair-pending")
        dynamicsTick(s, m, remote[m.id], carriers, remoteUnits[m.id]);
    afterVehicles(s, remote);
    for (const m of s.missions) {
      if (m.location?.state === "repair-pending") continue;
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
        }
        // Durable task work may be performed sequentially by a multipurpose
        // crew. Completed tasks never demand a second simultaneous-force timer.
        if (m.dynamics?.active && m.tasks && tasksComplete(m))
          m.progress = t.seconds;
        if (m.progress >= t.seconds && dynamicsComplete(m, s.time))
          m.phase = "transport";
      }
      if (m.phase === "transport" || canTransport(m)) {
        for (const v of s.vehicles.filter(
          (v) =>
            v.mission === m.id &&
            v.status === "scene" &&
            (!v.fault || v.fault.state === "repaired") &&
            canTransport(m, v) &&
            !patientTransportReason(m, v) &&
            !m.transports.some(
              (t) => t.assignment === v.assignment && t.status === "ordered",
            ),
        )) {
          const seats = transportSeatsAvailable(m, v);
          if (!seats || !hospital(s, v.path.at(-1)!, seats, m, v)) continue;
          transport(s, v, seats, m);
          registerPatientTransport(s, m, v, seats);
        }
        if (m.phase !== "transport") continue;
        // Transport can outlast the first stabilization. Re-check the current
        // scene, follow-up care and mandatory tasks before any final reward.
        if (!dynamicsComplete(m, s.time)) continue;
        if (!patientTransportsComplete(m)) continue;
        if (m.dynamics) m.dynamics.state = "resolved";
        m.phase = "done";
        m.completed = s.time;
        const quality = qualityFactor(m);
        const reward = mulRatio(
          m.paymentCents ?? t.reward,
          Math.round(quality * 400),
          400 * (m.contributors.length ? 2 : 1),
        );
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
          measured.xp = Math.floor(missionXp(t) * quality);
          addXp(s, measured.xp);
          s.completed++;
          s.tutorial = Math.max(5, s.tutorial);
        }
        for (const v of s.vehicles.filter((v) => v.mission === m.id))
          recall(s, v);
      }
    }
    s.archive.unshift(...s.missions.filter((m) => m.phase === "done"));
    s.missions = s.missions.filter((m) => m.phase !== "done");
    afterStep(s);
  }
  s.time = end;
  if (allowGeneration && !offline && s.time >= s.nextMission) generate(s);
}
import { generationLocations } from "./simulation/incident-location";
import { verifyIncidentLocation } from "./simulation/location-reachability";
