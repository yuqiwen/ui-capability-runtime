import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DiscoveryAgent } from "../src/agent/discovery-agent.js";
import type { CompilationContext, CompilationProposal, DecisionContext, DiscoveryDecision, DiscoveryModel } from "../src/agent/model.js";
import { CapabilityCompiler } from "../src/artifact/compiler.js";
import { createNorthstarProfile } from "../src/artifact/northstar-profile.js";
import type { RuntimePolicy } from "../src/contracts/policy.js";
import { BrowserSurface } from "../src/surface/browser-surface.js";
import { createTargetApp } from "../src/target/app.js";

class ScriptedDiscoveryModel implements DiscoveryModel {
  readonly providerName = "scripted-integration-model";

  async decide(context: DecisionContext): Promise<DiscoveryDecision> {
    const byName = (name: string) => {
      const element = context.observation.elements.find((candidate) => candidate.name === name && candidate.interactive);
      if (!element) throw new Error(`scripted model could not find ${name}`);
      return element.elementId;
    };
    if (context.stepNumber === 0) return { status: "act", summary: "Enter the member number from the goal.", actionType: "type", elementId: byName("Member Number"), value: "M-10042" };
    if (context.stepNumber === 1) return { status: "act", summary: "Submit the member search.", actionType: "click", elementId: byName("Search"), value: null };
    if (context.stepNumber === 2) return { status: "act", summary: "Open the internal transfer workflow.", actionType: "click", elementId: byName("Prepare Internal Transfer"), value: null };
    if (context.stepNumber === 3) return { status: "act", summary: "Select checking as the source account.", actionType: "select", elementId: byName("From account"), value: "checking" };
    if (context.stepNumber === 4) return { status: "act", summary: "Select savings as the destination account.", actionType: "select", elementId: byName("To account"), value: "savings" };
    if (context.stepNumber === 5) return { status: "act", summary: "Enter the transfer amount from the goal.", actionType: "type", elementId: byName("Transfer amount"), value: "125.50" };
    if (context.stepNumber === 6) {
      const primary = context.observation.elements.find((element) => element.name === "Continue" && element.target.candidates.some((candidate) => candidate.strategy === "css" && candidate.selector.includes("button.primary")));
      if (!primary) throw new Error("scripted model could not find primary Continue");
      return { status: "act", summary: "Continue to the transfer review checkpoint.", actionType: "click", elementId: primary.elementId, value: null };
    }
    const idForSelector = (selector: string) => {
      const element = context.observation.elements.find((candidate) => candidate.target.candidates.some((locator) => locator.strategy === "css" && locator.selector === selector));
      if (!element) throw new Error(`scripted model could not find output ${selector}`);
      return element.elementId;
    };
    return {
      status: "complete",
      summary: "Transfer Review",
      outputs: [
        { name: "member-name", description: "Member name shown at review", type: "string", elementId: idForSelector("span.review-member") },
        { name: "from-account-masked", description: "Masked source account", type: "string", elementId: idForSelector("span.review-from") },
        { name: "to-account-masked", description: "Masked destination account", type: "string", elementId: idForSelector("span.review-to") },
        { name: "amount", description: "Reviewed amount", type: "money", elementId: idForSelector("span.review-amount") },
        { name: "fee", description: "Reviewed fee", type: "money", elementId: idForSelector("span.review-fee") },
        { name: "review-reference", description: "Review reference", type: "string", elementId: idForSelector("span.review-reference") },
      ],
    };
  }

  async proposeCompilation(_context: CompilationContext): Promise<CompilationProposal> {
    return {
      id: "prepare-internal-transfer",
      name: "Prepare internal transfer",
      description: "Prepare a member transfer and stop before irreversible submission.",
      inputs: [
        { name: "member-id", description: "Member number", type: "string", sampleValue: "M-10042", enumValues: [], sensitive: false },
        { name: "from-account", description: "Source account type", type: "enum", sampleValue: "checking", enumValues: ["checking", "savings"], sensitive: false },
        { name: "to-account", description: "Destination account type", type: "enum", sampleValue: "savings", enumValues: ["checking", "savings"], sensitive: false },
        { name: "amount", description: "Transfer amount", type: "money", sampleValue: 125.5, enumValues: [], sensitive: false },
      ],
      steps: [
        { traceIndex: 0, description: "Enter the member number", checkpointText: null },
        { traceIndex: 1, description: "Search for the member", checkpointText: "Member Relationship" },
        { traceIndex: 2, description: "Open internal transfer entry", checkpointText: "Internal Transfer Entry" },
        { traceIndex: 3, description: "Select source account", checkpointText: null },
        { traceIndex: 4, description: "Select destination account", checkpointText: null },
        { traceIndex: 5, description: "Enter transfer amount", checkpointText: null },
        { traceIndex: 6, description: "Continue to review", checkpointText: "Transfer Review" },
      ],
    };
  }
}

let server: Server;
let entryPoint: string;
let surface: BrowserSurface;

beforeAll(async () => {
  const app = createTargetApp({ forcedScenario: "happy" });
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("discovery test server did not expose a TCP port");
  entryPoint = `http://127.0.0.1:${address.port}/ops`;
  surface = await BrowserSurface.launch();
});

afterAll(async () => {
  await surface.close();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe("goal-only discovery and capability compilation", () => {
  it("discovers a live UI flow and automatically parameterizes its concrete values", async () => {
    const model = new ScriptedDiscoveryModel();
    const profile = createNorthstarProfile(entryPoint);
    const policy: RuntimePolicy = {
      id: "northstar-discovery-policy",
      allowedOrigins: profile.allowedOrigins,
      allowedRoutePatterns: profile.allowedRoutePatterns,
      allowedActionTypes: profile.allowedActionTypes,
      maximumAutomatedRisk: profile.maximumAutomatedRisk,
      redactInputNames: ["member-id", "amount"],
      blockedTargetTextPatterns: ["Submit Transfer"],
    };
    const agent = new DiscoveryAgent(model, surface, policy);
    const goal = "Prepare a $125.50 internal transfer for member M-10042 from checking to savings and stop at the review page.";
    const discovery = await agent.run(goal, entryPoint, { runId: "test-discovery-compiler" });
    expect(discovery.status).toBe("success");
    if (discovery.status !== "success") return;

    const capability = await new CapabilityCompiler(model).compile(discovery, profile);
    expect(capability.status).toBe("draft");
    expect(capability.contract.inputs.map((input) => input.name)).toEqual(["member-id", "from-account", "to-account", "amount"]);
    expect(capability.contract.inputs.find((input) => input.name === "member-id")?.sensitive).toBe(true);
    expect(capability.contract.inputs.find((input) => input.name === "amount")?.sensitive).toBe(true);
    const serialized = JSON.stringify(capability);
    expect(serialized).not.toContain("M-10042");
    expect(serialized).not.toContain("125.50");
    expect(serialized).not.toContain("125.5");
    expect(serialized).toContain('"kind":"input","name":"member-id"');
    expect(serialized).toContain('"kind":"input","name":"amount"');
    expect(capability.discovery.goal).toContain("{{member-id}}");
    expect(capability.successCheckpoint.length).toBeGreaterThanOrEqual(2);
    expect(capability.discovery.evidenceLog).toBe("evidence/runs/test-discovery-compiler/run.jsonl");
  }, 30_000);
});
