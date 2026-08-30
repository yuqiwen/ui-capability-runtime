import { describe, expect, it } from "vitest";
import { decisionJsonSchema, parseDiscoveryDecisionEnvelope } from "../src/agent/openai-model.js";

describe("OpenAI discovery response envelope", () => {
  it("uses a strict flat schema accepted by Structured Outputs", () => {
    expect(decisionJsonSchema.schema).not.toHaveProperty("oneOf");
    expect(decisionJsonSchema.schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["status", "summary", "actionType", "elementId", "value", "outputs", "reason"],
    });
    expect((decisionJsonSchema.schema as any).properties.outputs.items.properties.name.pattern)
      .toBe("^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$");
  });

  it("normalizes an action envelope into the internal discriminated union", () => {
    expect(parseDiscoveryDecisionEnvelope({
      status: "act",
      summary: "Open member search",
      actionType: "click",
      elementId: "main:button:open-search",
      value: null,
      outputs: [],
      reason: null,
    })).toEqual({
      status: "act",
      summary: "Open member search",
      actionType: "click",
      elementId: "main:button:open-search",
      value: null,
    });
  });

  it("rejects an incomplete status-specific envelope", () => {
    expect(() => parseDiscoveryDecisionEnvelope({
      status: "complete",
      summary: "Reached review",
      actionType: null,
      elementId: null,
      value: null,
      outputs: [],
      reason: null,
    })).toThrow();
  });
});
