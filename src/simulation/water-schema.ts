import { z } from "zod";
const amount = z.number().finite().nonnegative();
export const waterTripSchema = z
  .object({
    stage: z.enum(["queued", "outbound", "refilling", "inbound"]),
    target: z.object({ x: amount, y: amount }).strict(),
    readyAt: amount,
  })
  .strict();
export const waterSupplySchema = z
  .object({
    version: z.literal(1),
    source: z.enum(["tank", "hydrant", "open-water", "shuttle"]),
    hoseB: amount,
    hoseC: amount,
    flow: amount,
    consumed: amount,
    shortage: z.string().max(300),
    last: amount,
  })
  .strict();
