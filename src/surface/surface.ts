import type { Action, Condition } from "../contracts/action.js";
import type { JsonPrimitive } from "../contracts/common.js";

export interface InteractiveElement {
  elementId: string;
  frameName?: string;
  tag: string;
  role?: string;
  name: string;
  type?: string;
  value?: string;
  options?: Array<{ value: string; label: string }>;
  interactive: boolean;
  disabled: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
  target: Extract<Action, { type: "click" }>["target"];
}

export interface Observation {
  url: string;
  title: string;
  visibleText: string;
  elements: InteractiveElement[];
  screenshot: Buffer;
}

export interface ActionResult {
  url: string;
  title: string;
}

export interface HumanActionRecord {
  timestamp: string;
  kind: "click" | "change" | "navigation";
  frameName?: string;
  target?: string;
  value?: "[REDACTED]";
  url?: string;
}

export interface Surface {
  observe(): Promise<Observation>;
  perform(action: Action, inputs: Record<string, JsonPrimitive>, timeoutMs: number): Promise<ActionResult>;
  check(condition: Condition, inputs: Record<string, JsonPrimitive>, timeoutMs: number): Promise<boolean>;
  extractText(target: Extract<Action, { type: "click" }>['target'], attribute: "text" | "value", timeoutMs: number): Promise<string>;
  beginHumanControl(): Promise<void>;
  endHumanControl(): Promise<HumanActionRecord[]>;
  close(): Promise<void>;
}

export class SurfaceFailure extends Error {
  constructor(
    readonly category: "locator_not_found" | "locator_ambiguous" | "timeout" | "surface_error",
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "SurfaceFailure";
  }
}

export function evaluateValue(expression: { kind: "input"; name: string } | { kind: "literal"; value: JsonPrimitive }, inputs: Record<string, JsonPrimitive>): JsonPrimitive {
  if (expression.kind === "literal") return expression.value;
  if (!(expression.name in inputs)) throw new SurfaceFailure("surface_error", `missing input ${expression.name}`);
  return inputs[expression.name] ?? null;
}
