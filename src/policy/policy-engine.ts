import type { Action, CapabilityStep } from "../contracts/action.js";
import type { RuntimePolicy } from "../contracts/policy.js";

export interface PolicyDecision {
  allowed: boolean;
  code: "ALLOW" | "ORIGIN_BLOCKED" | "ROUTE_BLOCKED" | "ACTION_BLOCKED" | "RISK_BLOCKED" | "TARGET_BLOCKED";
  reason: string;
}

const riskRank = { safe: 0, sensitive: 1, irreversible: 2 } as const;

export class PolicyEngine {
  constructor(private readonly policy: RuntimePolicy) {}

  evaluate(action: Action, risk: CapabilityStep["risk"], effectiveUrl: string): PolicyDecision {
    if (!this.policy.allowedActionTypes.includes(action.type)) return { allowed: false, code: "ACTION_BLOCKED", reason: `action ${action.type} is not allowed` };
    if (riskRank[risk] > riskRank[this.policy.maximumAutomatedRisk]) return { allowed: false, code: "RISK_BLOCKED", reason: `${risk} action exceeds automated risk ceiling ${this.policy.maximumAutomatedRisk}` };
    let url: URL;
    try {
      url = new URL(effectiveUrl);
    } catch {
      return { allowed: false, code: "ORIGIN_BLOCKED", reason: `invalid effective URL ${effectiveUrl}` };
    }
    if (!this.policy.allowedOrigins.includes(url.origin)) return { allowed: false, code: "ORIGIN_BLOCKED", reason: `origin ${url.origin} is not allowed` };
    if (!this.policy.allowedRoutePatterns.some((pattern) => new RegExp(pattern).test(url.pathname))) return { allowed: false, code: "ROUTE_BLOCKED", reason: `route ${url.pathname} is not allowed` };
    if ("target" in action) {
      const description = action.target.description;
      if (this.policy.blockedTargetTextPatterns.some((pattern) => new RegExp(pattern, "i").test(description))) {
        return { allowed: false, code: "TARGET_BLOCKED", reason: `target ${description} matches a blocked pattern` };
      }
    }
    return { allowed: true, code: "ALLOW", reason: "action is permitted" };
  }
}

export function classifyActionRisk(action: Action, blockedTargetTextPatterns: string[]): CapabilityStep["risk"] {
  if ("target" in action && blockedTargetTextPatterns.some((pattern) => new RegExp(pattern, "i").test(action.target.description))) {
    return "irreversible";
  }
  if (action.type === "type" || action.type === "select") return "sensitive";
  return "safe";
}
