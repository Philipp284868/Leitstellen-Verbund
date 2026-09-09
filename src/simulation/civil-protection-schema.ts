import { z } from "zod";

const id = z.string().min(1).max(100);
const time = z.number().finite().nonnegative().max(1e12);
export const civilProtectionSchema = z
  .object({
    enabled: z.boolean(),
    preparation: z.number().int().min(60).max(1800),
    state: z.enum(["inactive", "mobilizing", "ready"]),
    readyAt: time,
    history: z
      .array(
        z
          .object({
            at: time,
            actor: id,
            text: z.string().min(1).max(300),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();

export const civilProtectionActions = [
  z
    .object({
      type: z.literal("civil-station"),
      home: id,
      enabled: z.boolean(),
      preparation: civilProtectionSchema.shape.preparation,
    })
    .strict(),
  z
    .object({
      type: z.literal("civil-readiness"),
      homes: z.array(id).min(1).max(150),
      op: z.enum(["mobilize", "stand-down"]),
    })
    .strict(),
] as const;
export type CivilProtectionAction = z.infer<
  (typeof civilProtectionActions)[number]
>;
