import { z } from "zod";
const id = z.string().min(1).max(100);
const time = z.number().finite().nonnegative();
export const majorKinds = ["manv", "storm", "flood", "fire", "crowd"] as const;
export const majorNames = {
  manv: "MANV",
  storm: "Unwetterlage",
  flood: "Hochwasser / Katastrophenschutz",
  fire: "Großbrand",
  crowd: "Massenereignis",
};
export const sectionNames = {
  command: "Einsatzleitung",
  fire: "Brandbekämpfung",
  rescue: "Menschenrettung",
  water: "Wasserversorgung",
  medical: "Behandlung / Transport",
  security: "Absicherung / Besucherlenkung",
  technical: "Technische Hilfe",
  logistics: "Versorgung / Notstrom",
  evacuation: "Evakuierung / Betreuung",
  staging: "Bereitstellungsraum",
};
export const sectionKinds = [
  "command",
  "fire",
  "rescue",
  "water",
  "medical",
  "security",
  "technical",
  "logistics",
  "evacuation",
  "staging",
] as const;
export const sectionSchema = z
  .object({
    kind: z.enum(sectionKinds),
    ordered: z.boolean(),
    progress: time.max(600),
    seconds: time.max(600),
    priority: z.number().int().min(1).max(3),
    done: z.boolean(),
    leader: z.object({ vehicle: id, assignment: id }).strict().optional(),
  })
  .strict();
export const majorSchema = z
  .object({
    kind: z.enum(majorKinds),
    declared: time,
    level: z.number().int().min(1).max(3),
    sections: z.array(sectionSchema).max(10),
    placements: z
      .array(
        z
          .object({
            vehicle: id,
            assignment: id,
            section: z.enum(sectionKinds),
          })
          .strict(),
      )
      .max(100),
    transports: z.boolean(),
    evacuated: time.max(5000),
    evacuees: z.number().int().min(0).max(5000),
    water: time.max(20000),
    demand: time.max(1000),
    shortage: z.string().max(300),
    // Hidden future scenario state is stripped from regular client snapshots.
    pending: z
      .object({
        next: time,
        remaining: z.number().int().min(0).max(3),
        batch: z.number().int().min(0).max(10),
      })
      .strict()
      .optional(),
    campaign: z.string().max(100),
  })
  .strict();
export const campaignSchema = z
  .object({
    id,
    kind: z.enum(majorKinds),
    started: time,
    next: time,
    remaining: z.number().int().min(0).max(5),
    missions: z.array(id).max(6),
    closed: time,
  })
  .strict();
export const operationsSchema = z
  .object({
    cooldown: time,
    campaign: campaignSchema.optional(),
    history: z.array(campaignSchema).max(30).default([]),
  })
  .strict()
  .default({ cooldown: 0, history: [] });
export const majorActions = [
  z
    .object({
      type: z.literal("major-leader"),
      mission: id,
      section: z.enum(sectionKinds),
      vehicle: z.string().max(100),
    })
    .strict(),
  z.object({ type: z.literal("major-declare"), mission: id }).strict(),
  z
    .object({
      type: z.literal("major-section"),
      mission: id,
      section: z.enum(sectionKinds),
      priority: z.number().int().min(1).max(3),
    })
    .strict(),
  z
    .object({
      type: z.literal("major-assign"),
      mission: id,
      vehicle: id,
      section: z.enum(sectionKinds),
    })
    .strict(),
  z
    .object({
      type: z.literal("major-transports"),
      mission: id,
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("major-triage"),
      mission: id,
      patient: id,
      category: z.enum(["I", "II", "III"]),
      hospital: z.string().max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal("mission-priority"),
      mission: id,
      priority: z.enum(["NORMAL", "DRINGEND", "PRIORITÄT", "NOTFALL"]),
    })
    .strict(),
] as const;
export type MajorAction = z.infer<(typeof majorActions)[number]>;
export type SectionKind = (typeof sectionKinds)[number];
