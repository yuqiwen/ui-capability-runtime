import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTargetApp } from "../src/target/app.js";

let server: Server;
let origin: string;

beforeAll(async () => {
  const app = createTargetApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("target test server did not expose a TCP port");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe("fictional legacy target", () => {
  it("serves a framed operations workspace", async () => {
    const response = await fetch(`${origin}/ops`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("Northstar Credit Union");
    expect(html).toContain("Member Services Workspace");
  });

  it("treats an unknown member as a visible business outcome", async () => {
    const response = await fetch(`${origin}/ops/member-search?scenario=happy`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ memberNumber: "M-99999", scenario: "happy" }),
      redirect: "follow",
    });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("No matching member");
    expect(html).toContain("M-99999");
  });

  it("returns a validation outcome for an excessive amount", async () => {
    const response = await fetch(`${origin}/ops/member/M-20081/transfer?scenario=happy`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ fromAccount: "checking", toAccount: "savings", amount: "99999", scenario: "happy" }),
    });
    const html = await response.text();
    expect(response.status).toBe(422);
    expect(html).toContain("exceeds the available balance");
  });

  it("exposes a permission escalation state", async () => {
    const response = await fetch(`${origin}/ops/member/M-10042/transfer?scenario=permission`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ fromAccount: "checking", toAccount: "savings", amount: "125.50", scenario: "permission" }),
      redirect: "follow",
    });
    const html = await response.text();
    expect(response.status).toBe(403);
    expect(html).toContain("Supervisor permission required");
    expect(html).toContain("Apply Supervisor Override");
  });
});

