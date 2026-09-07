import { z } from "zod";
const id = z.string().min(1).max(100),
  text = z.string().max(600),
  time = z.number().finite().nonnegative();
export const alarmSchema = z.enum(["dme", "siren", "station"]);
export const prioritySchema = z.enum([
  "NORMAL",
  "DRINGEND",
  "PRIORITÄT",
  "NOTFALL",
]);
export const orgSchema = z.enum([
  "Alle",
  "Feuerwehr",
  "Rettungsdienst",
  "Polizei",
  "THW",
  "Wasserrettung",
  "Infrastruktur",
]);
export const eventSchema = z
  .object({
    id,
    at: time,
    type: id,
    text,
    actor: id,
    vehicle: z.string().max(100),
    alarm: alarmSchema.optional(),
    assignment: id.optional(),
  })
  .strict();
export const callSchema = z
  .object({
    id,
    state: z.enum(["ringing", "active", "dropped", "ended"]),
    actor: z.string().max(100),
    created: time,
    started: time,
    ended: time,
    duration: time.default(0),
    stress: z.number().int().min(0).max(100),
    quality: z.number().int().min(0).max(100),
    credibility: z.number().int().min(0).max(100),
    callback: z.boolean(),
    asked: z.array(id).max(12),
    nextAnswer: time,
    caller: z.string().max(80),
    noise: z.string().max(100),
  })
  .strict();
export const incidentSchema = z
  .object({
    stage: z.enum([
      "incoming",
      "interview",
      "disposition",
      "alarming",
      "enroute",
      "recon",
      "working",
      "transport",
      "closed",
    ]),
    priority: prioritySchema.default("NORMAL"),
    legacy: z.boolean(),
    locationKnown: z.boolean(),
    reportedTemplate: z.string().max(100),
    briefed: z.boolean(),
    firstArrival: z.string().max(100),
    deficit: z.string().max(600).optional(),
    facts: z
      .array(
        z
          .object({
            key: id,
            text,
            source: id,
            confidence: z.enum(["bestätigt", "unbestätigt", "widersprüchlich"]),
          })
          .strict(),
      )
      .max(80),
    calls: z.array(callSchema).max(4),
    radio: z
      .array(
        z
          .object({
            id,
            vehicle: id,
            reason: z.enum(["arrival", "request", "question"]),
            priority: prioritySchema,
            state: z.enum(["open", "handled"]),
            created: time,
            answered: time,
            questioned: z.boolean().optional(),
            details: text,
          })
          .strict(),
      )
      .max(60),
    events: z.array(eventSchema).max(20000),
    proposal: z
      .object({
        id,
        aao: id,
        vehicles: z.array(id).max(30),
        missing: z.array(text).max(60),
        at: time,
      })
      .strict()
      .optional(),
    secret: z
      .object({
        seed: z.number().int().nonnegative(),
        report: id,
        address: text,
        people: text,
        hazard: text,
        detail: text,
        secondaryAt: time,
        dropAt: time,
        dropCall: z.string().default(""),
      })
      .strict()
      .optional(),
  })
  .strict();
export const aaoSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(60),
    keyword: z.string().trim().min(1).max(60),
    level: z.number().int().min(1).max(5),
    org: orgSchema,
    types: z.array(id).min(1).max(30),
    skills: z.record(z.string().max(40), z.number().int().min(1).max(50)),
    priority: prioritySchema,
    alarm: alarmSchema,
  })
  .strict();
export const deskSchema = z
  .object({
    sequence: z.number().int().nonnegative().max(1e12),
    aaos: z.array(aaoSchema).max(30),
    alarms: z.record(id, alarmSchema),
    definitions: z.partialRecord(
      orgSchema,
      z.array(z.string().trim().min(1).max(100)).length(10),
    ),
    fleet: z.record(
      id,
      z
        .object({
          code: z.number().int().min(0).max(9),
          changed: time,
          operative: z.string().max(20),
          channel: z.string().max(80),
          history: z.array(eventSchema).max(2000),
        })
        .strict(),
    ),
  })
  .strict()
  .default(() => ({
    sequence: 0,
    aaos: [],
    alarms: {},
    definitions: {},
    fleet: {},
  }));
export type Incident = z.infer<typeof incidentSchema>;
export type AAO = z.infer<typeof aaoSchema>;
export type Alarm = z.infer<typeof alarmSchema>;
export type Priority = z.infer<typeof prioritySchema>;
