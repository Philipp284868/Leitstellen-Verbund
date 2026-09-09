import { WORLD_SEED } from "./region";
import { responderInjurySchema } from "./simulation/responder-recovery";
import { stationCapacity, validateStaffing } from "./simulation/staffing";
import {
  availabilitySchema,
  postIncidentSchema,
} from "./simulation/availability-schema";
import { IS_GERMANY } from "./world-choice";
import { migrateTravel } from "./travel-migration";
import { progress, xpForLevel } from "./progression";
import { majorSchema, operationsSchema } from "./simulation/major-schema";
import {
  reportSchema,
  telemetrySchema,
  statisticsSchema,
} from "./simulation/report-schema";
import {
  stationSchema,
  dutySchema,
  turnoutSchema,
  hospitalSchema,
  organizationMissionSchema,
  aidSchema,
} from "./simulation/organizations-schema";
import {
  dynamicsSchema,
  environmentSchema,
  journeySchema,
  faultSchema,
} from "./simulation/dynamics-schema";
import { deskSchema, incidentSchema } from "./simulation/schema";
import { missionTaskStateSchema } from "./simulation/mission-task-schema";
import { migrateMap, validLegacySite } from "./world-migration";
import { z } from "zod";
import { bt, vt, mt, BALANCE } from "./catalog";
import {
  WORLD,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  LEGACY_WORLD,
  nodes,
  nearest,
  distance,
  isWaterSite,
} from "./world";
const id = z.string().min(1).max(100),
  name = z.string().trim().min(1).max(48),
  num = z.number().finite().nonnegative().max(1e12),
  integer = num.int();
export const point = z
  .object({
    x: z.number().min(0).max(WORLD_WIDTH),
    y: z.number().min(0).max(WORLD_HEIGHT),
  })
  .strict();
export const buildingSchema = z
  .object({
    id,
    owner: id,
    type: id,
    name,
    pos: point,
    level: integer.min(1).max(10),
    ready: num,
    organization: stationSchema.optional(),
    hospital: hospitalSchema.optional(),
    extensions: z
      .array(z.enum(["technical", "hazmat", "air", "doctor"]))
      .max(4)
      .default([]),
  })
  .strict();
export const personSchema = z
  .object({
    id,
    home: id,
    vehicle: id.nullable(),
    duty: dutySchema.optional(),
    injury: responderInjurySchema.optional(),
    skills: z.array(z.string().max(30)).max(20),
    training: z.string().max(30),
    ready: num,
  })
  .strict();
export const vehicleSchema = z
  .object({
    odometer: num.optional(),
    turnout: turnoutSchema.optional(),
    reserve: z.boolean().optional(),
    destination: id.optional(),
    journey: journeySchema.optional(),
    fault: faultSchema.optional(),
    postIncident: postIncidentSchema.optional(),
    availability: availabilitySchema.optional(),
    id,
    owner: id,
    type: id,
    name,
    home: id,
    favorite: z.boolean(),
    status: z.enum([
      "ready",
      "alarmed",
      "travel",
      "scene",
      "transport",
      "return",
    ]),
    mission: id.nullable(),
    assignment: id.nullable(),
    path: z.array(point).max(200000),
    depart: num,
    arrive: num,
    patients: integer.max(100),
  })
  .strict();
