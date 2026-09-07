import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTicketDeskApp } from "../demo/targets/ticket-desk/app.js";
import { DiscoveryAgent } from "../src/agent/discovery-agent.js";
import type { CompilationContext, CompilationProposal, DecisionContext, DiscoveryDecision, DiscoveryModel } from "../src/agent/model.js";
import { ApplicationProfileRegistry, createGenericDiscoveryProfile } from "../src/artifact/application-profiles.js";
import { CapabilityCompiler } from "../src/artifact/compiler.js";
import type { RuntimePolicy } from "../src/contracts/policy.js";
import { DeterministicExecutor } from "../src/replay/executor.js";
import { BrowserSurface } from "../src/surface/browser-surface.js";

class TicketDeskModel implements DiscoveryModel {
  readonly providerName = "scripted-ticket-desk-model";

  async decide(context: DecisionContext): Promise<DiscoveryDecision> {
    const element = (name: string) => {
      const match = context.observation.elements.find((candidate) => candidate.name === name);
      if (!match) throw new Error(`missing observed element ${name}`);
      return match.elementId;
    };
    if (context.stepNumber === 0) {
      return { status: "act", summary: "Enter the ticket ID from the goal.", actionType: "type", elementId: element("Ticket ID"), value: "CASE-123" };
    }
    if (context.stepNumber === 1) {
      return { status: "act", summary: "Find the requested ticket.", actionType: "click", elementId: element("Find ticket"), value: null };
    }
    return {
      status: "complete",
      summary: "Ticket Summary reached",
      outputs: [{ name: "ticket-summary", description: "Ticket summary", type: "string", elementId: element("CASE-123: Open") }],
    };
  }

  async proposeCompilation(_context: CompilationContext): Promise<CompilationProposal> {
    return {
      id: "find-support-ticket",
      name: "Find support ticket",
      description: "Find a support ticket and return its summary.",
      inputs: [{ name: "ticket-id", description: "Support ticket identifier", type: "string", sampleValue: "CASE-123", enumValues: [], sensitive: false }],
      steps: [
        { traceIndex: 0, description: "Enter ticket ID", checkpointText: null },
        { traceIndex: 1, description: "Find ticket", checkpointText: "Ticket Summary" },
      ],
    };
  }
}

function runtimePolicy(profile: ReturnType<typeof createGenericDiscoveryProfile>, id: string): RuntimePolicy {
  return {
    id,
    allowedOrigins: profile.allowedOrigins,
    allowedRoutePatterns: profile.allowedRoutePatterns,
    allowedActionTypes: profile.allowedActionTypes,
    maximumAutomatedRisk: profile.maximumAutomatedRisk,
    redactInputNames: [],
    blockedTargetTextPatterns: profile.blockedTargetTextPatterns,
  };
}

let server: Server;
let entryPoint: string;
let discoverySurface: BrowserSurface;
let replaySurface: BrowserSurface;

beforeAll(async () => {
  const app = createTicketDeskApp();
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("ticket test server did not expose a TCP port");
  entryPoint = `http://127.0.0.1:${address.port}/tickets`;
  discoverySurface = await BrowserSurface.launch();
  replaySurface = await BrowserSurface.launch();
});

afterAll(async () => {
  await discoverySurface.close();
  await replaySurface.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe("generic website discovery and replay", () => {
  it("learns and replays a capability for a non-Northstar application without a custom profile", async () => {
    const model = new TicketDeskModel();
    const discoveryProfile = createGenericDiscoveryProfile(entryPoint);
    const discovery = await new DiscoveryAgent(model, discoverySurface, runtimePolicy(discoveryProfile, "ticket-discovery")).run(
      "Find support ticket CASE-123 and return its summary.",
      entryPoint,
      { runId: "test-generic-ticket-discovery" },
    );
    expect(discovery.status).toBe("success");
    if (discovery.status !== "success") return;

    const resolved = new ApplicationProfileRegistry().resolve(entryPoint, discovery.finalObservation);
    expect(resolved.providerId).toBe("generic-web");
    expect(resolved.specialized).toBe(false);
    expect(resolved.profile.titlePattern).toBe("^Acme Ticket Desk$");

    const capability = await new CapabilityCompiler(model).compile(discovery, resolved.profile);
    expect(capability.target.applicationFamily).toContain("tickets");
    expect(capability.discovery.goal).toContain("{{ticket-id}}");
    expect(capability.steps[1]?.action).toMatchObject({ value: { kind: "input", name: "ticket-id" } });

    const replay = await new DeterministicExecutor(
      capability,
      replaySurface,
      runtimePolicy(resolved.profile, "ticket-replay"),
    ).run({ "ticket-id": "CASE-987" }, { runId: "test-generic-ticket-replay" });

    expect(replay).toMatchObject({ status: "success", outputs: { "ticket-summary": "CASE-987: Open" } });
  }, 30_000);
});
