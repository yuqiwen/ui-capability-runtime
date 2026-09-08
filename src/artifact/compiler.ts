import type { Action, Condition } from "../contracts/action.js";
import { capabilitySchema, type Capability } from "../contracts/capability.js";
import type { JsonPrimitive } from "../contracts/common.js";
import type { CompilationProposal, DiscoveryModel } from "../agent/model.js";
import type { SuccessfulDiscovery } from "../agent/discovery-agent.js";
import { classifyActionRisk } from "../policy/policy-engine.js";

export interface CompilationProfile {
  applicationFamily: string;
  titlePattern: string;
  requiredText: string[];
  allowedOrigins: string[];
  allowedRoutePatterns: string[];
  allowedActionTypes: Capability["policy"]["allowedActionTypes"];
  maximumAutomatedRisk: Capability["policy"]["maximumAutomatedRisk"];
  blockedTargetTextPatterns: string[];
  businessOutcomes: Capability["contract"]["businessOutcomes"];
  runtimeHandlers: Capability["runtimeHandlers"];
  inputSchemaOverrides?: Record<string, Capability["contract"]["inputs"][number]["schema"]>;
  inputCanonicalizations?: Array<{
    canonicalName: string;
    namePattern: RegExp;
  }>;
}

export class CapabilityCompiler {
  constructor(private readonly model: DiscoveryModel) {}

