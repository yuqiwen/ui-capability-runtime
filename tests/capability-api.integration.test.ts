import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCapabilityApi } from "../src/api/capability-api.js";
import { createSampleCapability } from "./fixtures/sample-capability.js";
import { MemoryEvidenceSink } from "../src/evidence/events.js";
import { BrowserSurface } from "../src/surface/browser-surface.js";
import { createTargetApp } from "../demo/targets/northstar/app.js";

let targetServer: Server;
let apiServer: Server;
let apiBaseUrl: string;

function listen(app: ReturnType<typeof createTargetApp>): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("test server did not expose a TCP port");
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

beforeAll(async () => {
  const target = await listen(createTargetApp({ forcedScenario: "happy" }));
  targetServer = target.server;
  const capability = createSampleCapability(`${target.url}/ops`);
  const api = createCapabilityApi({
    capabilities: [capability],
    allowDraft: true,
    surfaceFactory: () => BrowserSurface.launch(),
    evidenceFactory: () => new MemoryEvidenceSink(),
  });
  const listeningApi = await listen(api);
  apiServer = listeningApi.server;
  apiBaseUrl = listeningApi.url;
});

afterAll(async () => {
  await close(apiServer);
  await close(targetServer);
});

describe("agent-facing capability API", () => {
  it("serves the interactive execution console", async () => {
    const response = await fetch(`${apiBaseUrl}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    const html = await response.text();
    expect(html).toContain("UI Capability Runtime");
    expect(html).toContain("Invoke deterministic replay");
    expect(html).toContain("control.step = schema['x-currency'] ? '0.01' : 'any'");
  });

  it("publishes a typed callable capability catalog", async () => {
    const response = await fetch(`${apiBaseUrl}/capabilities`);
    expect(response.status).toBe(200);
    const body = await response.json() as {
      capabilities: Array<{
        inputSchema: { properties: Record<string, { pattern?: string }> };
      }>;
    };
    const capability = body.capabilities[0];
    expect(capability).toBeDefined();
    if (!capability) return;
    expect(capability).toMatchObject({
      id: "prepare-internal-transfer",
      status: "verified",
      invoke: { method: "POST", path: "/capabilities/prepare-internal-transfer/invoke" },
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["member-id", "from-account", "to-account", "amount"],
      },
    });
    expect(capability.inputSchema.properties["member-id"]?.pattern).toBe("^M-[0-9]{5}$");
  });

  it("invokes deterministic replay by capability id and returns typed outputs", async () => {
    const response = await fetch(`${apiBaseUrl}/capabilities/prepare-internal-transfer/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ args: { "member-id": "M-20081", "from-account": "checking", "to-account": "savings", amount: 75 } }),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as {
      status: string;
      outputs: Record<string, string | number | boolean>;
    };
    expect(body).toMatchObject({
      status: "success",
      outputs: {
        "member-name": "Jordan Lee",
        "from-account-masked": "••••5521",
        "to-account-masked": "••••0194",
        amount: 75,
        fee: 0,
      },
    });
  }, 15_000);

  it("rejects draft invocation unless the server explicitly opts in", async () => {
    const capability = createSampleCapability("http://127.0.0.1:4310/ops");
    capability.status = "draft";
    const guarded = await listen(createCapabilityApi({ capabilities: [capability] }));
    try {
      const response = await fetch(`${guarded.url}/capabilities/prepare-internal-transfer/invoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ args: {} }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: "artifact_not_approved", status: "draft" });
    } finally {
      await close(guarded.server);
    }
  });
});
