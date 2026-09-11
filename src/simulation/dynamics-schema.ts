import { z } from "zod";
import { incidentProfileSchema } from "../catalog/incident-profile";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../germany/projection";
const time = z.number().finite().nonnegative();
const value = z.number().finite().min(0).max(100);
const id = z.string().min(1).max(100);
const point = z
  .object({ x: time.max(WORLD_WIDTH), y: time.max(WORLD_HEIGHT) })
  .strict();
export const weatherKinds = [
  "sun",
  "cloud",
  "rain",
  "heavy-rain",
  "storm",
  "gale",
  "hurricane",
  "fog",
  "snow",
  "ice",
  "heat",
  "frost",
] as const;
export const roadEventSchema = z
  .object({
    id,
    kind: z.enum([
      "jam",
      "construction",
      "accident",
      "closure",
      "obstacle",
      "crossing",
      "flood",
    ]),
    edge: z.tuple([
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
    ]),
    roadId: id.optional(),
    roadName: z.string().max(256).optional(),
    position: point.optional(),
    start: time,
    until: time,
    delay: time.max(900),
    blocked: z.boolean(),
  })
  .strict();
export const environmentSchema = z
  .object({
    version: z.literal(1),
    period: z.number().int(),
    kind: z.enum(weatherKinds),
    temperature: z.number().finite().min(-30).max(50),
    wind: time.max(180),
    rain: value,
    visibility: time.max(30000),
    density: z.number().min(0).max(2),
    roads: z.array(roadEventSchema).max(12),
  })
  .strict();
export const journeySchema = z
  .object({
    motion: z
      .array(
        z
          .object({
            from: point,
            to: point,
            meters: time,
            limit: time.positive(),
            edge: id,
            start: time,
            duration: time,
            velocity: time,
            acceleration: z.number().finite(),
            offset: time,
            traveled: time,
          })
          .strict(),
      )
      .max(600000)
      .optional(),
    motionVersion: z.literal(1).optional(),
    wait: time.optional(),
    mode: z.enum(["normal", "priority", "emergency"]),
    planned: z.array(point).max(200000),
    plannedSeconds: time,
    delay: time,
    distanceDone: time,
    events: z.array(id).max(60),
    nextCheck: time,
    serial: z.number().int().nonnegative(),
    target: point,
    blockedUntil: time,
    reason: z.string().max(180),
  })
  .strict();
export const faultSchema = z
  .object({
    kind: z.enum([
      "engine",
      "tire",
      "technical",
      "radio",
      "equipment",
      "energy",
      "accident",
    ]),
    since: time,
    repairAt: time,
    state: z.enum(["awaiting", "repairing", "repaired"]),
    mission: z.string().max(100),
    assignment: z.string().max(100),
    position: point,
  })
  .strict();
export const hazardKinds = [
  "fire",
  "smoke",
  "heat",
  "collapse",
  "electricity",
  "gas",
  "hazmat",
  "water",
  "traffic",
  "violence",
  "crowd",
  "weather",
  "visibility",
  "darkness",
  "technical",
  "fuel",
  "uncertainty",
  "contamination",
  "security",
  "exposure",
] as const;
export const hazardSchema = z
  .object({
    kind: z.enum(hazardKinds),
    initial: value,
    value,
    growth: z.number().finite().min(0).max(2),
    reduction: z.number().finite().min(0).max(5),
    threshold: value,
    skill: id,
    required: z.number().int().min(1).max(20),
    resolved: z.boolean(),
  })
  .strict();
export const fireSchema = z
  .object({
    extinguishedAt: time.optional(),
    previousIntensity: value.optional(),
    trend: z.enum(["rising", "steady", "falling"]).optional(),
    fuel: id,
    area: time.max(100000),
    temperature: time.max(1600),
    smoke: value,
    intensity: value,
    spread: time.max(20),
    explosion: value,
    suppression: value,
    sections: z
      .array(
        z
          .object({
            name: z.string().max(80),
            burning: value,
            damage: value,
            smoke: value,
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
export const patientSchema = z
  .object({
    triage: z.enum(["I", "II", "III"]).optional(),
    hospital: z.string().max(100).optional(),
    id,
    age: z.number().int().min(0).max(100),
    sex: z.enum(["weiblich", "männlich", "divers"]),
    condition: z.enum([
      "stable",
      "deteriorating",
      "critical",
      "cpr",
      "recovering",
      "dead",
    ]),
    health: value,
    consciousness: z.enum(["wach", "eingetrübt", "bewusstlos"]),
    breathing: time.max(60),
    pulse: time.max(220),
    systolic: time.max(220),
    oxygen: value,
    temperature: z.number().min(25).max(43),
    pain: z.number().min(0).max(10),
    bloodLoss: value,
    injury: z.string().max(100),
    treatment: value,
    prognosis: value,
    priority: z.enum(["normal", "urgent"]),
    care: z.enum(["standard", "oxygen", "bleeding", "cpr", "temperature"]),
    cprCycles: z.number().int().min(0).max(6),
    nextCpr: time,
    transport: z.enum(["scene", "aboard", "delivered", "none"]),
    vehicle: z.string().max(100),
    transportOrder: id.optional(),
    deliveredAt: time.optional(),
    history: z
      .array(z.object({ at: time, text: z.string().max(180) }).strict())
      .max(100),
  })
  .strict();
export const dynamicsSchema = z
  .object({
    version: z.literal(1),
    active: z.boolean(),
    scenario: incidentProfileSchema.optional(),
    responders: z
      .array(
        z
          .object({
            person: id,
            vehicle: id,
            assignment: id.optional(),
            state: z.enum([
              "NORMAL",
              "BELASTET",
              "GEFÄHRDET",
              "VERLETZT",
              "SCHWER_VERLETZT",
              "EINGESCHLOSSEN",
              "VERMISST",
              "BEWUSSTLOS",
            ]),
            since: time,
            patient: z.string().max(100),
          })
          .strict(),
      )
      .optional(),
    bystanderChecked: z.boolean().optional(),
    last: time,
    state: z.enum([
      "developing",
      "escalating",
      "critical",
      "stabilizing",
      "aftermath",
      "resolved",
    ]),
    level: z.number().int().min(1).max(4),
    tactic: z.enum(["standard", "defensive", "rescue"]),
    hazards: z.array(hazardSchema).max(32),
    fire: fireSchema.optional(),
    patients: z.array(patientSchema).max(30),
    extra: z.record(id, z.number().int().min(0).max(20)),
    events: z.array(id).max(40),
    nextEvent: time,
    eventChecks: z.number().int().nonnegative().default(0),
    aftermath: time,
    parent: z.string().max(100),
    children: z.array(id).max(2),
    pending: z.object({ template: id, due: time }).strict().optional(),
    random: z.number().int().nonnegative().optional(),
    weatherAtCall: z.string().max(100),
  })
  .strict();
export type Dynamics = z.infer<typeof dynamicsSchema>;
export type Hazard = z.infer<typeof hazardSchema>;
export type Patient = z.infer<typeof patientSchema>;
export type TravelMode = z.infer<typeof journeySchema>["mode"];
