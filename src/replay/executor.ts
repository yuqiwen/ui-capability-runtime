import { randomUUID } from "node:crypto";
import type { Action, Condition } from "../contracts/action.js";
import { capabilitySchema, type Capability } from "../contracts/capability.js";
import type { JsonPrimitive } from "../contracts/common.js";
import type { RunResult } from "../contracts/result.js";
import type { RuntimePolicy } from "../contracts/policy.js";
import type { EvidenceSink } from "../evidence/events.js";
import { MemoryEvidenceSink } from "../evidence/events.js";
import { classifyActionRisk, PolicyEngine } from "../policy/policy-engine.js";
import type { Observation, Surface } from "../surface/surface.js";
import { evaluateValue, SurfaceFailure } from "../surface/surface.js";
import { validateInputs } from "./input-validation.js";
import type { HandoffCoordinator } from "../handoff/coordinator.js";

export interface ReplayOptions {
  runId?: string;
  evidence?: EvidenceSink;
  handoff?: HandoffCoordinator;
  onProgress?: (message: string) => void;
}

export class DeterministicExecutor {
  private readonly capability: Capability;

  constructor(capability: Capability, private readonly surface: Surface, private readonly runtimePolicy: RuntimePolicy) {
    this.capability = capabilitySchema.parse(capability);
  }

  async run(inputs: Record<string, JsonPrimitive>, options: ReplayOptions = {}): Promise<RunResult> {
    const runId = options.runId ?? `replay-${randomUUID()}`;
    const evidence = options.evidence ?? new MemoryEvidenceSink();
    const inputErrors = validateInputs(this.capability, inputs);
    if (inputErrors.length) {
      return { status: "failure", runId, category: "invalid_input", expected: "inputs matching the capability contract", observed: inputErrors.join("; "), retryable: false, evidence: evidence.references() };
    }
    const policy = new PolicyEngine(this.runtimePolicy);
    let fingerprintVerified = false;
    await evidence.append({ timestamp: new Date().toISOString(), runId, type: "run_started", data: { capabilityId: this.capability.id, revision: this.capability.revision } });

    try {
      for (const [stepIndex, step] of this.capability.steps.entries()) {
        options.onProgress?.(`Step ${stepIndex + 1}/${this.capability.steps.length}: ${step.description}`);
        await evidence.append({ timestamp: new Date().toISOString(), runId, type: "step_started", stepId: step.id, data: { description: step.description } });
        if (!fingerprintVerified && step.action.type !== "navigate") {
          const observation = await this.surface.observe();
          const mismatch = this.fingerprintMismatch(observation);
          if (mismatch) return await this.failure(runId, evidence, "target_mismatch", step.id, "the saved application fingerprint", mismatch, false);
          fingerprintVerified = true;
        }
        if (!(await this.allConditions(step.preconditions, inputs, step.timeoutMs))) {
          return await this.failure(runId, evidence, "checkpoint_failed", step.id, "all step preconditions to hold", "one or more preconditions were false", false);
        }
        const current = await this.surface.observe();
        const decision = policy.evaluate(step.action, step.risk, this.policyUrl(step.action, inputs, this.applicationUrl(current)));
        if (!decision.allowed) return await this.failure(runId, evidence, "policy_blocked", step.id, "policy to allow the action", `${decision.code}: ${decision.reason}`, false);

        let completed = false;
        let lastFailure: SurfaceFailure | undefined;
        for (let attempt = 1; attempt <= step.retry.maxAttempts; attempt += 1) {
          try {
            await this.surface.perform(step.action, inputs, step.timeoutMs);
            await evidence.append({ timestamp: new Date().toISOString(), runId, type: "action_completed", stepId: step.id, data: { actionType: step.action.type, attempt } });
            completed = true;
            break;
          } catch (error) {
            if (!(error instanceof SurfaceFailure)) throw error;
            lastFailure = error;
            const retryable = error.retryable && step.retry.retryOn.includes(error.category === "timeout" ? "timeout" : "not_ready");
            if (!retryable || attempt === step.retry.maxAttempts) break;
            if (step.retry.backoffMs) await new Promise((resolve) => setTimeout(resolve, step.retry.backoffMs));
          }
        }
        if (!completed) {
          const failure = lastFailure ?? new SurfaceFailure("surface_error", "action did not complete");
          return await this.failure(runId, evidence, failure.category, step.id, `action ${step.action.type} to complete`, failure.message, failure.retryable);
        }

        if (!fingerprintVerified && step.action.type === "navigate") {
          const observation = await this.surface.observe();
          const mismatch = this.fingerprintMismatch(observation);
          if (mismatch) return await this.failure(runId, evidence, "target_mismatch", step.id, "the saved application fingerprint", mismatch, false);
          fingerprintVerified = true;
          options.onProgress?.("Target fingerprint verified");
          await evidence.append({ timestamp: new Date().toISOString(), runId, type: "condition_checked", stepId: step.id, data: { condition: "target_fingerprint", matched: true } });
        }

        const handled = await this.handleRuntimeStates(runId, step.id, inputs, evidence, policy, options.handoff);
        if (handled) return handled;
        if (!(await this.allConditions(step.postconditions, inputs, step.timeoutMs))) {
          return await this.failure(runId, evidence, "checkpoint_failed", step.id, "all step postconditions to hold", "one or more postconditions were false", false);
        }
      }

      if (!(await this.allConditions(this.capability.successCheckpoint, inputs, 10_000))) {
        return await this.failure(runId, evidence, "checkpoint_failed", undefined, "the capability success checkpoint to hold", "final checkpoint was false", false);
      }
      const outputs: Record<string, JsonPrimitive> = {};
      for (const output of this.capability.contract.outputs) {
        let value: JsonPrimitive = await this.surface.extractText(output.extract.target, output.extract.attribute, 10_000);
        if (output.extract.transform === "trim") value = value.trim();
        else if (output.extract.transform === "money") value = Number(value.replace(/[^0-9.-]/g, ""));
        outputs[output.name] = value;
      }
      const result: RunResult = { status: "success", runId, outputs, evidence: evidence.references() };
      await evidence.append({ timestamp: new Date().toISOString(), runId, type: "run_completed", data: { status: "success" } });
      return result;
    } catch (error) {
      const observed = error instanceof Error ? error.message : String(error);
      return await this.failure(runId, evidence, "surface_error", undefined, "replay to complete", observed, false);
    }
  }

