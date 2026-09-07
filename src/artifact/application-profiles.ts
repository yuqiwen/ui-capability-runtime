import type { Observation } from "../surface/surface.js";
import type { CompilationProfile } from "./compiler.js";

export interface ApplicationProfileProvider {
  id: string;
  matches(entryPoint: string, observation: Observation): boolean;
  create(entryPoint: string): CompilationProfile;
}

export interface ResolvedApplicationProfile {
  providerId: string;
  specialized: boolean;
  profile: CompilationProfile;
}

export class ApplicationProfileRegistry {
  constructor(private readonly providers: ApplicationProfileProvider[] = []) {}

  resolve(entryPoint: string, observation: Observation): ResolvedApplicationProfile {
    const matching = this.providers.filter((provider) => provider.matches(entryPoint, observation));
    if (matching.length > 1) throw new Error(`multiple application profiles matched the observed target: ${matching.map((provider) => provider.id).join(", ")}`);
    const provider = matching[0];
    if (provider) return { providerId: provider.id, specialized: true, profile: provider.create(entryPoint) };
    return { providerId: "generic-web", specialized: false, profile: createGenericWebProfile(entryPoint, observation) };
  }
}

export function createGenericDiscoveryProfile(entryPoint: string): CompilationProfile {
  return createGenericWebProfile(entryPoint);
}

export function createGenericWebProfile(entryPoint: string, observation?: Observation): CompilationProfile {
  const parsed = new URL(entryPoint);
  const applicationFamily = `web-${`${parsed.hostname}-${parsed.pathname.split("/").filter(Boolean)[0] ?? "root"}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
  const observedTitle = observation?.title.trim();
  return {
    applicationFamily,
    titlePattern: observedTitle ? `^${escapeRegExp(observedTitle)}$` : ".*",
    requiredText: [],
    allowedOrigins: [parsed.origin],
    allowedRoutePatterns: ["^/"],
    allowedActionTypes: ["navigate", "click", "type", "select", "wait"],
    maximumAutomatedRisk: "sensitive",
    blockedTargetTextPatterns: [
      "delete",
      "close account",
      "submit transfer",
      "transfer funds",
      "send payment",
      "confirm purchase",
      "place order",
      "publish",
      "approve transaction",
    ],
    businessOutcomes: [],
    runtimeHandlers: { recoveries: [], interventions: [] },
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
