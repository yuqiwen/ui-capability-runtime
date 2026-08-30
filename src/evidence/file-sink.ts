import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative, resolve, sep } from "node:path";
import type { EvidenceReference } from "../contracts/common.js";
import type { EvidenceSink, RunEvent } from "./events.js";

export class FileEvidenceSink implements EvidenceSink {
  private readonly refs: EvidenceReference[] = [];
  private readonly runDirectory: string;
  private readonly logPath: string;

  constructor(private readonly evidenceRoot: string, private readonly runId: string) {
    this.runDirectory = join(resolve(evidenceRoot), "runs", runId);
    this.logPath = join(this.runDirectory, "run.jsonl");
  }

  async append(event: RunEvent): Promise<void> {
    await mkdir(this.runDirectory, { recursive: true });
    await appendFile(this.logPath, `${JSON.stringify(this.redact(event))}\n`, "utf8");
    if (!this.refs.some((reference) => reference.kind === "log")) this.refs.push({ kind: "log", path: this.relativePath(this.logPath) });
  }

  async captureScreenshot(label: string, screenshot: Buffer): Promise<EvidenceReference> {
    await mkdir(this.runDirectory, { recursive: true });
    const safeLabel = label.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = join(this.runDirectory, `${safeLabel}.png`);
    await writeFile(path, screenshot);
    const reference: EvidenceReference = { kind: "screenshot", path: this.relativePath(path), sha256: createHash("sha256").update(screenshot).digest("hex") };
    this.refs.push(reference);
    return reference;
  }

  references(): EvidenceReference[] {
    return [...this.refs];
  }

  private relativePath(path: string): string {
    return join(relative(resolve(this.evidenceRoot, ".."), path)).split(sep).join("/");
  }

  private redact<T>(value: T): T {
    const serialized = JSON.stringify(value)
      .replace(/M-[0-9]{5}/gi, "[REDACTED_MEMBER]")
      .replace(/\bsk-[a-zA-Z0-9_-]{12,}\b/g, "[REDACTED_API_KEY]")
      .replace(/\b(?:member-?id|amount)\s*[=:]\s*[^,;\s]+/gi, (match) => `${match.split(/[=:]/, 1)[0]}=[REDACTED]`);
    return JSON.parse(serialized) as T;
  }
}
