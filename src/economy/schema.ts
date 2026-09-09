import { z } from "zod";
import { MAX_CENTS } from "../money";
export const centsSchema = z.number().int().finite().min(0).max(MAX_CENTS);
export const signedCentsSchema = z
  .number()
  .int()
  .finite()
  .min(-MAX_CENTS)
  .max(MAX_CENTS);
const time = z.number().finite().nonnegative().max(1e12);
export const economySchema = z
  .object({
    version: z.literal(1),
    currency: z.literal("EUR"),
    unit: z.literal("cent"),
    priceVersion: z.number().int().min(0).max(1),
    migratedAt: time,
    openingBalanceCents: signedCentsSchema,
    compensationCents: centsSchema,
    fundingNextAt: time,
    fundingPaidCents: centsSchema,
  })
  .strict();
export type Economy = z.infer<typeof economySchema>;
export const FUNDING_INTERVAL = 900;
export function newEconomy(now: number, openingBalanceCents: number): Economy {
  return economySchema.parse({
    version: 1,
    currency: "EUR",
    unit: "cent",
    priceVersion: 1,
    migratedAt: now,
    openingBalanceCents,
    compensationCents: 0,
    fundingNextAt: now + FUNDING_INTERVAL,
    fundingPaidCents: 0,
  });
}