  private fingerprintMismatch(observation: Observation): string | undefined {
    const fingerprint = this.capability.target.fingerprint;
    const titleMatches = new RegExp(fingerprint.titlePattern).test(observation.title);
    const missingText = fingerprint.requiredText.filter((text) => !observation.visibleText.includes(text));
    if (titleMatches && missingText.length === 0) return undefined;
    const reasons = [
      ...(titleMatches ? [] : [`title ${JSON.stringify(observation.title)} does not match ${JSON.stringify(fingerprint.titlePattern)}`]),
      ...(missingText.length ? [`missing required text: ${missingText.join(", ")}`] : []),
    ];
    return reasons.join("; ");
  }

  private async handleRuntimeStates(runId: string, stepId: string, inputs: Record<string, JsonPrimitive>, evidence: EvidenceSink, policy: PolicyEngine, handoff?: HandoffCoordinator): Promise<RunResult | undefined> {
    for (const outcome of this.capability.contract.businessOutcomes) {
      if (await this.allConditions(outcome.when, inputs, 2_000)) {
        const result: RunResult = { status: "business_outcome", runId, code: outcome.code, details: {}, evidence: evidence.references() };
        await evidence.append({ timestamp: new Date().toISOString(), runId, type: "run_completed", stepId, data: { status: "business_outcome", code: outcome.code } });
        return result;
      }
    }
    for (const recovery of this.capability.runtimeHandlers.recoveries) {
      if (!(await this.allConditions(recovery.when, inputs, 2_000))) continue;
      await evidence.append({ timestamp: new Date().toISOString(), runId, type: "recovery_started", stepId, data: { code: recovery.code } });
      for (let attempt = 1; attempt <= recovery.maxAttempts; attempt += 1) {
        let actionsSucceeded = true;
        for (const action of recovery.actions) {
          const observation = await this.surface.observe();
          const decision = policy.evaluate(action, classifyActionRisk(action, this.runtimePolicy.blockedTargetTextPatterns), this.policyUrl(action, inputs, this.applicationUrl(observation)));
          if (!decision.allowed) return await this.failure(runId, evidence, "policy_blocked", stepId, "policy to allow recovery action", decision.reason, false);
          try {
            await this.surface.perform(action, inputs, 10_000);
          } catch {
            actionsSucceeded = false;
            break;
          }
        }
        if (actionsSucceeded && await this.allConditions(recovery.postconditions, inputs, 10_000)) {
          await evidence.append({ timestamp: new Date().toISOString(), runId, type: "recovery_completed", stepId, data: { code: recovery.code, attempt } });
          return undefined;
        }
      }
      return await this.failure(runId, evidence, "checkpoint_failed", stepId, `recovery ${recovery.code} to reach its checkpoint`, "recovery attempts were exhausted", false);
    }
    for (const intervention of this.capability.runtimeHandlers.interventions) {
      if (!(await this.allConditions(intervention.when, inputs, 2_000))) continue;
      const observation = await this.surface.observe();
      const reference = await evidence.captureScreenshot(`intervention-${runId}`, observation.screenshot);
      const interventionId = `intervention-${randomUUID()}`;
      await evidence.append({ timestamp: new Date().toISOString(), runId, type: "intervention_requested", stepId, data: { interventionId, code: intervention.code, evidencePath: reference.path } });
      if (handoff) {
        const resolution = await handoff.requestAndWait({
          interventionId,
          runId,
          capabilityId: this.capability.id,
          goal: this.capability.discovery.goal,
          reason: intervention.reason,
          stepId,
          evidence: evidence.references(),
          resumeCheckpoint: intervention.resumeCheckpoint,
          inputs,
          surface: this.surface,
        });
        if (resolution.status === "resumed") {
          await evidence.append({ timestamp: new Date().toISOString(), runId, type: "human_control_resumed", stepId, data: { interventionId: resolution.request.id, manualActionCount: resolution.manualActions.length, manualActionsJson: JSON.stringify(resolution.manualActions) } });
          return undefined;
        }
        return { status: "escalated", runId, interventionId: resolution.request.id, reason: resolution.reason ?? intervention.reason, stepId, evidence: evidence.references() };
      }
      return { status: "escalated", runId, interventionId, reason: intervention.reason, stepId, evidence: evidence.references() };
    }
    return undefined;
  }

