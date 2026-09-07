import { describe, expect, it } from "vitest";
import { ApplicationProfileRegistry, createGenericDiscoveryProfile } from "../src/artifact/application-profiles.js";
import { applicationProfileRegistry } from "../src/profiles/registry.js";
import type { Observation } from "../src/surface/surface.js";

function observation(title: string, visibleText: string): Observation {
  return { url: "https://example.test/start", title, visibleText, elements: [], screenshot: Buffer.from([]) };
}

describe("application profile registry", () => {
  it("uses a target-derived generic policy before the application is identified", () => {
    const profile = createGenericDiscoveryProfile("https://example.test/start");
    expect(profile.applicationFamily).toBe("web-example-test-start");
    expect(profile.allowedOrigins).toEqual(["https://example.test"]);
    expect(profile.allowedRoutePatterns).toEqual(["^/"]);
    expect(profile.businessOutcomes).toEqual([]);
  });

  it("selects a specialized profile from the application actually observed", () => {
    const resolved = applicationProfileRegistry.resolve(
      "http://127.0.0.1:4310/ops",
      observation("Northstar Credit Union Operations", "Member Services\nMember Search"),
    );
    expect(resolved).toMatchObject({ providerId: "northstar-ops", specialized: true });
    expect(resolved.profile.applicationFamily).toBe("northstar-ops");
    expect(resolved.profile.businessOutcomes.map((outcome) => outcome.code)).toContain("MEMBER_NOT_FOUND");
  });

  it("falls back to a learned generic web profile for an unknown application", () => {
    const resolved = applicationProfileRegistry.resolve(
      "https://orders.example.test/workbench",
      observation("Order Workbench (US)", "Search orders"),
    );
    expect(resolved).toMatchObject({ providerId: "generic-web", specialized: false });
    expect(resolved.profile.applicationFamily).toBe("web-orders-example-test-workbench");
    expect(resolved.profile.titlePattern).toBe("^Order Workbench \\(US\\)$");
    expect(resolved.profile.allowedOrigins).toEqual(["https://orders.example.test"]);
    expect(resolved.profile.runtimeHandlers).toEqual({ recoveries: [], interventions: [] });
  });

  it("rejects ambiguous profile matches instead of picking one silently", () => {
    const provider = (id: string) => ({
      id,
      matches: () => true,
      create: () => createGenericDiscoveryProfile("https://example.test/start"),
    });
    const registry = new ApplicationProfileRegistry([provider("one"), provider("two")]);
    expect(() => registry.resolve("https://example.test/start", observation("Example", "Ready"))).toThrow(/multiple application profiles matched/);
  });
});
