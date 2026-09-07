import { capabilitySchema, type Capability } from "../../src/contracts/capability.js";

// Test-only hand-authored fixture for replay-engine development. Production CLI
// commands never import this file; genuine artifacts are emitted by CapabilityCompiler.

const framePath = [{ name: "member-workspace" }];

const target = {
  memberInput: {
    description: "Member Number input",
    candidates: [
      { strategy: "label" as const, label: "Member Number", framePath, exact: true },
      { strategy: "css" as const, selector: "input[name=memberNumber]", framePath, exact: true },
    ],
    requireUnique: true,
  },
  searchButton: {
    description: "Search button",
    candidates: [{ strategy: "role" as const, role: "button", name: "Search", framePath, exact: true }],
    requireUnique: true,
  },
  prepareTransfer: {
    description: "Prepare Internal Transfer link",
    candidates: [{ strategy: "role" as const, role: "link", name: "Prepare Internal Transfer", framePath, exact: true }],
    requireUnique: true,
  },
  fromAccount: {
    description: "From account selector",
    candidates: [{ strategy: "label" as const, label: "From account", framePath, exact: true }],
    requireUnique: true,
  },
  toAccount: {
    description: "To account selector",
    candidates: [{ strategy: "label" as const, label: "To account", framePath, exact: true }],
    requireUnique: true,
  },
  amount: {
    description: "Transfer amount input",
    candidates: [{ strategy: "label" as const, label: "Transfer amount", framePath, exact: true }],
    requireUnique: true,
  },
  continuePrimary: {
    description: "Primary Continue button on transfer entry",
    candidates: [
      { strategy: "role" as const, role: "button", name: "Continue", framePath, exact: true },
      { strategy: "css" as const, selector: "button.primary[type=submit]", framePath, exact: true },
    ],
    requireUnique: true,
  },
  retryValidation: {
    description: "Retry Validation link",
    candidates: [{ strategy: "role" as const, role: "link", name: "Retry Validation", framePath, exact: true }],
    requireUnique: true,
  },
};

function outputTarget(selector: string, description: string) {
  return { description, candidates: [{ strategy: "css" as const, selector, framePath, exact: true }], requireUnique: true };
}

