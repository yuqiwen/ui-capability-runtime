import { z } from "zod";
import { actionSchema, capabilityStepSchema, conditionSchema, targetSchema } from "./action.js";
import { identifierSchema } from "./common.js";

const inputTypeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("string"), minLength: z.number().int().nonnegative().optional(), pattern: z.string().optional() }),
  z.object({ type: z.literal("number"), minimum: z.number().optional(), maximum: z.number().optional() }),
  z.object({ type: z.literal("money"), currency: z.string().length(3), minimum: z.number().nonnegative().optional() }),
  z.object({ type: z.literal("enum"), values: z.array(z.string().min(1)).min(1) }),
  z.object({ type: z.literal("boolean") }),
]);

const provenanceSchema = z.object({
  source: z.enum(["goal_span", "action_trace", "compiler_inference"]),
  sampleValueRedacted: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const capabilityInputSchema = z.object({
  name: identifierSchema,
  description: z.string().min(1),
  required: z.boolean().default(true),
  sensitive: z.boolean().default(false),
  schema: inputTypeSchema,
  provenance: provenanceSchema,
});

export const capabilityOutputSchema = z.object({
  name: identifierSchema,
  description: z.string().min(1),
  schema: inputTypeSchema,
  extract: z.object({
    target: targetSchema,
    attribute: z.enum(["text", "value"]).default("text"),
    transform: z.enum(["none", "trim", "money", "mask_account"]).default("trim"),
  }),
});

export const businessOutcomeSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  description: z.string().min(1),
  when: z.array(conditionSchema).min(1),
});

export const recoveryHandlerSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  description: z.string().min(1),
  when: z.array(conditionSchema).min(1),
  actions: z.array(actionSchema).min(1),
  postconditions: z.array(conditionSchema).min(1),
  maxAttempts: z.number().int().min(1).max(3).default(1),
});

export const interventionHandlerSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  reason: z.string().min(1),
  when: z.array(conditionSchema).min(1),
  resumeCheckpoint: z.array(conditionSchema).min(1),
});

const tenantProfileSchema = z.object({
  tenantId: identifierSchema,
  entryPointOverride: z.string().url().optional(),
  routePrefixOverride: z.string().startsWith("/").optional(),
});

export const capabilitySchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    id: identifierSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    revision: z.number().int().positive(),
    status: z.enum(["draft", "verified", "approved"]),
    createdAt: z.string().datetime(),
    target: z.object({
      applicationFamily: identifierSchema,
      entryPoint: z.string().url(),
      allowedOrigins: z.array(z.string().url()).min(1),
      fingerprint: z.object({
        titlePattern: z.string().min(1),
        requiredText: z.array(z.string().min(1)).default([]),
      }),
      tenantProfiles: z.array(tenantProfileSchema).default([]),
    }),
    contract: z.object({
      inputs: z.array(capabilityInputSchema),
      outputs: z.array(capabilityOutputSchema),
      businessOutcomes: z.array(businessOutcomeSchema).default([]),
    }),
    runtimeHandlers: z.object({
      recoveries: z.array(recoveryHandlerSchema).default([]),
      interventions: z.array(interventionHandlerSchema).default([]),
    }).default({}),
    policy: z.object({
      allowedActionTypes: z.array(z.enum(["navigate", "click", "type", "select", "wait"])).min(1),
      maximumAutomatedRisk: z.enum(["safe", "sensitive"]),
      allowedRoutePatterns: z.array(z.string().min(1)).min(1),
    }),
    steps: z.array(capabilityStepSchema).min(1),
    successCheckpoint: z.array(conditionSchema).min(1),
    discovery: z.object({
      goal: z.string().min(1),
      runId: identifierSchema,
      evidenceLog: z.string().min(1),
      compiler: z.string().min(1),
    }),
  })
  .superRefine((capability, context) => {
    const inputNames = new Set<string>();
    for (const [index, input] of capability.contract.inputs.entries()) {
      if (inputNames.has(input.name)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["contract", "inputs", index, "name"], message: "duplicate input name" });
      }
      inputNames.add(input.name);
    }

    const usedInputs = new Set<string>();
    for (const step of capability.steps) {
      if ("value" in step.action && typeof step.action.value === "object" && step.action.value.kind === "input") {
        usedInputs.add(step.action.value.name);
      }
      if (step.action.type === "navigate" && step.action.url.kind === "input") {
        usedInputs.add(step.action.url.name);
      }
    }

    for (const input of capability.contract.inputs) {
      if (input.required && !usedInputs.has(input.name)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["contract", "inputs"],
          message: `required input ${input.name} is not referenced by an executable step`,
        });
      }
    }
    for (const inputName of usedInputs) {
      if (!inputNames.has(inputName)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["steps"], message: `step references undeclared input ${inputName}` });
      }
    }
  });

export type Capability = z.infer<typeof capabilitySchema>;
