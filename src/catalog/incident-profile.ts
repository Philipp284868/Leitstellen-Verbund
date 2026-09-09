import { z } from "zod";

export const incidentFamilies = [
  "small-fire",
  "vehicle-fire",
  "vegetation",
  "structure-fire",
  "industry-fire",
  "technical",
  "collapse",
  "traffic",
  "hazmat",
  "water-rescue",
  "flood",
  "medical",
  "police",
  "crowd",
  "supply",
] as const;
export const incidentProfileSchema = z
  .object({
    version: z.literal(1),
    topic: z.string().max(100),
    family: z.enum(incidentFamilies),
    variant: z.enum(["reported", "access", "extended"]),
    site: z.enum([
      "street",
      "residential",
      "commercial",
      "industrial",
      "forest",
      "field",
      "rail",
      "public",
      "water",
      "construction",
    ]),
    tags: z.array(z.string().max(40)).max(30),
    severity: z.number().int().min(1).max(3),
    requirements: z.record(z.string().max(40), z.number().int().min(1).max(30)),
    patientCount: z.number().int().min(0).max(30),
    patient: z
      .object({
        health: z.number().min(1).max(100),
        ageMin: z.number().int().min(0).max(100),
        ageMax: z.number().int().min(0).max(100),
        bloodLoss: z.number().min(0).max(100),
        temperature: z.number().min(25).max(43),
        care: z.enum(["standard", "oxygen", "bleeding", "cpr", "temperature"]),
        intensive: z.boolean(),
        deterioration: z.number().min(0).max(0.2).default(0.025),
        initialPain: z.number().min(0).max(10).default(3),
      })
      .strict(),
    hazards: z
      .array(
        z
          .object({
            kind: z.string().max(30),
            skill: z.string().max(40),
            initial: z.number().min(0).max(100),
            growth: z.number().min(0).max(2),
            required: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .max(12),
    fire: z
      .object({
        fuel: z.string().max(40),
        indoor: z.boolean(),
        area: z.number().min(1).max(100000),
        sections: z.array(z.string().max(80)).max(8),
      })
      .strict()
      .optional(),
    observations: z.array(z.string().max(500)).min(2).max(6),
    people: z.string().max(500),
    major: z.enum(["manv", "storm", "flood", "fire", "crowd"]).optional(),
    followups: z
      .array(
        z
          .object({
            template: z.string().max(100),
            trigger: z.string().max(30),
            threshold: z.number().min(0).max(100),
            delay: z.number().int().min(30).max(1800),
          })
          .strict(),
      )
      .max(3),
    bystander: z.boolean(),
  })
  .strict();
export type IncidentProfile = z.infer<typeof incidentProfileSchema>;
export type IncidentFamily = IncidentProfile["family"];

/** Public context only: routing decides whether a concrete geographic location is usable. */
export function incidentSiteKind(
  profile: IncidentProfile | undefined,
): "road" | "settlement" | "shoreaccess" {
  if (profile?.site === "water") return "shoreaccess";
  return profile &&
    ["residential", "commercial", "public", "industrial"].includes(profile.site)
    ? "settlement"
    : "road";
}
