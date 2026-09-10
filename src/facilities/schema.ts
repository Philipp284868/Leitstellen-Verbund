import { z } from "zod";
const position = z
  .object({ x: z.number().finite(), y: z.number().finite() })
  .strict();
/** A purchased operation pins its validated geography. Catalog refreshes never move live vehicles. */
export const facilityBindingSchema = z
  .object({
    id: z.string().min(1).max(100),
    snapshot: z.string().max(100),
    sources: z.array(z.string().max(180)).min(1).max(100),
    position,
    emergency: z.enum(["yes", "no", "unknown"]),
    subtype: z.string().max(100),
  })
  .strict();
