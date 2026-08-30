import { z } from "zod";
import { evidenceReferenceSchema, identifierSchema, jsonPrimitiveSchema } from "./common.js";

export const runResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    runId: identifierSchema,
    outputs: z.record(jsonPrimitiveSchema),
    evidence: z.array(evidenceReferenceSchema).default([]),
  }),
  z.object({
    status: z.literal("business_outcome"),
    runId: identifierSchema,
    code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
    details: z.record(jsonPrimitiveSchema).default({}),
    evidence: z.array(evidenceReferenceSchema).default([]),
  }),
  z.object({
    status: z.literal("escalated"),
    runId: identifierSchema,
    interventionId: identifierSchema,
    reason: z.string().min(1),
    stepId: identifierSchema.optional(),
    evidence: z.array(evidenceReferenceSchema).default([]),
  }),
  z.object({
    status: z.literal("failure"),
    runId: identifierSchema,
    category: z.enum([
      "invalid_input",
      "policy_blocked",
      "target_mismatch",
      "locator_not_found",
      "locator_ambiguous",
      "timeout",
      "checkpoint_failed",
      "surface_error",
    ]),
    stepId: identifierSchema.optional(),
    expected: z.string().min(1),
    observed: z.string().min(1),
    retryable: z.boolean(),
    evidence: z.array(evidenceReferenceSchema).default([]),
  }),
]);

export type RunResult = z.infer<typeof runResultSchema>;

