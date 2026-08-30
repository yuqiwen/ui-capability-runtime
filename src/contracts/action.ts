import { z } from "zod";
import { identifierSchema, valueExpressionSchema } from "./common.js";

const frameLocatorSchema = z.object({
  name: z.string().min(1).optional(),
  urlPattern: z.string().min(1).optional(),
  index: z.number().int().nonnegative().optional(),
});

const locatorBaseSchema = z.object({
  framePath: z.array(frameLocatorSchema).default([]),
  exact: z.boolean().default(true),
});

export const locatorCandidateSchema = z.discriminatedUnion("strategy", [
  locatorBaseSchema.extend({
    strategy: z.literal("role"),
    role: z.string().min(1),
    name: z.string().min(1),
  }),
  locatorBaseSchema.extend({
    strategy: z.literal("label"),
    label: z.string().min(1),
  }),
  locatorBaseSchema.extend({
    strategy: z.literal("text"),
    text: z.string().min(1),
    withinText: z.string().min(1).optional(),
  }),
  locatorBaseSchema.extend({
    strategy: z.literal("css"),
    selector: z.string().min(1),
  }),
  locatorBaseSchema.extend({
    strategy: z.literal("coordinate"),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    viewportWidth: z.number().positive(),
    viewportHeight: z.number().positive(),
  }),
]);

export type LocatorCandidate = z.infer<typeof locatorCandidateSchema>;

export const targetSchema = z.object({
  description: z.string().min(1),
  candidates: z.array(locatorCandidateSchema).min(1),
  requireUnique: z.boolean().default(true),
});

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), url: valueExpressionSchema }),
  z.object({ type: z.literal("click"), target: targetSchema }),
  z.object({ type: z.literal("type"), target: targetSchema, value: valueExpressionSchema }),
  z.object({ type: z.literal("select"), target: targetSchema, value: valueExpressionSchema }),
  z.object({ type: z.literal("wait"), durationMs: z.number().int().positive().max(10_000) }),
]);

export type Action = z.infer<typeof actionSchema>;

export const conditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url_matches"), pattern: z.string().min(1) }),
  z.object({ type: z.literal("visible"), target: targetSchema }),
  z.object({ type: z.literal("not_visible"), target: targetSchema }),
  z.object({ type: z.literal("text_contains"), target: targetSchema, value: valueExpressionSchema }),
  z.object({ type: z.literal("page_contains"), value: valueExpressionSchema }),
]);

export type Condition = z.infer<typeof conditionSchema>;

export const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(5).default(1),
  backoffMs: z.number().int().nonnegative().max(10_000).default(0),
  retryOn: z.array(z.enum(["timeout", "not_ready", "transient_navigation"])).default([]),
});

export const capabilityStepSchema = z.object({
  id: identifierSchema,
  description: z.string().min(1),
  action: actionSchema,
  preconditions: z.array(conditionSchema).default([]),
  postconditions: z.array(conditionSchema).default([]),
  timeoutMs: z.number().int().positive().max(60_000).default(10_000),
  retry: retryPolicySchema.default({}),
  risk: z.enum(["safe", "sensitive", "irreversible"]).default("safe"),
});

export type CapabilityStep = z.infer<typeof capabilityStepSchema>;

