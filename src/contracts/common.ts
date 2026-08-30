import { z } from "zod";

export const identifierSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/, "expected a stable lowercase identifier");

export const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type JsonPrimitive = z.infer<typeof jsonPrimitiveSchema>;

export const inputReferenceSchema = z.object({
  kind: z.literal("input"),
  name: identifierSchema,
});

export const literalValueSchema = z.object({
  kind: z.literal("literal"),
  value: jsonPrimitiveSchema,
});

export const valueExpressionSchema = z.discriminatedUnion("kind", [
  inputReferenceSchema,
  literalValueSchema,
]);
export type ValueExpression = z.infer<typeof valueExpressionSchema>;

export const evidenceReferenceSchema = z.object({
  kind: z.enum(["screenshot", "trace", "snapshot", "log"]),
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

