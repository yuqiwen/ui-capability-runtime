import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRuntimePolicy } from "../src/artifact/sample-capability.js";
import { capabilitySchema } from "../src/contracts/capability.js";
import { FileEvidenceSink } from "../src/evidence/file-sink.js";
import { HandoffCoordinator } from "../src/handoff/coordinator.js";
import { DeterministicExecutor } from "../src/replay/executor.js";
import { BrowserSurface } from "../src/surface/browser-surface.js";

const artifactPath = resolve(process.argv[2] ?? "evidence/prepare-internal-transfer.v1.json");
const capability = capabilitySchema.parse(JSON.parse(await readFile(artifactPath, "utf8")));
const runId = `replay-handoff-demo-${randomUUID()}`;
const surface = await BrowserSurface.launch();
const evidence = new FileEvidenceSink(resolve("evidence"), runId);
const handoff = new HandoffCoordinator(async (request, coordinator) => {
  coordinator.takeControl(request.id);
  const workspace = surface.page.frameLocator('iframe[name="member-workspace"]');
  await workspace.getByRole("link", { name: "Apply Supervisor Override", exact: true }).click();
  await coordinator.resume(request.id);
});

try {
  const result = await new DeterministicExecutor(capability, surface, createRuntimePolicy(capability)).run({
    "member-number": "M-30077",
    "from-account": "checking",
    "to-account": "savings",
    "transfer-amount": 80,
  }, { runId, evidence, handoff });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "success") process.exitCode = 2;
} finally {
  await surface.close();
}
