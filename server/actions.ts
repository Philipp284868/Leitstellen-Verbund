import { civilProtectionActions } from "../src/simulation/civil-protection-schema";
import { majorActions } from "../src/simulation/major-schema";
import {
  organizationActions,
  aidActions,
} from "../src/simulation/organizations-schema";
import { deskActions, dispatchOptions } from "../src/simulation/actions";
import { z } from "zod";
import { point } from "../src/model";
const id = z.string().min(1).max(100),
  name = z.string().trim().min(1).max(48);
export const actionSchema = z.discriminatedUnion("type", [
  ...civilProtectionActions,
  ...majorActions,
  ...deskActions,
  ...organizationActions,
  ...aidActions,
  z.object({ type: z.literal("build"), kind: id, pos: point }).strict(),
  z.object({ type: z.literal("purchase-facility"), facility: id }).strict(),
  z.object({ type: z.literal("buy"), kind: id, home: id }).strict(),
  z
    .object({
      type: z.literal("hire"),
      home: id,
      count: z.number().int().min(1).max(30),
    })
    .strict(),
  ...(["assign", "unassign"] as const).map((type) =>
    z.object({ type: z.literal(type), vehicle: id }).strict(),
  ),
  z.object({ type: z.literal("dismiss"), person: id }).strict(),
  z.object({ type: z.literal("relief") }).strict(),
  z.object({ type: z.literal("extension"), id, kind: id }).strict(),
  z.object({ type: z.literal("train"), person: id, skill: id }).strict(),
  ...(
    ["upgrade", "sell", "recall", "favorite", "share", "unshare"] as const
  ).map((type) => z.object({ type: z.literal(type), id }).strict()),
  z.object({ type: z.literal("rename"), id, name }).strict(),
  z.object({ type: z.literal("move"), id, home: id }).strict(),
  z
    .object({
      ...dispatchOptions,
      type: z.literal("dispatch"),
      mission: id,
      vehicles: z.array(id).min(1).max(30),
    })
    .strict(),
  z
    .object({
      type: z.literal("support"),
      peer: id,
      mission: id,
      round: id,
      vehicle: id,
    })
    .strict(),
  z
    .object({
      type: z.literal("settings"),
      light: z.boolean(),
      reduced: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("template"),
      name,
      types: z.array(id).min(1).max(30),
    })
    .strict(),
]);
export const commandSchema = z
  .object({ id: z.uuid(), action: actionSchema })
  .strict();
export type ServerAction = z.infer<typeof actionSchema>;
