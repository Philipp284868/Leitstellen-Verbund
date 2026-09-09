import { z } from "zod";

const time = z.number().finite().nonnegative();
const state = z.enum(["queued", "transmitting", "delivered", "missed"]);
export const transmissionSchema = z
  .object({
    id: z.string().min(1).max(150),
    sequence: time.int(),
    channel: z.string().min(1).max(100),
    sender: z.string().min(1).max(100),
    vehicle: z.string().max(100),
    mission: z.string().max(100),
    text: z.string().min(1).max(600),
    priority: z.number().int().min(0).max(100),
    created: time,
    seconds: z.number().min(2).max(30),
    state,
    started: time.optional(),
    ends: time.optional(),
    interrupted: z.boolean(),
    history: z
      .array(
        z.object({ at: time, state, reason: z.string().max(120) }).strict(),
      )
      .max(8),
  })
  .strict();
export const radioNetworkSchema = z
  .object({
    version: z.literal(1),
    sequence: time.int(),
    entries: z.array(transmissionSchema).max(2000),
  })
  .strict()
  .superRefine((network, ctx) => {
    const ids = new Set<string>(),
      active = new Set<string>();
    for (const entry of network.entries) {
      if (
        ids.has(entry.id) ||
        (entry.state === "transmitting" &&
          (active.has(entry.channel) ||
            entry.started === undefined ||
            entry.ends === undefined))
      )
        ctx.addIssue({
          code: "custom",
          message: "Ungültige Funkreihenfolge oder doppelte Übertragung.",
        });
      ids.add(entry.id);
      if (entry.state === "transmitting") active.add(entry.channel);
    }
  });
export type Transmission = z.infer<typeof transmissionSchema>;
