import { z } from "zod";
import { identifierSchema } from "./common.js";

export const runtimePolicySchema = z.object({
  id: identifierSchema,
  allowedOrigins: z.array(z.string().url()).min(1),
  allowedRoutePatterns: z.array(z.string().min(1)).min(1),
  allowedActionTypes: z.array(z.enum(["navigate", "click", "type", "select", "wait"])).min(1),
  maximumAutomatedRisk: z.enum(["safe", "sensitive"]),
  redactInputNames: z.array(identifierSchema).default([]),
  blockedTargetTextPatterns: z.array(z.string().min(1)).default([]),
});

export type RuntimePolicy = z.infer<typeof runtimePolicySchema>;