export const missionSchema = z
  .object({
    tasks: missionTaskStateSchema.optional(),
    telemetry: telemetrySchema.optional(),
    report: reportSchema.optional(),
    major: majorSchema.optional(),
    organization: organizationMissionSchema.optional(),
    control: incidentSchema.optional(),
    dynamics: dynamicsSchema.optional(),
    id,
    template: id,
    pos: point,
    progress: num,
    phase: z.enum(["offered", "working", "transport", "done"]),
    created: num,
    completed: num,
    shared: z.boolean(),
    round: id,
    contributors: z.array(id).max(4),
    transports: z
      .array(
        z
          .object({
            assignment: id,
            owner: id,
            vehicle: id,
            patients: integer.min(1).max(100),
            status: z.enum(["ordered", "delivered"]),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict();
export const journalSchema = z
  .object({
    id,
    at: num,
    amount: z.number().int().finite().min(-1e9).max(1e9),
    text: z.string().max(180),
  })
  .strict();
export const saveSchema = z
  .object({
    statistics: statisticsSchema,
    operations: operationsSchema,
    aid: z.array(aidSchema).max(500).default([]),
    desk: deskSchema,
    environment: environmentSchema.optional(),
    version: z.literal(1),
    regionVersion: z.literal(3).optional(),
    worldSeed: z.literal(WORLD_SEED).default(WORLD_SEED),
    world: z.literal(WORLD),
    generation: id,
    revision: integer,
    player: z.object({ id, name, station: name }).strict(),
    money: integer,
    xp: integer,
    progression: z
      .object({
        version: z.literal(1),
        compensation: integer,
        previousXp: integer,
        previousLevel: integer,
      })
      .strict()
      .optional(),
    completed: integer.default(0),
    time: num,
    seed: integer,
    nextMission: num,
    missionWait: num.default(0),
    callPacing: z
      .object({
        version: z.literal(1),
        notBefore: num,
        lastCreated: num,
        sequence: integer,
      })
      .strict()
      .optional(),
    speed: z.number().min(1).max(32),
    settings: z
      .object({ light: z.boolean(), reduced: z.boolean() })
      .strict()
      .default({ light: false, reduced: false }),
    buildings: z.array(buildingSchema).max(150),
    people: z.array(personSchema).max(6000),
    vehicles: z.array(vehicleSchema).max(500),
    missions: z.array(missionSchema),
    archive: z.array(missionSchema),
    journal: z.array(journalSchema).max(2000),
    receipts: z.array(id).max(50000),
    deliveryAcks: z.array(id).max(10000).default([]),
    treated: integer,
    reliefActive: z.boolean().default(false),
    reliefReady: num.default(0),
    beds: z.array(z.object({ id, home: id, until: num }).strict()).max(500),
    tutorial: integer.max(6),
    contributions: z
      .array(
        z
          .object({
            assignment: id,
            peer: id,
            mission: id,
            round: id,
            vehicle: id,
            maxReward: integer,
            status: z.enum(["reserved", "active", "returned", "cancelled"]),
          })
          .strict(),
      )
      .max(1000)
      .default([]),
    transfers: z
      .array(
        z
          .object({
            peer: id,
            assignment: id,
            round: id,
            mission: id,
            patients: integer.min(1).max(10),
            delivered: z.boolean(),
          })
          .strict(),
      )
      .max(1000)
      .default([]),
    templates: z
      .array(z.object({ name, types: z.array(id).max(30) }).strict())
      .max(12),
  })
  .strict();
export type Save = z.infer<typeof saveSchema>;
export type Vehicle = z.infer<typeof vehicleSchema>;
export type Mission = z.infer<typeof missionSchema>;
export type Building = z.infer<typeof buildingSchema>;
export const uid = (): string => crypto.randomUUID();
export const level = (s: Save) => progress(s.xp).level;
export function fresh(player: string, station: string, now: number): Save {
  return saveSchema.parse({
    version: 1,
    world: WORLD,
    regionVersion: 3,
    generation: uid(),
    revision: 0,
    player: { id: uid(), name: player, station },
    money: BALANCE.start,
    xp: 0,
    progression: {
      version: 1,
      compensation: 0,
      previousXp: 0,
      previousLevel: 1,
    },
    time: now,
    seed: Number.parseInt(uid().slice(0, 8), 16),
    nextMission: now,
    speed: BALANCE.speed,
    buildings: [],
    people: [],
    vehicles: [],
    missions: [],
    archive: [],
    journal: [],
    receipts: [],
    treated: 0,
    beds: [],
    tutorial: 0,
    templates: [],
  });
}
export function validate(data: unknown): Save {
  const legacy =
    typeof data === "object" &&
    data !== null &&
    "world" in data &&
    WORLD === "falkenried-2" &&
    data.world === LEGACY_WORLD;
  const s: Save = legacy
    ? {
        ...saveSchema.extend({ world: z.literal(LEGACY_WORLD) }).parse(data),
        world: WORLD,
      }
    : saveSchema.parse(data);
  if (!s.progression) {
    const previousXp = s.xp,
      previousLevel = Math.min(10, 1 + Math.floor(previousXp / 150));
    const compensation = Math.max(0, xpForLevel(previousLevel) - previousXp);
    s.xp += compensation;
    s.progression = { version: 1, compensation, previousXp, previousLevel };
  }
  const ids = [
    ...s.buildings,
    ...s.vehicles,
    ...s.people,
    ...s.missions,
    ...s.archive,
  ].map((x) => x.id);
  if (new Set(ids).size !== ids.length)
    throw Error("Doppelte Objekt-IDs im Spielstand.");
  if (new Set(s.receipts).size !== s.receipts.length)
    throw Error("Doppelte Abschlussbelege.");
  for (const request of s.aid) {
    if (
      request.owner !== s.player.id ||
      request.peer === request.owner ||
      new Set(request.assignments.map((a) => a.assignment)).size !==
        request.assignments.length
    )
      throw Error("Ungültige Unterstützungsanfrage.");
    request.types.forEach(vt);
  }
  if (new Set(s.aid.map((r) => r.id)).size !== s.aid.length)
    throw Error("Doppelte Unterstützungsanfrage.");
  for (const b of s.buildings) {
    bt(b.type);
    if (
      b.organization &&
      !(
        b.type === "fire"
          ? ["bf", "ff", "works", "company", "airport"]
          : [b.type === "heli" ? "ems" : b.type]
      ).includes(b.organization.kind)
    )
      throw Error("Ungültige Wachenorganisation.");
    if (
      b.hospital &&
      (b.type !== "hospital" || b.hospital.capacity > b.level * 20)
    )
      throw Error("Ungültiges Aufnahmeprofil.");
    if (b.owner !== s.player.id) throw Error("Fremder Gebäudebesitz.");
  }
  for (const v of s.vehicles) {
    const t = vt(v.type);
    const home = s.buildings.find((b) => b.id === v.home);
    if (!home || home.type !== t.home || v.owner !== s.player.id)
      throw Error("Ungültige Fahrzeugzuordnung.");
    if (v.status === "ready" && (v.assignment || v.mission))
      throw Error("Bereites Fahrzeug mit Zuweisung.");
  }
  for (const p of s.people) {
    if (p.duty && (!nodes[p.duty.homeNode] || !nodes[p.duty.workNode]))
      throw Error("Ungültiger Personalstandort.");
    if (
      !s.buildings.some((b) => b.id === p.home) ||
      (p.vehicle &&
        !s.vehicles.some((v) => v.id === p.vehicle && v.home === p.home))
    )
      throw Error("Ungültige Personalzuordnung.");
  }
  for (const m of [...s.missions, ...s.archive]) mt(m.template);
  s.speed = 1; // Accept historical saves, but never restore acceleration.
  validateReferences(s, legacy);
  const mapped = legacy ? validateReferences(migrateMap(s)) : s;
  migrateTravel(mapped);
  return mapped;
}
export function validateReferences(s: Save, legacy = false) {
  validateStaffing(s);
  s.completed = Math.max(s.completed, s.archive.length);
  const assignments = s.vehicles.flatMap((v) =>
    v.assignment ? [v.assignment] : [],
  );
  if (new Set(assignments).size !== assignments.length)
    throw Error("Doppelte Fahrzeugzuweisung.");
  for (const b of s.buildings) {
    const t = bt(b.type);
    if (
      legacy
        ? !validLegacySite(b.pos, !!t.water)
        : distance(b.pos, nodes[nearest(b.pos)]) > 1 ||
          (t.water && !isWaterSite(b.pos))
    )
      throw Error("Ungültiger Bauplatz.");
    if (
      s.vehicles.filter((v) => v.home === b.id).length >
        stationCapacity(b).slots ||
      s.people.filter((p) => p.home === b.id).length > stationCapacity(b).people
    )
      throw Error("Wachenkapazität überschritten.");
  }
  for (const v of s.vehicles) {
    if (!v.path.length) throw Error("Fahrzeug ohne Position.");
    if (
      ["travel", "scene", "transport", "alarmed"].includes(v.status) &&
      (!v.mission || !v.assignment)
    )
      throw Error("Aktives Fahrzeug ohne Auftrag.");
    if (v.patients > vt(v.type).capacity || v.arrive < v.depart)
      throw Error("Ungültiger Fahrzeugzustand.");
  }
  for (const m of [...s.missions, ...s.archive]) {
    const t = mt(m.template);
    if (
      m.major &&
      (new Set(m.major.sections.map((x) => x.kind)).size !==
        m.major.sections.length ||
        new Set(m.major.placements.map((x) => x.vehicle)).size !==
          m.major.placements.length ||
        m.major.evacuated > m.major.evacuees)
    )
      throw Error("Ungültige Großlagenzuordnung.");
    if (
      m.progress > t.seconds ||
      m.transports.reduce((n, t) => n + t.patients, 0) >
        (m.dynamics?.active ? m.dynamics.patients.length : t.patients) ||
      new Set(m.contributors).size !== m.contributors.length
    )
      throw Error("Ungültiger Einsatzfortschritt.");
  }
  for (const p of s.people) {
    if (new Set(p.skills).size !== p.skills.length)
      throw Error("Doppelte Ausbildung.");
  }
  for (const bed of s.beds)
    if (
      bed.home !== "public" &&
      !(IS_GERMANY && /^public:(?:node|way|relation):[0-9]+$/.test(bed.home)) &&
      !s.buildings.some((b) => b.id === bed.home && b.type === "hospital")
    )
      throw Error("Patient ohne Krankenhaus.");
  return s;
}
export const achievements = [
  ["Erste Hilfe", 1],
  ["Eingespielt", 5],
  ["Zuverlässig", 10],
  ["Nachtschicht", 25],
  ["Stadtwache", 50],
  ["Region im Griff", 100],
  ["Dauerbereitschaft", 200],
  ["Lebensretter", 10],
  ["Fuhrpark", 10],
  ["Verbundnetz", 8],
  ["Ausbilder", 12],
  ["Ausbauprofi", 5],
] as const;
export function achievementProgress(s: Save, i: number) {
  return i < 7
    ? s.completed
    : i === 7
      ? s.treated
      : i === 8
        ? s.vehicles.length
        : i === 9
          ? new Set(s.buildings.map((b) => b.type)).size
          : i === 10
            ? s.people.filter((p) => p.skills.length).length
            : s.buildings.filter((b) => b.level >= 2).length;
}
