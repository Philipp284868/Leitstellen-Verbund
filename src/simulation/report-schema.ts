import { z } from "zod";
const n = z.number().finite().nonnegative().max(1e12);
const label = z.string().max(100);
export const timingKeys = [
  "reaction",
  "disposition",
  "turnout",
  "travel",
  "recon",
  "work",
  "transport",
  "total",
] as const;
const unit = z
  .object({ id: label, name: label, type: label, meters: n })
  .strict();
export const telemetrySchema = z
  .object({
    since: n,
    partial: z.boolean(),
    meters: n,
    units: z.array(unit).max(500),
    credits: n.nullable().default(null),
    xp: n.nullable().default(null),
    aaos: z
      .array(
        z.object({ id: label, name: label, sufficient: z.boolean() }).strict(),
      )
      .max(100),
  })
  .strict();
export const reportSchema = z
  .object({
    version: z.literal(1),
    at: n,
    partial: z.boolean(),
    timings: z.record(z.enum(timingKeys), n.nullable()),
    calls: n,
    callSeconds: n,
    requests: n,
    falseAlarm: z.boolean(),
    major: z.boolean(),
    patients: z.object({ total: n, delivered: n, dead: n }).strict(),
    units: z.array(unit).max(500),
    meters: n,
    credits: n.nullable(),
    xp: n.nullable(),
    aaos: telemetrySchema.shape.aaos,
  })
  .strict();
export const statisticsSchema = z
  .object({
    since: n,
    completed: n,
    calls: n,
    callSeconds: n,
    requests: n,
    falseAlarms: n,
    major: n,
    delivered: n,
    dead: n,
    credits: n,
    xp: n,
    meters: n,
    timings: z.record(
      z.string().max(20),
      z.object({ sum: n, count: n }).strict(),
    ),
    aaos: z.record(
      z.string().max(104),
      z.object({ name: label, uses: n, sufficient: n }).strict(),
    ),
  })
  .strict()
  .default(() => ({
    since: 0,
    completed: 0,
    calls: 0,
    callSeconds: 0,
    requests: 0,
    falseAlarms: 0,
    major: 0,
    delivered: 0,
    dead: 0,
    credits: 0,
    xp: 0,
    meters: 0,
    timings: {},
    aaos: {},
  }));
export type Report = z.infer<typeof reportSchema>;
