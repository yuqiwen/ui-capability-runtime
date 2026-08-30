import { randomUUID } from "node:crypto";
import type { Action } from "../contracts/action.js";
import type { JsonPrimitive } from "../contracts/common.js";
import type { EvidenceSink } from "../evidence/events.js";
import { MemoryEvidenceSink } from "../evidence/events.js";
import { PolicyEngine } from "../policy/policy-engine.js";
import type { Surface, Observation } from "../surface/surface.js";
import type { RuntimePolicy } from "../contracts/policy.js";
import type { DiscoveryDecision, DiscoveryModel } from "./model.js";
import type { HandoffCoordinator } from "../handoff/coordinator.js";

export interface RecordedDiscoveryStep {
  index: number;
  summary: string;
  action: Action;
  before: Observation;
  after: Observation;
}

export interface SuccessfulDiscovery {
  status: "success";
  runId: string;
  goal: string;
  target: string;
  trace: RecordedDiscoveryStep[];
  completion: Extract<DiscoveryDecision, { status: "complete" }>;
  finalObservation: Observation;
  modelProvider: string;
}

export interface StoppedDiscovery {
  status: "stopped";
  runId: string;
  reason: string;
  trace: RecordedDiscoveryStep[];
}

export type DiscoveryResult = SuccessfulDiscovery | StoppedDiscovery;

export interface DiscoveryOptions {
  maxSteps?: number;
  runId?: string;
  evidence?: EvidenceSink;
  handoff?: HandoffCoordinator;
}

export class DiscoveryAgent {
  constructor(private readonly model: DiscoveryModel, private readonly surface: Surface, private readonly runtimePolicy: RuntimePolicy) {}

  async run(goal: string, targetUrl: string, options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
    const runId = options.runId ?? `discovery-${randomUUID()}`;
    const evidence = options.evidence ?? new MemoryEvidenceSink();
    const maxSteps = options.maxSteps ?? 20;
    const policy = new PolicyEngine(this.runtimePolicy);
    const trace: RecordedDiscoveryStep[] = [];
    await evidence.append({ timestamp: new Date().toISOString(), runId, type: "run_started", data: { mode: "discovery", targetOrigin: new URL(targetUrl).origin } });
    const initialAction: Action = { type: "navigate", url: { kind: "literal", value: targetUrl } };
    const initialDecision = policy.evaluate(initialAction, "safe", targetUrl);
    if (!initialDecision.allowed) return { status: "stopped", runId, reason: `${initialDecision.code}: ${initialDecision.reason}`, trace };
    await this.surface.perform(initialAction, {}, 15_000);

    for (let stepNumber = 0; stepNumber < maxSteps; stepNumber += 1) {
      const observation = await this.surface.observe();
      const decision = await this.model.decide({
        goal,
        observation,
        stepNumber,
        priorActions: trace.map((step) => ({ actionType: step.action.type, summary: step.summary, resultUrl: step.after.url })),
      });
      await evidence.append({ timestamp: new Date().toISOString(), runId, type: "model_decision", data: { status: decision.status, summary: decision.status === "stuck" ? decision.reason : decision.summary } });
      if (decision.status === "stuck") {
        await evidence.captureScreenshot(`discovery-stuck-${runId}`, observation.screenshot);
        if (!options.handoff) return { status: "stopped", runId, reason: decision.reason, trace };
        const origin = new URL(observation.url).origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const resolution = await options.handoff.requestAndWait({
          runId,
          capabilityId: "discovery-session",
          goal: this.redactGoal(goal),
          reason: decision.reason,
          evidence: evidence.references(),
          resumeCheckpoint: [{ type: "url_matches", pattern: `^${origin}/ops` }],
          inputs: {},
          surface: this.surface,
        });
        if (resolution.status === "aborted") return { status: "stopped", runId, reason: resolution.reason ?? decision.reason, trace };
        await evidence.append({ timestamp: new Date().toISOString(), runId, type: "human_control_resumed", data: { interventionId: resolution.request.id, manualActionCount: resolution.manualActions.length, manualActionsJson: JSON.stringify(resolution.manualActions) } });
        continue;
      }
      if (decision.status === "complete") {
        for (const output of decision.outputs) {
          if (!observation.elements.some((element) => element.elementId === output.elementId)) {
            return { status: "stopped", runId, reason: `completion references unknown output element ${output.elementId}`, trace };
          }
        }
        await evidence.captureScreenshot(`discovery-complete-${runId}`, observation.screenshot);
        await evidence.append({ timestamp: new Date().toISOString(), runId, type: "run_completed", data: { status: "success", mode: "discovery", actionCount: trace.length } });
        return { status: "success", runId, goal, target: targetUrl, trace, completion: decision, finalObservation: observation, modelProvider: this.model.providerName };
      }
      const action = this.toAction(decision, observation);
      const risk = this.riskFor(action);
      const policyDecision = policy.evaluate(action, risk, observation.url);
      if (!policyDecision.allowed) return { status: "stopped", runId, reason: `${policyDecision.code}: ${policyDecision.reason}`, trace };
      await this.surface.perform(action, {}, 15_000);
      const after = await this.surface.observe();
      trace.push({ index: trace.length, summary: decision.summary, action, before: observation, after });
      await evidence.append({ timestamp: new Date().toISOString(), runId, type: "action_completed", data: { actionType: action.type, stepNumber } });
    }
    return { status: "stopped", runId, reason: `maximum discovery steps (${maxSteps}) reached`, trace };
  }

  private toAction(decision: Extract<DiscoveryDecision, { status: "act" }>, observation: Observation): Action {
    if (decision.actionType === "wait") return { type: "wait", durationMs: 750 };
    if (!decision.elementId) throw new Error(`${decision.actionType} decision requires elementId`);
    const element = observation.elements.find((candidate) => candidate.elementId === decision.elementId);
    if (!element) throw new Error(`decision references unknown element ${decision.elementId}`);
    if (!element.interactive || element.disabled) throw new Error(`decision references a non-interactive or disabled element ${decision.elementId}`);
    if (decision.actionType === "click") return { type: "click", target: element.target };
    if (decision.value === null) throw new Error(`${decision.actionType} decision requires a value`);
    const value = { kind: "literal" as const, value: decision.value };
    return decision.actionType === "type" ? { type: "type", target: element.target, value } : { type: "select", target: element.target, value };
  }

  private riskFor(action: Action): "safe" | "sensitive" | "irreversible" {
    if ("target" in action && /submit transfer|delete|close account/i.test(action.target.description)) return "irreversible";
    if (action.type === "type" || action.type === "select") return "sensitive";
    return "safe";
  }

  private redactGoal(goal: string): string {
    return goal.replace(/M-[0-9]{5}/gi, "[REDACTED_MEMBER]").replace(/\$[0-9][0-9,]*(?:\.[0-9]{2})?/g, "[REDACTED_AMOUNT]");
  }
}
