import { z } from "zod";

const time = z.number().finite().nonnegative();
export const missionTaskStateSchema = z
  .object({
    version: z.literal(1),
    initializedAt: time,
    entries: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            skill: z.string().min(1).max(40),
            required: z.number().finite().positive().max(50000),
            progress: time.max(86400),
            seconds: time.positive().max(86400),
            done: z.boolean(),
            completedAt: time,
          })
          .strict(),
      )
      .max(96),
  })
  .strict();
export type MissionTaskState = z.infer<typeof missionTaskStateSchema>;
