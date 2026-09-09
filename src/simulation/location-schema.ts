import { z } from "zod";
const point = z
  .object({
    x: z.number().finite().nonnegative(),
    y: z.number().finite().nonnegative(),
  })
  .strict();
export const incidentLocationSchema = z
  .object({
    version: z.literal(1),
    dataset: z.string().min(1).max(150),
    siteRef: z.string().min(1).max(200),
    roadRef: z.string().min(1).max(200),
    kind: z.string().min(1).max(32),
    original: point,
    access: point,
    checkedAt: z.number().finite().nonnegative(),
    station: z.string().min(1).max(100),
    profiles: z.array(z.string().min(1).max(100)).max(100),
    driveSeconds: z.number().finite().nonnegative(),
    state: z.enum(["verified", "repair-pending", "technical-closure"]),
    reason: z.string().max(600),
  })
  .strict();
export type IncidentLocation = z.infer<typeof incidentLocationSchema>;
export const generationLogSchema = z
  .object({
    version: z.literal(1),
    at: z.number().finite(),
    template: z.string().max(100),
    reason: z.string().max(300),
    candidates: z.number().int().nonnegative(),
  })
  .strict();