export function createSampleCapability(entryPoint = "http://127.0.0.1:4310/ops"): Capability {
  return capabilitySchema.parse({
    schemaVersion: "1.0",
    id: "prepare-internal-transfer",
    name: "Prepare internal transfer",
    description: "Prepare a fictional member transfer and stop at the review checkpoint without moving funds.",
    revision: 1,
    status: "verified",
    createdAt: "2026-08-30T01:00:00.000Z",
    target: {
      applicationFamily: "northstar-ops",
      entryPoint,
      allowedOrigins: [new URL(entryPoint).origin],
      fingerprint: { titlePattern: "Northstar Credit Union Operations", requiredText: ["Member Services"] },
      tenantProfiles: [],
    },
    contract: {
      inputs: [
        { name: "member-id", description: "Fictional member number", required: true, sensitive: true, schema: { type: "string", pattern: "^M-[0-9]{5}$" }, provenance: { source: "goal_span", sampleValueRedacted: "M-***42", confidence: 0.99 } },
        { name: "from-account", description: "Source deposit account type", required: true, sensitive: false, schema: { type: "enum", values: ["checking", "savings"] }, provenance: { source: "goal_span", sampleValueRedacted: "checking", confidence: 0.98 } },
        { name: "to-account", description: "Destination deposit account type", required: true, sensitive: false, schema: { type: "enum", values: ["checking", "savings"] }, provenance: { source: "goal_span", sampleValueRedacted: "savings", confidence: 0.98 } },
        { name: "amount", description: "Transfer amount", required: true, sensitive: true, schema: { type: "money", currency: "USD", minimum: 0.01 }, provenance: { source: "goal_span", sampleValueRedacted: "$***.**", confidence: 0.99 } },
      ],
      outputs: [
        { name: "member-name", description: "Member name shown at review", schema: { type: "string" }, extract: { target: outputTarget(".review-member", "Review member name"), attribute: "text", transform: "trim" } },
        { name: "from-account-masked", description: "Masked source account", schema: { type: "string" }, extract: { target: outputTarget(".review-from", "Masked source account"), attribute: "text", transform: "trim" } },
        { name: "to-account-masked", description: "Masked destination account", schema: { type: "string" }, extract: { target: outputTarget(".review-to", "Masked destination account"), attribute: "text", transform: "trim" } },
        { name: "amount", description: "Reviewed transfer amount", schema: { type: "money", currency: "USD" }, extract: { target: outputTarget(".review-amount", "Reviewed transfer amount"), attribute: "text", transform: "money" } },
        { name: "fee", description: "Reviewed transfer fee", schema: { type: "money", currency: "USD" }, extract: { target: outputTarget(".review-fee", "Reviewed fee"), attribute: "text", transform: "money" } },
        { name: "review-reference", description: "Review reference", schema: { type: "string" }, extract: { target: outputTarget(".review-reference", "Review reference"), attribute: "text", transform: "trim" } },
      ],
      businessOutcomes: [
        { code: "MEMBER_NOT_FOUND", description: "The supplied member number does not exist.", when: [{ type: "page_contains", value: { kind: "literal", value: "No matching member." } }] },
        { code: "VALIDATION_REJECTED", description: "The target application rejected the transfer fields.", when: [{ type: "page_contains", value: { kind: "literal", value: "Validation error." } }] },
      ],
    },
    runtimeHandlers: {
      recoveries: [
        {
          code: "TRANSIENT_VALIDATION_DELAY",
          description: "Retry the known validation service interstitial once.",
          when: [{ type: "page_contains", value: { kind: "literal", value: "Temporary service delay." } }],
          actions: [{ type: "click", target: target.retryValidation }],
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
    policy: {
      allowedActionTypes: ["navigate", "click", "type", "select", "wait"],
      maximumAutomatedRisk: "sensitive",
      allowedRoutePatterns: ["^/ops(?:/|$)"],
      blockedTargetTextPatterns: ["Submit Transfer", "Delete", "Close Account"],
    },
    steps: [
      { id: "open-application", description: "Open the approved operations entry point", action: { type: "navigate", url: { kind: "literal", value: entryPoint } }, preconditions: [], postconditions: [{ type: "page_contains", value: { kind: "literal", value: "Member Search" } }], timeoutMs: 10_000, retry: { maxAttempts: 2, backoffMs: 100, retryOn: ["timeout", "transient_navigation"] }, risk: "safe" },
      { id: "enter-member", description: "Enter the member number", action: { type: "type", target: target.memberInput, value: { kind: "input", name: "member-id" } }, preconditions: [{ type: "page_contains", value: { kind: "literal", value: "Member Search" } }], postconditions: [], timeoutMs: 5_000, retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] }, risk: "sensitive" },
      { id: "search-member", description: "Submit member search", action: { type: "click", target: target.searchButton }, preconditions: [], postconditions: [{ type: "page_contains", value: { kind: "literal", value: "Member Relationship" } }], timeoutMs: 10_000, retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] }, risk: "safe" },
      { id: "open-transfer", description: "Open the internal transfer workflow", action: { type: "click", target: target.prepareTransfer }, preconditions: [], postconditions: [{ type: "page_contains", value: { kind: "literal", value: "Internal Transfer Entry" } }], timeoutMs: 10_000, retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] }, risk: "safe" },
      { id: "select-source", description: "Select the source account", action: { type: "select", target: target.fromAccount, value: { kind: "input", name: "from-account" } }, preconditions: [], postconditions: [], timeoutMs: 5_000, retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] }, risk: "sensitive" },
      { id: "select-destination", description: "Select the destination account", action: { type: "select", target: target.toAccount, value: { kind: "input", name: "to-account" } }, preconditions: [], postconditions: [], timeoutMs: 5_000, retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] }, risk: "sensitive" },
      { id: "enter-amount", description: "Enter the transfer amount", action: { type: "type", target: target.amount, value: { kind: "input", name: "amount" } }, preconditions: [], postconditions: [], timeoutMs: 5_000, retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] }, risk: "sensitive" },
      { id: "continue-to-review", description: "Validate the draft and continue to review", action: { type: "click", target: target.continuePrimary }, preconditions: [], postconditions: [{ type: "page_contains", value: { kind: "literal", value: "Transfer Review" } }], timeoutMs: 10_000, retry: { maxAttempts: 1, backoffMs: 0, retryOn: [] }, risk: "sensitive" },
    ],
    successCheckpoint: [
      { type: "page_contains", value: { kind: "literal", value: "Transfer Review" } },
      { type: "visible", target: outputTarget(".review-reference", "Review reference") },
    ],
    discovery: {
      goal: "Prepare a $125.50 internal transfer for member M-10042 from checking to savings and stop at the review page.",
      runId: "discovery-sample",
      evidenceLog: "evidence/discovery-run.jsonl",
      compiler: "capability-compiler-v1",
    },
  });
}
