import type { CompilationProfile } from "./compiler.js";

const framePath = [{ name: "member-workspace" }];

export function createNorthstarProfile(entryPoint: string): CompilationProfile {
  const origin = new URL(entryPoint).origin;
  return {
    applicationFamily: "northstar-ops",
    titlePattern: "Northstar Credit Union Operations",
    requiredText: ["Member Services"],
    allowedOrigins: [origin],
    allowedRoutePatterns: ["^/ops(?:/|$)"],
    allowedActionTypes: ["navigate", "click", "type", "select", "wait"],
    maximumAutomatedRisk: "sensitive",
    inputSchemaOverrides: {
      "member-id": { type: "string", pattern: "^M-[0-9]{5}$" },
      amount: { type: "money", currency: "USD", minimum: 0.01 },
    },
    businessOutcomes: [
      { code: "MEMBER_NOT_FOUND", description: "The supplied member number does not exist.", when: [{ type: "page_contains", value: { kind: "literal", value: "No matching member." } }] },
      { code: "VALIDATION_REJECTED", description: "The target application rejected the transfer fields.", when: [{ type: "page_contains", value: { kind: "literal", value: "Validation error." } }] },
    ],
    runtimeHandlers: {
      recoveries: [
        {
          code: "TRANSIENT_VALIDATION_DELAY",
          description: "Retry the known validation service interstitial once.",
          when: [{ type: "page_contains", value: { kind: "literal", value: "Temporary service delay." } }],
          actions: [{
            type: "click",
            target: {
              description: "Retry Validation link",
              candidates: [{ strategy: "role", role: "link", name: "Retry Validation", framePath, exact: true }],
              requireUnique: true,
            },
          }],
          postconditions: [{ type: "page_contains", value: { kind: "literal", value: "Transfer Review" } }],
          maxAttempts: 1,
        },
      ],
      interventions: [
        {
          code: "SUPERVISOR_PERMISSION_REQUIRED",
          reason: "The target application requires a supervisor to continue in the live session.",
          when: [{ type: "page_contains", value: { kind: "literal", value: "Supervisor permission required." } }],
          resumeCheckpoint: [{ type: "page_contains", value: { kind: "literal", value: "Transfer Review" } }],
        },
      ],
    },
  };
}

