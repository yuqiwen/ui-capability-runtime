import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { capabilitySchema } from "../src/contracts/capability.js";

const root = resolve(import.meta.dirname, "..");
const failures: string[] = [];

async function exists(path: string): Promise<boolean> {
  try { await stat(resolve(root, path)); return true; } catch { return false; }
}

for (const path of ["README.md", "REPORT.md", "evidence"]) {
  if (!(await exists(path))) failures.push(`missing required path /${path}`);
}

const requiredHeadings = [
  "## 1. Architecture",
  "## 2. Artifact schema",
  "## 3. Determinism & error handling",
  "## 4. Heterogeneity & multi-tenant",
  "## 5. Escalation & handoff",
  "## 6. Safety",
  "## 7. Cuts",
];
const report = await readFile(resolve(root, "REPORT.md"), "utf8");
for (const heading of requiredHeadings) if (!report.includes(heading)) failures.push(`REPORT missing heading: ${heading}`);

const artifactPath = resolve(root, "evidence", "prepare-internal-transfer.v1.json");
if (await exists("evidence/prepare-internal-transfer.v1.json")) {
  try { capabilitySchema.parse(JSON.parse(await readFile(artifactPath, "utf8"))); } catch (error) { failures.push(`saved capability is invalid: ${error instanceof Error ? error.message : String(error)}`); }
} else failures.push("missing genuine saved capability evidence/prepare-internal-transfer.v1.json");

interface Event { type?: string; data?: Record<string, unknown> }
const eventLogs: Event[][] = [];
const runsRoot = resolve(root, "evidence", "runs");
if (await exists("evidence/runs")) {
  for (const directory of await readdir(runsRoot)) {
    const logPath = resolve(runsRoot, directory, "run.jsonl");
    try {
      const lines = (await readFile(logPath, "utf8")).trim().split(/\r?\n/).filter(Boolean);
      eventLogs.push(lines.map((line) => JSON.parse(line) as Event));
    } catch { /* a non-run directory is ignored */ }
  }
}

const hasEvent = (predicate: (events: Event[]) => boolean) => eventLogs.some(predicate);
if (!hasEvent((events) => events.some((event) => event.type === "model_decision") && events.some((event) => event.type === "run_completed" && event.data?.status === "success"))) failures.push("missing successful genuine discovery run log");
if (!hasEvent((events) => events.some((event) => event.type === "run_completed" && event.data?.status === "success") && !events.some((event) => event.type === "model_decision"))) failures.push("missing successful deterministic replay log");
if (!hasEvent((events) => events.some((event) => event.type === "run_completed" && event.data?.status === "business_outcome"))) failures.push("missing business-outcome replay log");
if (!hasEvent((events) => events.some((event) => event.type === "recovery_completed"))) failures.push("missing recoverable-condition replay log");
if (!hasEvent((events) => events.some((event) => event.type === "human_control_resumed"))) failures.push("missing same-session handoff/resume log");

const candidateFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
for (const file of candidateFiles) {
  if (file === "scripts/verify-submission.ts" || file.endsWith("policy-evidence.test.ts") || file.endsWith("package-lock.json")) continue;
  const absolute = resolve(root, file);
  try {
    const content = await readFile(absolute, "utf8");
    if (/\bsk-[A-Za-z0-9_-]{12,}\b/.test(content)) failures.push(`possible API key in ${file}`);
    if (/M-[0-9]{5}/.test(content) && file.startsWith("evidence/")) failures.push(`raw member identifier in ${file}`);
  } catch { /* binary files are not scanned as text */ }
}

if (failures.length) {
  process.stderr.write(`Submission verification failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Submission verification passed: artifact, required run evidence, documentation, and secret scan are complete.\n`);
}

