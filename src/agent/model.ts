import { z } from "zod";
import type { Observation } from "../surface/surface.js";

const outputCandidateSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  description: z.string().min(1),
  type: z.enum(["string", "money"]),
  elementId: z.string().min(1),
});

export const discoveryDecisionSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("act"),
    summary: z.string().min(1).max(240),
    actionType: z.enum(["click", "type", "select", "wait"]),
    elementId: z.string().nullable(),
    value: z.string().nullable(),
  }),
  z.object({
    status: z.literal("complete"),
    summary: z.string().min(1).max(240),
    outputs: z.array(outputCandidateSchema).min(1),
  }),
  z.object({
    status: z.literal("stuck"),
    reason: z.string().min(1).max(500),
  }),
]);

export type DiscoveryDecision = z.infer<typeof discoveryDecisionSchema>;

const proposedInputSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  description: z.string().min(1),
  type: z.enum(["string", "number", "money", "enum", "boolean"]),
  sampleValue: z.union([z.string(), z.number(), z.boolean()]),
  enumValues: z.array(z.string()),
  sensitive: z.boolean(),
});

export const compilationProposalSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  description: z.string().min(1),
  inputs: z.array(proposedInputSchema).min(1),
  steps: z.array(z.object({
    traceIndex: z.number().int().nonnegative(),
    description: z.string().min(1),
    checkpointText: z.string().min(1).nullable(),
  })),
});

export type CompilationProposal = z.infer<typeof compilationProposalSchema>;

export interface DecisionContext {
  goal: string;
  observation: Observation;
  stepNumber: number;
  priorActions: Array<{ actionType: string; summary: string; resultUrl: string }>;
}

export interface CompilationContext {
  goal: string;
  trace: Array<{
    index: number;
    actionType: string;
    targetDescription?: string;
    concreteValue?: string;
    beforeText: string;
    afterText: string;
  }>;
}

export interface DiscoveryModel {
  decide(context: DecisionContext): Promise<DiscoveryDecision>;
  proposeCompilation(context: CompilationContext): Promise<CompilationProposal>;
  readonly providerName: string;
}

