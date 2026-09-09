import { z } from "zod";
const time = z.number().finite().nonnegative();
export const operationalStates = [
  "AVAILABLE",
  "DISPATCHED",
  "EN_ROUTE",
  "ON_SCENE",
  "RETURNING",
  "POST_INCIDENT",
  "MAINTENANCE",
  "UNAVAILABLE",
] as const;
export const availabilitySchema = z
  .object({
    state: z.enum(operationalStates),
    alarmable: z.boolean(),
    dispatchable: z.boolean(),
    reason: z.string().max(250),
    crewPresent: z.number().int().nonnegative(),
    crewRequired: z.number().int().nonnegative(),
    crewCapacity: z.number().int().nonnegative(),
    until: time.optional(),
  })
  .strict();
export const postIncidentSchema = z
  .object({
    mission: z.string().max(100),
    queuedAt: time,
    startedAt: time.optional(),
    until: time.optional(),
    tasks: z
      .array(
        z
          .object({
            kind: z.enum(["cleaning", "disinfection", "refill", "maintenance"]),
            seconds: time.positive(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    current: z.number().int().min(0).max(3),
  })
  .strict()
  .superRefine((work, context) => {
    const invalid = (message: string) =>
      context.addIssue({ code: "custom", message });
    if (work.current >= work.tasks.length)
      invalid("Ungültiger Nachbereitungsschritt.");
    if ((work.startedAt === undefined) !== (work.until === undefined))
      invalid("Beginn und Ende der Nachbereitung müssen gemeinsam vorliegen.");
    if (work.startedAt === undefined && work.current !== 0)
      invalid(
        "Eine noch nicht begonnene Nachbereitung beginnt mit dem ersten Schritt.",
      );
    if (work.startedAt !== undefined && work.until !== undefined) {
      if (work.startedAt < work.queuedAt || work.until < work.startedAt)
        invalid("Ungültige zeitliche Reihenfolge der Nachbereitung.");
      const expected =
        work.startedAt +
        work.tasks
          .slice(0, work.current + 1)
          .reduce((sum, task) => sum + task.seconds, 0);
      if (Math.abs(expected - work.until) > 0.001)
        invalid(
          "Nachbereitungsfrist stimmt nicht mit den vorgesehenen Arbeitsschritten überein.",
        );
    }
  });
export type Availability = z.infer<typeof availabilitySchema>;
