import { z } from "zod";
const amount = z.number().finite().nonnegative();
const position = z.object({ x: amount, y: amount }).strict();
export const waterSourceSchema = z
  .object({
    usable: z.boolean().optional(),
    reason: z.string().max(300).optional(),
    id: z.string().min(1).max(160),
    pos: position,
    access: position,
    kind: z.enum(["hydrant", "open-water"]),
    origin: z.enum(["openstreetmap", "simulation-v1"]),
    snapshot: z.string().max(100),
    dataset: z.string().max(100),
    area: z.enum([
      "center",
      "residential",
      "industrial",
      "village",
      "farm",
      "unbuilt",
      "unknown",
    ]),
    flowLpm: amount.max(20000),
    flowSource: z.literal("simulation-v1"),
    properties: z.record(z.string().max(100), z.string().max(250)),
    quality: z.array(z.string().max(300)).max(8),
  })
  .strict();
export const waterTripSchema = z
  .object({
    stage: z.enum(["queued", "outbound", "refilling", "inbound"]),
    target: z.object({ x: amount, y: amount }).strict(),
    readyAt: amount,
    source: waterSourceSchema.optional(),
    last: amount.optional(),
  })
  .strict();
export const waterSupplySchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    source: z.enum(["tank", "hydrant", "open-water", "shuttle"]),
    hoseB: amount,
    hoseC: amount,
    flow: amount,
    consumed: amount,
    shortage: z.string().max(300),
    last: amount,
    connection: z
      .object({
        source: waterSourceSchema,
        path: z.array(position).max(20000),
        meters: amount,
      })
      .strict()
      .optional(),
    refillSource: waterSourceSchema.optional(),
    setupUntil: amount.optional(),
    checkedAt: amount.optional(),
    manual: z.boolean().optional(),
    flowLpm: amount.optional(),
  })
  .strict();
