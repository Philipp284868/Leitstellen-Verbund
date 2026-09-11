import { z } from "zod";
const amount = z.number().finite().nonnegative();
export const operatingBillSchema = z
  .object({
    version: z.literal(1),
    nextAt: amount,
    lastAt: amount,
    numerator: amount,
    due: amount.int(),
    paid: amount.int(),
    serial: amount.int(),
  })
  .strict();
export type OperatingBill = z.infer<typeof operatingBillSchema>;
