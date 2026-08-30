import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileEvidenceSink } from "../src/evidence/file-sink.js";
import { PolicyEngine } from "../src/policy/policy-engine.js";

const policy = new PolicyEngine({
  id: "test-policy",
  allowedOrigins: ["http://127.0.0.1:4310"],
  allowedRoutePatterns: ["^/ops"],
  allowedActionTypes: ["navigate", "click", "type", "select", "wait"],
  maximumAutomatedRisk: "sensitive",
  redactInputNames: ["member-id", "amount"],
  blockedTargetTextPatterns: ["Submit Transfer"],
});

describe("policy engine", () => {
  it("blocks irreversible submission before the surface is called", () => {
    const decision = policy.evaluate({
      type: "click",
      target: { description: "Submit Transfer", candidates: [{ strategy: "css", selector: "button.danger", framePath: [], exact: true }], requireUnique: true },
    }, "irreversible", "http://127.0.0.1:4310/ops/review");
    expect(decision).toMatchObject({ allowed: false, code: "RISK_BLOCKED" });
  });

  it("blocks an origin outside the configured allowlist", () => {
    const decision = policy.evaluate({ type: "wait", durationMs: 10 }, "safe", "https://example.com/ops");
    expect(decision).toMatchObject({ allowed: false, code: "ORIGIN_BLOCKED" });
  });
});

let temporaryRoot: string | undefined;

afterEach(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

describe("file evidence redaction", () => {
  it("redacts member identifiers and API-key shaped secrets before persistence", async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "ucr-evidence-"));
    const sink = new FileEvidenceSink(temporaryRoot, "redaction-test");
    await sink.append({
      timestamp: "2026-08-30T01:00:00.000Z",
      runId: "redaction-test",
      type: "model_decision",
      data: { summary: "Search M-10042 with sk-example1234567890" },
    });
    const logReference = sink.references().find((reference) => reference.kind === "log");
    expect(logReference).toBeDefined();
    const logPath = join(temporaryRoot, "runs", "redaction-test", "run.jsonl");
    const content = await readFile(logPath, "utf8");
    expect(content).not.toContain("M-10042");
    expect(content).not.toContain("sk-example1234567890");
    expect(content).toContain("[REDACTED_MEMBER]");
    expect(content).toContain("[REDACTED_API_KEY]");
  });
});