  async compile(discovery: SuccessfulDiscovery, profile: CompilationProfile): Promise<Capability> {
    const rawProposal = await this.model.proposeCompilation({
      goal: discovery.goal,
      trace: discovery.trace.map((step) => {
        const targetDescription = this.targetDescription(step.action);
        const concreteValue = this.concreteValue(step.action);
        return {
          index: step.index,
          actionType: step.action.type,
          ...(targetDescription !== undefined ? { targetDescription } : {}),
          ...(concreteValue !== undefined ? { concreteValue: String(concreteValue) } : {}),
          beforeText: step.before.visibleText.slice(0, 5_000),
          afterText: step.after.visibleText.slice(0, 5_000),
        };
      }),
    });
    const proposal = this.canonicalizeProposal(rawProposal, profile);
    this.validateProposalCoverage(proposal, discovery);

    const inputs = proposal.inputs.map((input) => {
      const sensitive = this.isSensitiveInput(input);
      return {
        name: input.name,
        description: input.description,
        required: true,
        sensitive,
        schema: profile.inputSchemaOverrides?.[input.name] ?? this.inputSchema(input),
        provenance: {
          source: this.goalContains(discovery.goal, input.sampleValue) ? "goal_span" as const : "compiler_inference" as const,
          sampleValueRedacted: sensitive ? this.redactSample(input.sampleValue, input.type) : String(input.sampleValue),
          confidence: this.goalContains(discovery.goal, input.sampleValue) ? 0.99 : 0.8,
        },
      };
    });

    const proposedStepByIndex = new Map(proposal.steps.map((step) => [step.traceIndex, step]));
    const executableSteps = discovery.trace.map((recorded) => {
      const proposed = proposedStepByIndex.get(recorded.index)!;
      const postconditions: Condition[] = [];
      if (proposed.checkpointText) {
        if (!recorded.after.visibleText.includes(proposed.checkpointText)) throw new Error(`compiler proposed checkpoint text not observed after trace step ${recorded.index}`);
        postconditions.push({ type: "page_contains", value: { kind: "literal", value: proposed.checkpointText } });
      }
      const action = this.parameterize(recorded.action, proposal);
      return {
        id: `step-${String(recorded.index + 1).padStart(2, "0")}`,
        description: proposed.description,
        action,
        preconditions: [],
        postconditions,
        timeoutMs: 10_000,
        retry: { maxAttempts: action.type === "navigate" ? 2 : 1, backoffMs: 100, retryOn: action.type === "navigate" ? ["timeout" as const, "transient_navigation" as const] : [] },
        risk: classifyActionRisk(action, profile.blockedTargetTextPatterns),
      };
    });

    const outputs = discovery.completion.outputs.map((output) => {
      const element = discovery.finalObservation.elements.find((candidate) => candidate.elementId === output.elementId);
      if (!element) throw new Error(`output ${output.name} references missing final element ${output.elementId}`);
      const extractionTarget = structuredClone(element.target);
      const description = this.outputDescription(output.name);
      extractionTarget.description = description;
      extractionTarget.candidates = extractionTarget.candidates.filter((candidate) => candidate.strategy === "css" || candidate.strategy === "label");
      if (!extractionTarget.candidates.length) throw new Error(`output ${output.name} has no value-independent extraction locator`);
      return {
        name: output.name,
        description,
        schema: output.type === "money" ? { type: "money" as const, currency: "USD" } : { type: "string" as const },
        extract: { target: extractionTarget, attribute: "text" as const, transform: output.type === "money" ? "money" as const : "trim" as const },
      };
    });
    const successCheckpoint: Condition[] = outputs.slice(0, 2).map((output) => ({ type: "visible", target: output.extract.target }));
    // A checkpoint can remain true immediately after an intermediate step but
    // disappear before the workflow finishes. Only promote text that is still
    // present in the final observation into the capability-wide checkpoint.
    const finalCheckpointText = [...proposal.steps]
      .reverse()
      .map((step) => step.checkpointText)
      .find((checkpointText): checkpointText is string => Boolean(checkpointText && discovery.finalObservation.visibleText.includes(checkpointText)));
    if (finalCheckpointText) successCheckpoint.unshift({ type: "page_contains", value: { kind: "literal", value: finalCheckpointText } });

    return capabilitySchema.parse({
      schemaVersion: "1.0",
      id: proposal.id,
      name: proposal.name,
      description: proposal.description,
      revision: 1,
      status: "draft",
      createdAt: new Date().toISOString(),
      target: {
        applicationFamily: profile.applicationFamily,
        entryPoint: discovery.target,
        allowedOrigins: profile.allowedOrigins,
        fingerprint: { titlePattern: profile.titlePattern, requiredText: profile.requiredText },
        tenantProfiles: [],
      },
      contract: { inputs, outputs, businessOutcomes: profile.businessOutcomes },
      runtimeHandlers: profile.runtimeHandlers,
      policy: {
        allowedActionTypes: profile.allowedActionTypes,
        maximumAutomatedRisk: profile.maximumAutomatedRisk,
        allowedRoutePatterns: profile.allowedRoutePatterns,
        blockedTargetTextPatterns: profile.blockedTargetTextPatterns,
      },
      steps: [
        {
          id: "open-application",
          description: "Open the approved target entry point",
          action: { type: "navigate", url: { kind: "literal", value: discovery.target } },
          preconditions: [],
          postconditions: [],
          timeoutMs: 15_000,
          retry: { maxAttempts: 2, backoffMs: 250, retryOn: ["timeout", "transient_navigation"] },
          risk: "safe",
        },
        ...executableSteps,
      ],
      successCheckpoint,
      discovery: {
        goal: this.parameterizedGoal(discovery.goal, proposal),
        runId: discovery.runId,
        evidenceLog: `evidence/runs/${discovery.runId}/run.jsonl`,
        compiler: `${this.model.providerName}:capability-compiler-v1`,
      },
    });
  }

  private canonicalizeProposal(proposal: CompilationProposal, profile: CompilationProfile): CompilationProposal {
    const inputs = proposal.inputs.map((input) => {
      const rule = profile.inputCanonicalizations?.find((candidate) => candidate.namePattern.test(input.name));
      return rule ? { ...input, name: rule.canonicalName } : input;
    });
    const names = inputs.map((input) => input.name);
    const duplicate = names.find((name, index) => names.indexOf(name) !== index);
    if (duplicate) throw new Error(`compiler inputs collapse to duplicate canonical name ${duplicate}`);
    return { ...proposal, inputs };
  }

