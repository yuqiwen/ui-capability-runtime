import type { EvidenceReference, JsonPrimitive } from "../contracts/common.js";

export type RunEventType = "run_started" | "step_started" | "model_decision" | "action_completed" | "condition_checked" | "recovery_started" | "recovery_completed" | "intervention_requested" | "human_control_resumed" | "run_completed";


export interface RunEvent {
  timestamp: string;
  runId: string;
  type: RunEventType;
  stepId?: string;
  data: Record<string, JsonPrimitive>;
}

export interface EvidenceSink {
  append(event: RunEvent): Promise<void>;
  captureScreenshot(label: string, screenshot: Buffer): Promise<EvidenceReference>;
  references(): EvidenceReference[];
}

export class MemoryEvidenceSink implements EvidenceSink {
  readonly events: RunEvent[] = [];
  private readonly refs: EvidenceReference[] = [];

  async append(event: RunEvent): Promise<void> {
    this.events.push(event);
  }

  async captureScreenshot(label: string, _screenshot: Buffer): Promise<EvidenceReference> {
    const reference: EvidenceReference = { kind: "screenshot", path: `memory://${label}` };
    this.refs.push(reference);
    return reference;
  }

  references(): EvidenceReference[] {
    return [...this.refs];
  }
}
