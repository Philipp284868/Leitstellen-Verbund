import { z } from "zod";
const id = z.string().min(1).max(100);
const seconds = z.number().finite().nonnegative().max(1e12);
export const stationKinds = {
  bf: "Berufsfeuerwehr",
  ff: "Freiwillige Feuerwehr",
  works: "Werkfeuerwehr",
  company: "Betriebsfeuerwehr",
  airport: "Flughafenfeuerwehr",
  ems: "Rettungsdienst",
  police: "Polizei",
  thw: "THW",
  water: "Wasserrettung",
};
export const stationSchema = z
  .object({
    kind: z.enum([
      "bf",
      "ff",
      "works",
      "company",
      "airport",
      "ems",
      "police",
      "thw",
      "water",
    ]),
    turnout: z.number().int().min(10).max(600),
    crew: z.enum(["minimum", "normal", "full"]),
    reserve: z.number().int().min(0).max(20),
  })
  .strict();
export const dutySchema = z
  .object({
    name: z.string().trim().min(1).max(48),
    role: z.enum(["crew", "driver", "leader"]),
    shift: z.enum(["24h", "day", "late", "night", "A", "B", "C"]),
    absence: z.enum([
      "none",
      "vacation",
      "ill",
      "training",
      "unreachable",
      "asleep",
      "unavailable",
    ]),
    until: seconds,
    reachability: z.number().int().min(0).max(100),
    homeNode: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    workNode: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    commute: z.enum(["car", "bicycle", "walk"]),
    workdays: z.boolean(),
    standby: z.boolean(),
    load: seconds,
  })
  .strict();
export const turnoutSchema = z
  .object({
    started: seconds,
    minimum: z.number().int().min(1).max(30),
    arrivals: z
      .array(
        z
          .object({
            person: id,
            at: seconds,
            available: z.boolean(),
            reason: z.string().max(120),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
export const specialties = {
  general: "Notaufnahme",
  trauma: "Chirurgie / Schockraum",
  intensive: "Intensivmedizin",
  pediatric: "Kinderheilkunde",
  burns: "Brandverletzungen",
};
export const hospitalSchema = z
  .object({
    open: z.boolean(),
    specialties: z
      .array(z.enum(["general", "trauma", "intensive", "pediatric", "burns"]))
      .min(1)
      .max(5),
    capacity: z.number().int().min(1).max(200),
  })
  .strict();
export const taskNames = {
  secure: "Polizei: Einsatzstelle sichern",
  investigate: "Polizei: Ermittlungen / Fahndung",
  shore: "THW: Abstützen und Bergen",
  power: "THW: Strom und Beleuchtung",
  pump: "THW: Pumpen und Logistik",
  triage: "Rettungsdienst: Sichtung und Versorgung koordinieren",
};
export const organizationMissionSchema = z
  .object({
    tasks: z
      .array(
        z
          .object({
            kind: z.enum([
              "secure",
              "investigate",
              "shore",
              "power",
              "pump",
              "triage",
            ]),
            ordered: z.boolean(),
            progress: seconds,
            seconds: seconds,
            done: z.boolean(),
          })
          .strict(),
      )
      .max(6),
    hospital: id.optional(),
  })
  .strict();
export const requestStates = {
  DRAFT: "Entwurf",
  SENT: "Gesendet",
  ACCEPTED: "Angenommen",
  DECLINED: "Abgelehnt",
  IN_PROGRESS: "In Durchführung",
  DONE: "Abgeschlossen",
  CANCELLED: "Zurückgezogen",
};
export const aidSchema = z
  .object({
    id,
    owner: id,
    peer: id,
    mission: id,
    round: id,
    state: z.enum([
      "DRAFT",
      "SENT",
      "ACCEPTED",
      "DECLINED",
      "IN_PROGRESS",
      "DONE",
      "CANCELLED",
    ]),
    priority: z.enum(["NORMAL", "DRINGEND", "PRIORITÄT", "NOTFALL"]),
    types: z.array(id).min(1).max(20),
    message: z.string().trim().min(1).max(1000),
    created: seconds,
    updated: seconds,
    assignments: z
      .array(
        z
          .object({
            vehicle: id,
            assignment: id,
            type: id,
            lastFms: id.optional(),
            radio: z.boolean().optional(),
          })
          .strict(),
      )
      .max(20),
    messages: z
      .array(
        z
          .object({
            actor: id,
            name: z.string().max(100),
            at: seconds,
            text: z.string().max(1000),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type AidRequest = z.infer<typeof aidSchema>;
export type Station = z.infer<typeof stationSchema>;
export type Duty = z.infer<typeof dutySchema>;
export type TaskKind = keyof typeof taskNames;
export const organizationActions = [
  z
    .object({
      type: z.literal("station-profile"),
      home: id,
      profile: stationSchema,
    })
    .strict(),
  z
    .object({ type: z.literal("person-duty"), person: id, duty: dutySchema })
    .strict(),
  z.object({ type: z.literal("crew-transfer"), from: id, to: id }).strict(),
  z
    .object({
      type: z.literal("vehicle-reserve"),
      vehicle: id,
      reserve: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("hospital-profile"),
      home: id,
      profile: hospitalSchema,
    })
    .strict(),
  z
    .object({ type: z.literal("hospital-select"), mission: id, home: id })
    .strict(),
  z
    .object({
      type: z.literal("organization-task"),
      mission: id,
      task: z.enum([
        "secure",
        "investigate",
        "shore",
        "power",
        "pump",
        "triage",
      ]),
    })
    .strict(),
] as const;
export const aidActions = [
  z
    .object({
      type: z.literal("aid-draft"),
      peer: id,
      mission: id,
      types: z.array(id).min(1).max(20),
      priority: aidSchema.shape.priority,
      message: aidSchema.shape.message,
    })
    .strict(),
  z.object({ type: z.literal("aid-send"), id }).strict(),
  z
    .object({
      type: z.literal("aid-accept"),
      owner: id,
      id,
      vehicles: z.array(id).min(1).max(20),
    })
    .strict(),
  z
    .object({
      type: z.literal("aid-message"),
      owner: id,
      id,
      text: z.string().trim().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal("aid-close"),
      owner: id,
      id,
      op: z.enum(["decline", "cancel", "done"]),
    })
    .strict(),
] as const;
export type OrganizationAction = z.infer<(typeof organizationActions)[number]>;
export type AidAction = z.infer<(typeof aidActions)[number]>;
