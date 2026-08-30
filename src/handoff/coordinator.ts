import { randomUUID } from "node:crypto";
import type { Condition } from "../contracts/action.js";
import type { EvidenceReference, JsonPrimitive } from "../contracts/common.js";
import { interventionRequestSchema, type InterventionRequest } from "../contracts/intervention.js";
import type { HumanActionRecord, Surface } from "../surface/surface.js";

export interface HandoffResolution {
  status: "resumed" | "aborted";
  request: InterventionRequest;
  manualActions: HumanActionRecord[];
  reason?: string;
}

interface PendingHandoff {
  request: InterventionRequest;
  surface: Surface;
  inputs: Record<string, JsonPrimitive>;
  resumeCheckpoint: Condition[];
  resolve: (resolution: HandoffResolution) => void;
}

export interface RequestHandoffArgs {
  interventionId?: string;
  runId: string;
  capabilityId: string;
  goal: string;
  reason: string;
  stepId?: string;
  evidence: EvidenceReference[];
  resumeCheckpoint: Condition[];
  inputs: Record<string, JsonPrimitive>;
  surface: Surface;
}

export type HandoffRequestedCallback = (request: InterventionRequest, coordinator: HandoffCoordinator) => void | Promise<void>;

export class HandoffCoordinator {
  private readonly requests = new Map<string, PendingHandoff>();

  constructor(private readonly onRequested?: HandoffRequestedCallback) {}

  async requestAndWait(args: RequestHandoffArgs): Promise<HandoffResolution> {
    const id = args.interventionId ?? `intervention-${randomUUID()}`;
    const request = interventionRequestSchema.parse({
      schemaVersion: "1.0",
      id,
      runId: args.runId,
      capabilityId: args.capabilityId,
      goal: args.goal,
      status: "requested",
      controller: "none",
      reason: args.reason,
      ...(args.stepId ? { stepId: args.stepId } : {}),
      requestedAt: new Date().toISOString(),
      evidence: args.evidence,
      resumeCheckpointDescription: args.resumeCheckpoint.map((condition) => condition.type).join(", "),
    });
    await args.surface.beginHumanControl();
    const resolution = new Promise<HandoffResolution>((resolve) => {
      this.requests.set(id, { request, surface: args.surface, inputs: args.inputs, resumeCheckpoint: args.resumeCheckpoint, resolve });
    });
    if (this.onRequested) {
      Promise.resolve(this.onRequested(request, this)).catch((error: unknown) => {
        void this.abort(id, error instanceof Error ? error.message : String(error));
      });
    }
    return resolution;
  }

  list(): InterventionRequest[] {
    return [...this.requests.values()].map((pending) => structuredClone(pending.request));
  }

  get(id: string): InterventionRequest | undefined {
    const pending = this.requests.get(id);
    return pending ? structuredClone(pending.request) : undefined;
  }

  takeControl(id: string): InterventionRequest {
    const pending = this.required(id);
    if (pending.request.status !== "requested") throw new Error(`intervention ${id} cannot be taken from status ${pending.request.status}`);
    pending.request = { ...pending.request, status: "human_active", controller: "human" };
    return structuredClone(pending.request);
  }

  async resume(id: string): Promise<HandoffResolution> {
    const pending = this.required(id);
    if (pending.request.status !== "human_active") throw new Error(`intervention ${id} cannot resume from status ${pending.request.status}`);
    pending.request = { ...pending.request, status: "resume_requested", controller: "none" };
    const manualActions = await pending.surface.endHumanControl();
    for (const condition of pending.resumeCheckpoint) {
      if (!(await pending.surface.check(condition, pending.inputs, 10_000))) {
        pending.request = { ...pending.request, status: "human_active", controller: "human" };
        await pending.surface.beginHumanControl();
        throw new Error(`resume checkpoint failed for intervention ${id}`);
      }
    }
    pending.request = { ...pending.request, status: "resolved", controller: "automation" };
    const result: HandoffResolution = { status: "resumed", request: structuredClone(pending.request), manualActions };
    this.requests.delete(id);
    pending.resolve(result);
    return result;
  }

  async abort(id: string, reason = "human operator aborted the run"): Promise<HandoffResolution> {
    const pending = this.required(id);
    const manualActions = await pending.surface.endHumanControl();
    pending.request = { ...pending.request, status: "aborted", controller: "none" };
    const result: HandoffResolution = { status: "aborted", request: structuredClone(pending.request), manualActions, reason };
    this.requests.delete(id);
    pending.resolve(result);
    return result;
  }

  private required(id: string): PendingHandoff {
    const pending = this.requests.get(id);
    if (!pending) throw new Error(`unknown intervention ${id}`);
    return pending;
  }
}
