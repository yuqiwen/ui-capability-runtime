import express, { type Express, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { capabilitySchema, type Capability } from "../contracts/capability.js";
import type { JsonPrimitive } from "../contracts/common.js";
import type { EvidenceSink } from "../evidence/events.js";
import { FileEvidenceSink } from "../evidence/file-sink.js";
import { runtimePolicyFor } from "../policy/runtime-policy.js";
import { DeterministicExecutor } from "../replay/executor.js";
import { BrowserSurface } from "../surface/browser-surface.js";
import type { Surface } from "../surface/surface.js";
import { dashboardPage } from "./dashboard-page.js";

export interface CapabilityApiOptions {
  capabilities: Capability[];
  allowDraft?: boolean;
  evidenceRoot?: string;
  surfaceFactory?: () => Promise<Surface>;
  evidenceFactory?: (runId: string) => EvidenceSink;
}

export async function loadCapabilityCatalog(directory: string): Promise<Capability[]> {
  const catalogRoot = resolve(directory);
  const entries = await readdir(catalogRoot, { withFileTypes: true });
  const capabilities: Capability[] = [];
  for (const entry of entries.filter((candidate) => candidate.isFile() && candidate.name.endsWith(".json")).sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(catalogRoot, entry.name);
    capabilities.push(capabilitySchema.parse(JSON.parse(await readFile(path, "utf8"))));
  }
  return capabilities;
}

export function createCapabilityApi(options: CapabilityApiOptions): Express {
  const capabilities = new Map<string, Capability>();
  for (const capability of options.capabilities) {
    const parsed = capabilitySchema.parse(capability);
    if (capabilities.has(parsed.id)) throw new Error(`duplicate capability id ${parsed.id}`);
    capabilities.set(parsed.id, parsed);
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.get("/", (_request, response) => {
    response.setHeader("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:");
    response.type("html").send(dashboardPage);
  });

  app.get("/health", (_request, response) => response.json({ status: "ready", capabilityCount: capabilities.size }));

  app.get("/capabilities", (_request, response) => {
    response.json({ capabilities: [...capabilities.values()].map(capabilityDescriptor) });
  });

  app.get("/capabilities/:id", (request, response) => {
    const capabilityId = String(request.params.id ?? "");
    const capability = capabilities.get(capabilityId);
    if (!capability) return response.status(404).json({ error: "capability_not_found", capabilityId });
    return response.json(capabilityDescriptor(capability));
  });

  app.post("/capabilities/:id/invoke", async (request: Request, response: Response) => {
    const capabilityId = String(request.params.id ?? "");
    const capability = capabilities.get(capabilityId);
    if (!capability) return response.status(404).json({ error: "capability_not_found", capabilityId });
    if (capability.status === "draft" && !options.allowDraft) {
      return response.status(409).json({ error: "artifact_not_approved", capabilityId: capability.id, status: capability.status });
    }
    const body = request.body as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body) || !("args" in body)) {
      return response.status(400).json({ error: "invalid_request", expected: { args: "object" } });
    }
    const args = (body as { args?: unknown }).args;
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return response.status(400).json({ error: "invalid_request", expected: { args: "object" } });
    }

    const runId = `api-replay-${randomUUID()}`;
    const surfaceFactory = options.surfaceFactory ?? (() => BrowserSurface.launch());
    const evidenceFactory = options.evidenceFactory ?? ((id: string) => new FileEvidenceSink(resolve(options.evidenceRoot ?? "evidence/api"), id));
    let surface: Surface | undefined;
    try {
      surface = await surfaceFactory();
      const result = await new DeterministicExecutor(capability, surface, runtimePolicyFor(capability)).run(args as Record<string, JsonPrimitive>, {
        runId,
        evidence: evidenceFactory(runId),
      });
      const statusCode = result.status === "escalated" ? 202 : result.status === "failure" ? (result.category === "invalid_input" ? 400 : 409) : 200;
      return response.status(statusCode).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return response.status(500).json({ error: "invocation_failed", message });
    } finally {
      await surface?.close().catch(() => undefined);
    }
  });

  return app;
}

function capabilityDescriptor(capability: Capability) {
  return {
    id: capability.id,
    name: capability.name,
    description: capability.description,
    revision: capability.revision,
    status: capability.status,
    invoke: { method: "POST", path: `/capabilities/${capability.id}/invoke` },
    inputSchema: inputJsonSchema(capability),
    outputs: capability.contract.outputs.map((output) => ({ name: output.name, description: output.description, schema: output.schema })),
    businessOutcomes: capability.contract.businessOutcomes.map((outcome) => ({ code: outcome.code, description: outcome.description })),
  };
}

function inputJsonSchema(capability: Capability) {
  return {
    type: "object",
    additionalProperties: false,
    required: capability.contract.inputs.filter((input) => input.required).map((input) => input.name),
    properties: Object.fromEntries(capability.contract.inputs.map((input) => [input.name, jsonSchemaFor(input.schema, input.description)])),
  };
}

function jsonSchemaFor(schema: Capability["contract"]["inputs"][number]["schema"], description: string): Record<string, unknown> {
  if (schema.type === "string") return { type: "string", description, ...(schema.minLength === undefined ? {} : { minLength: schema.minLength }), ...(schema.pattern ? { pattern: schema.pattern } : {}) };
  if (schema.type === "enum") return { type: "string", description, enum: schema.values };
  if (schema.type === "boolean") return { type: "boolean", description };
  return {
    type: "number",
    description,
    ...(schema.minimum === undefined ? {} : { minimum: schema.minimum }),
    ...("maximum" in schema && schema.maximum !== undefined ? { maximum: schema.maximum } : {}),
    ...(schema.type === "money" ? { "x-currency": schema.currency } : {}),
  };
}
