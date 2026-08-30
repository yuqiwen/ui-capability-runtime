import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createRuntimePolicy, createSampleCapability } from "../src/artifact/sample-capability.js";
import { MemoryEvidenceSink } from "../src/evidence/events.js";
import { DeterministicExecutor } from "../src/replay/executor.js";
import { HandoffCoordinator } from "../src/handoff/coordinator.js";
import { BrowserSurface } from "../src/surface/browser-surface.js";
import { createTargetApp, type TargetAppOptions } from "../src/target/app.js";

let server: Server | undefined;
let surface: BrowserSurface | undefined;

afterEach(async () => {
  await surface?.close();
  surface = undefined;
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
  server = undefined;
});

async function replay(options: TargetAppOptions, memberId: string, amount = 125.5, handoff?: HandoffCoordinator) {
  const app = createTargetApp(options);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server!.address();
  if (!address || typeof address === "string") throw new Error("replay test server did not expose a TCP port");
  const entryPoint = `http://127.0.0.1:${address.port}/ops`;
  const capability = createSampleCapability(entryPoint);
  const evidence = new MemoryEvidenceSink();
  surface = await BrowserSurface.launch();
  const executor = new DeterministicExecutor(capability, surface, createRuntimePolicy(capability));
  const result = await executor.run(
    { "member-id": memberId, "from-account": "checking", "to-account": "savings", amount },
    { runId: `test-${options.forcedScenario ?? "happy"}-${memberId.toLowerCase()}`, evidence, ...(handoff ? { handoff } : {}) },
  );
  return { result, evidence };
}

describe("deterministic browser replay", () => {
  it("replays the capability without a model and extracts typed outputs", async () => {
    const { result } = await replay({ forcedScenario: "happy" }, "M-10042");
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.outputs).toMatchObject({
      "member-name": "Ava Patel",
      "from-account-masked": "••••1044",
      "to-account-masked": "••••7782",
      amount: 125.5,
      fee: 0,
    });
    expect(String(result.outputs["review-reference"])).toMatch(/^RVW-[A-F0-9]{8}$/);
  }, 15_000);

  it("returns member-not-found as a business outcome", async () => {
    const { result } = await replay({ forcedScenario: "happy" }, "M-99999");
    expect(result).toMatchObject({ status: "business_outcome", code: "MEMBER_NOT_FOUND" });
  });

  it("executes a declared bounded recovery for a transient condition", async () => {
    const { result, evidence } = await replay({ forcedScenario: "transient" }, "M-20081", 75);
    expect(result.status).toBe("success");
    expect(evidence.events.some((event) => event.type === "recovery_completed" && event.data.code === "TRANSIENT_VALIDATION_DELAY")).toBe(true);
  });

  it("escalates a declared permission condition with screenshot evidence", async () => {
    const { result } = await replay({ forcedScenario: "permission" }, "M-30077", 80);
    expect(result.status).toBe("escalated");
    if (result.status !== "escalated") return;
    expect(result.reason).toContain("supervisor");
    expect(result.evidence[0]?.kind).toBe("screenshot");
  });

  it("cedes the same live session to a human and resumes after a verified checkpoint", async () => {
    const handoff = new HandoffCoordinator(async (request, coordinator) => {
      coordinator.takeControl(request.id);
      const workspace = surface!.page.frameLocator('iframe[name="member-workspace"]');
      await workspace.getByRole("link", { name: "Apply Supervisor Override", exact: true }).click();
      await coordinator.resume(request.id);
    });
    const { result, evidence } = await replay({ forcedScenario: "permission" }, "M-30077", 80, handoff);
    expect(result.status).toBe("success");
    const resumed = evidence.events.find((event) => event.type === "human_control_resumed");
    expect(Number(resumed?.data.manualActionCount)).toBeGreaterThan(0);
  });
});