  private async allConditions(conditions: Condition[], inputs: Record<string, JsonPrimitive>, timeoutMs: number): Promise<boolean> {
    for (const condition of conditions) if (!(await this.surface.check(condition, inputs, timeoutMs))) return false;
    return true;
  }

  private applicationUrl(observation: { url: string }): string {
    return observation.url;
  }

  private policyUrl(action: Action, inputs: Record<string, JsonPrimitive>, currentUrl: string): string {
    return action.type === "navigate" ? String(evaluateValue(action.url, inputs)) : currentUrl;
  }

  private async failure(runId: string, evidence: EvidenceSink, category: Extract<RunResult, { status: "failure" }>["category"] | SurfaceFailure["category"], stepId: string | undefined, expected: string, observed: string, retryable: boolean): Promise<RunResult> {
    const observation = await this.surface.observe().catch(() => undefined);
    if (observation) await evidence.captureScreenshot(`failure-${runId}`, observation.screenshot);
    const normalizedCategory = category === "surface_error" || category === "timeout" || category === "locator_not_found" || category === "locator_ambiguous" ? category : category;
    const result: RunResult = { status: "failure", runId, category: normalizedCategory, ...(stepId ? { stepId } : {}), expected, observed, retryable, evidence: evidence.references() };
    await evidence.append({ timestamp: new Date().toISOString(), runId, type: "run_completed", ...(stepId ? { stepId } : {}), data: { status: "failure", category: normalizedCategory, observed } });
    return result;
  }
}
