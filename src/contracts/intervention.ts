import { z } from "zod";
import { evidenceReferenceSchema, identifierSchema } from "./common.js";

export const controllerSchema = z.enum(["automation", "human", "none"]);

export const interventionRequestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  id: identifierSchema,
  runId: identifierSchema,
  capabilityId: identifierSchema.optional(),
  goal: z.string().min(1),
  status: z.enum(["requested", "human_active", "resume_requested", "resolved", "aborted"]),
  controller: controllerSchema,
  reason: z.string().min(1),
  stepId: identifierSchema.optional(),
  requestedAt: z.string().datetime(),
  evidence: z.array(evidenceReferenceSchema).min(1),
  resumeCheckpointDescription: z.string().min(1),
});

export type InterventionRequest = z.infer<typeof interventionRequestSchema>;

