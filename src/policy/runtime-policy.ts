import type { Capability } from "../contracts/capability.js";
import type { RuntimePolicy } from "../contracts/policy.js";

export function runtimePolicyFor(capability: Capability): RuntimePolicy {
  return {
    id: `${capability.id}-runtime-policy`,
    allowedOrigins: capability.target.allowedOrigins,
    allowedRoutePatterns: capability.policy.allowedRoutePatterns,
    allowedActionTypes: capability.policy.allowedActionTypes,
    maximumAutomatedRisk: capability.policy.maximumAutomatedRisk,
    redactInputNames: capability.contract.inputs.filter((input) => input.sensitive).map((input) => input.name),
    blockedTargetTextPatterns: capability.policy.blockedTargetTextPatterns,
  };
}