  private validateProposalCoverage(proposal: CompilationProposal, discovery: SuccessfulDiscovery): void {
    const indexes = proposal.steps.map((step) => step.traceIndex);
    if (new Set(indexes).size !== indexes.length) throw new Error("compiler proposal contains duplicate trace indexes");
    const expected = discovery.trace.map((step) => step.index);
    if (indexes.length !== expected.length || expected.some((index) => !indexes.includes(index))) throw new Error("compiler proposal must describe every successful trace step exactly once");
  }

  private parameterize(action: Action, proposal: CompilationProposal): Action {
    const clone = structuredClone(action);
    if (!("value" in clone) || clone.value.kind !== "literal") return clone;
    const literalValue = clone.value.value;
    const matches = proposal.inputs.filter((input) => this.valuesEquivalent(input.sampleValue, literalValue));
    if (matches.length > 1) throw new Error(`literal ${String(literalValue)} ambiguously matches multiple proposed inputs`);
    if (matches.length === 1) clone.value = { kind: "input", name: matches[0]!.name };
    return clone;
  }

  private valuesEquivalent(left: JsonPrimitive, right: JsonPrimitive): boolean {
    if (typeof left === "number" || typeof right === "number") {
      const leftNumber = Number(String(left).replace(/[$,]/g, ""));
      const rightNumber = Number(String(right).replace(/[$,]/g, ""));
      return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber;
    }
    return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
  }

  private inputSchema(input: CompilationProposal["inputs"][number]): Capability["contract"]["inputs"][number]["schema"] {
    if (input.type === "money") return { type: "money", currency: "USD", minimum: 0.01 };
    if (input.type === "number") return { type: "number" };
    if (input.type === "enum") {
      if (!input.enumValues.length) throw new Error(`enum input ${input.name} requires enumValues`);
      return { type: "enum", values: input.enumValues };
    }
    if (input.type === "boolean") return { type: "boolean" };
    return { type: "string" };
  }

  private goalContains(goal: string, value: JsonPrimitive): boolean {
    const normalizedGoal = goal.toLowerCase().replace(/[$,]/g, "");
    const normalizedValue = String(value).toLowerCase().replace(/[$,]/g, "");
    return normalizedGoal.includes(normalizedValue);
  }

  private isSensitiveInput(input: CompilationProposal["inputs"][number]): boolean {
    if (input.sensitive || input.type === "money") return true;
    return /(?:member|customer|client|user)[-_ ]*(?:id|number|identifier)|account[-_ ]*(?:id|number)|routing|ssn|social security|password|passcode|token|secret/i
      .test(`${input.name} ${input.description}`);
  }

  private redactSample(value: JsonPrimitive, type: CompilationProposal["inputs"][number]["type"]): string {
    if (type === "money") return "$***.**";
    const text = String(value);
    if (text.length <= 2) return "**";
    return `${text[0]}${"*".repeat(Math.min(text.length - 2, 6))}${text.at(-1)}`;
  }

  private outputDescription(name: string): string {
    const words = name.split("-").join(" ");
    return `${words[0]!.toUpperCase()}${words.slice(1)} captured at the learned success checkpoint`;
  }

  private parameterizedGoal(goal: string, proposal: CompilationProposal): string {
    let parameterized = goal;
    const inputs = [...proposal.inputs].sort((left, right) => String(right.sampleValue).length - String(left.sampleValue).length);
    for (const input of inputs) {
      const literal = String(input.sampleValue);
      if (input.type === "money" && typeof input.sampleValue === "number") {
        const fixed = input.sampleValue.toFixed(2).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        parameterized = parameterized.replace(new RegExp(`\\$?${fixed}`, "gi"), `{{${input.name}}}`);
      }
      const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      parameterized = parameterized.replace(new RegExp(escaped, "gi"), `{{${input.name}}}`);
    }
    return parameterized;
  }

  private targetDescription(action: Action): string | undefined {
    return "target" in action ? action.target.description : undefined;
  }

  private concreteValue(action: Action): JsonPrimitive | undefined {
    return "value" in action && action.value.kind === "literal" ? action.value.value : undefined;
  }

}
