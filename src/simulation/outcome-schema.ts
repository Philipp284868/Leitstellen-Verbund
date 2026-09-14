import { z } from "zod";
export const outcomeSchema = z
  .object({
    result: z.enum(["success", "failed", "abandoned"]),
    reason: z.string().min(1).max(600),
    at: z.number().finite().nonnegative(),
    actor: z.string().min(1).max(100),
    trigger: z.enum(["completion", "player", "mandatory-rescue"]),
    settlement: z
      .object({
        state: z.enum(["mobilizing", "on-scene", "accepted"]),
        arrival: z.number().finite().nonnegative(),
        handover: z.number().finite().nonnegative(),
        patients: z.array(z.string().max(100)).max(30),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((outcome, context) => {
    const settlement = outcome.settlement;
    if (outcome.result !== "success" && !settlement)
      context.addIssue({
        code: "custom",
        message:
          "Ein beendeter Auftrag benötigt eine dokumentierte Abwicklung.",
      });
    if (
      settlement &&
      (outcome.result === "success" ||
        settlement.arrival < outcome.at ||
        settlement.handover < settlement.arrival ||
        new Set(settlement.patients).size !== settlement.patients.length)
    )
      context.addIssue({
        code: "custom",
        message: "Abwicklungszeit oder Patientenzuordnung widersprüchlich.",
      });
    if (
      (outcome.result === "success") !== (outcome.trigger === "completion") ||
      (outcome.result === "abandoned") !== (outcome.trigger === "player")
    )
      context.addIssue({
        code: "custom",
        message: "Auslöser und Ergebnis stimmen nicht überein.",
      });
  });
