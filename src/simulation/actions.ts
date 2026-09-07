import { z } from "zod";
import { aaoSchema, alarmSchema, prioritySchema, orgSchema } from "./schema";
const id = z.string().min(1).max(100);
export const deskActions = [
  z
    .object({
      type: z.literal("call"),
      mission: id,
      call: id,
      op: z.enum(["accept", "ask", "end", "callback"]),
      question: z
        .enum(["address", "report", "people", "hazard", "detail", "calm"])
        .optional(),
    })
    .strict(),
  z.object({ type: z.literal("aao-save"), aao: aaoSchema }).strict(),
  z.object({ type: z.literal("aao-delete"), id }).strict(),
  z.object({ type: z.literal("aao-propose"), mission: id, aao: id }).strict(),
  z
    .object({
      type: z.literal("alarm-profile"),
      home: id,
      profile: alarmSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("radio"),
      mission: id,
      id,
      op: z.enum(["report", "request", "question", "close"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("fms"),
      vehicle: id,
      code: z.number().int().min(0).max(9),
      reason: z.string().trim().min(3).max(180),
    })
    .strict(),
  z
    .object({
      type: z.literal("fms-definitions"),
      org: orgSchema,
      labels: z.array(z.string().trim().min(1).max(100)).length(10),
    })
    .strict(),
  z
    .object({
      type: z.literal("member-invite"),
      username: z.string().min(3).max(48),
    })
    .strict(),
  z.object({ type: z.literal("member-accept"), owner: id }).strict(),
  z.object({ type: z.literal("member-remove"), user: id }).strict(),
] as const;
export const dispatchOptions = {
  priority: prioritySchema.optional(),
  alarm: alarmSchema.optional(),
};
export type DeskAction = z.infer<(typeof deskActions)[number]>;
