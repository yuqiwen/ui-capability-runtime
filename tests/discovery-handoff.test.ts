import { describe, expect, it } from "vitest";
import { DiscoveryAgent } from "../src/agent/discovery-agent.js";
import type { CompilationContext, CompilationProposal, DecisionContext, DiscoveryDecision, DiscoveryModel } from "../src/agent/model.js";
import type { Action, Condition } from "../src/contracts/action.js";
import type { JsonPrimitive } from "../src/contracts/common.js";
import { MemoryEvidenceSink } from "../src/evidence/events.js";
import { HandoffCoordinator } from "../src/handoff/coordinator.js";
import type { ActionResult, HumanActionRecord, Observation, Surface } from "../src/surface/surface.js";

class StuckThenCompleteModel implements DiscoveryModel {
  readonly providerName = "stuck-then-complete";
  private calls = 0;

  async decide(_context: DecisionContext): Promise<DiscoveryDecision> {
    this.calls += 1;
    if (this.calls === 1) return { status: "stuck", reason: "A human must clear the unexpected interstitial." };
    return { status: "complete", summary: "Review ready", outputs: [{ name: "reference", description: "Review reference", type: "string", elementId: "output-1" }] };
  }

  async proposeCompilation(_context: CompilationContext): Promise<CompilationProposal> {
    throw new Error("not used in this test");
  }
}

class HandoffSurface implements Surface {
  private url = "about:blank";
  async observe(): Promise<Observation> {
    return {
      url: this.url,
      title: "Mock operations",
      visibleText: "Review ready RVW-TEST",
      screenshot: Buffer.from("image"),
      elements: [{
        elementId: "output-1",
        tag: "span",
        name: "RVW-TEST",
        interactive: false,
        disabled: false,
        target: { description: "Review reference", candidates: [{ strategy: "css", selector: ".reference", framePath: [], exact: true }], requireUnique: true },
      }],
    };
  }
  async perform(action: Action, _inputs: Record<string, JsonPrimitive>, _timeoutMs: number): Promise<ActionResult> {
    if (action.type === "navigate" && action.url.kind === "literal") this.url = String(action.url.value);
    return { url: this.url, title: "Mock operations" };
  }
  async check(condition: Condition): Promise<boolean> {
    return condition.type === "url_matches" ? new RegExp(condition.pattern).test(this.url) : true;
  }
  async extractText(): Promise<string> { return "RVW-TEST"; }
  async beginHumanControl(): Promise<void> {}
  async endHumanControl(): Promise<HumanActionRecord[]> { return [{ timestamp: new Date().toISOString(), kind: "click", target: "Clear interstitial" }]; }
  async close(): Promise<void> {}
}

describe("discovery handoff", () => {
  it("lets a human resume the same discovery loop after the model reports stuck", async () => {
    const surface = new HandoffSurface();
    const evidence = new MemoryEvidenceSink();
    const coordinator = new HandoffCoordinator(async (request, activeCoordinator) => {
      activeCoordinator.takeControl(request.id);
      await activeCoordinator.resume(request.id);
    });
    const agent = new DiscoveryAgent(new StuckThenCompleteModel(), surface, {
      id: "test-discovery-policy",
      allowedOrigins: ["http://127.0.0.1:4310"],
      allowedRoutePatterns: ["^/ops"],
      allowedActionTypes: ["navigate", "click", "type", "select", "wait"],
      maximumAutomatedRisk: "sensitive",
      redactInputNames: [],
      blockedTargetTextPatterns: [],
    });
    const result = await agent.run("Reach review for member M-10042", "http://127.0.0.1:4310/ops", { runId: "discovery-handoff-test", handoff: coordinator, evidence });
    expect(result.status).toBe("success");
    expect(evidence.events.some((event) => event.type === "human_control_resumed")).toBe(true);
  });
});

