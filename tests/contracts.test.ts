import { describe, expect, it } from "vitest";
import { capabilitySchema, runResultSchema } from "../src/contracts/index.js";

const searchTarget = {
  description: "Member search input",
  candidates: [{ strategy: "label", label: "Member Number", framePath: [], exact: true }],
  requireUnique: true,
};

function validCapability() {
  return {
    schemaVersion: "1.0",
    id: "prepare-internal-transfer",
    name: "Prepare internal transfer",
    description: "Prepare a fictional internal transfer and stop at review.",
    revision: 1,
    status: "draft",
    createdAt: "2026-08-30T01:00:00.000Z",
    target: {
      applicationFamily: "northstar-ops",
      entryPoint: "http://127.0.0.1:4310/ops",
      allowedOrigins: ["http://127.0.0.1:4310"],
      fingerprint: { titlePattern: "Northstar.*Operations", requiredText: ["Member Services"] },
      tenantProfiles: [],
    },
    contract: {
      inputs: [
        {
          name: "member-id",
          description: "Fictional member identifier",
          required: true,
          sensitive: true,
          schema: { type: "string", pattern: "^M-[0-9]{5}$" },
          provenance: { source: "goal_span", sampleValueRedacted: "M-***42", confidence: 0.99 },
        },
      ],
      outputs: [],
      businessOutcomes: [],
    },
    runtimeHandlers: { recoveries: [], interventions: [] },
    policy: {
      allowedActionTypes: ["navigate", "click", "type", "select", "wait"],
      maximumAutomatedRisk: "sensitive",
      allowedRoutePatterns: ["^/ops"],
    },
    steps: [
      {
        id: "enter-member-id",
        description: "Enter the member identifier",
        action: { type: "type", target: searchTarget, value: { kind: "input", name: "member-id" } },
        preconditions: [],
        postconditions: [],
        timeoutMs: 10_000,
        retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] },
        risk: "sensitive",
      },
    ],
    successCheckpoint: [{ type: "page_contains", value: { kind: "literal", value: "Transfer Review" } }],
    discovery: {
      goal: "Prepare a transfer for member M-10042 and stop at review",
      runId: "discovery-001",
      evidenceLog: "evidence/discovery-run.jsonl",
      compiler: "capability-compiler-v1",
    },
  };
}

describe("capability contract", () => {
  it("accepts a typed, executable capability", () => {
    expect(capabilitySchema.parse(validCapability()).id).toBe("prepare-internal-transfer");
  });

  it("rejects an undeclared input reference", () => {
    const capability: any = validCapability();
    capability.steps[0]!.action.value.name = "unknown-input";
    expect(capabilitySchema.safeParse(capability).success).toBe(false);
  });

  it("rejects a required input that no executable step uses", () => {
    const capability: any = validCapability();
    capability.contract.inputs.push({
      name: "amount",
      description: "Transfer amount",
      required: true,
      sensitive: false,
      schema: { type: "money", currency: "USD", minimum: 0.01 },
      provenance: { source: "goal_span", sampleValueRedacted: "125.50", confidence: 0.99 },
    });
    expect(capabilitySchema.safeParse(capability).success).toBe(false);
  });
});

describe("run result contract", () => {
  it("represents member-not-found as a business outcome", () => {
    const result = runResultSchema.parse({
      status: "business_outcome",
      runId: "replay-001",
      code: "MEMBER_NOT_FOUND",
      details: {},
      evidence: [],
    });
    expect(result.status).toBe("business_outcome");
  });
});
