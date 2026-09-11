import { z } from "zod";
export const maintenanceSchema = z
  .object({
    version: z.literal(1),
    servicedMeters: z.number().finite().nonnegative(),
    services: z.number().int().nonnegative(),
    until: z.number().finite().nonnegative(),
    history: z
      .array(
        z
          .object({
            at: z.number(),
            cost: z.number().int().nonnegative(),
            meters: z.number().nonnegative(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
