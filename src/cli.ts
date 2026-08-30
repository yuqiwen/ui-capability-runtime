import { Command } from "commander";
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DiscoveryAgent } from "./agent/discovery-agent.js";
import { OpenAIDiscoveryModel } from "./agent/openai-model.js";
import { CapabilityCompiler } from "./artifact/compiler.js";
import { createNorthstarProfile } from "./artifact/northstar-profile.js";
import { capabilitySchema } from "./contracts/capability.js";
import type { JsonPrimitive } from "./contracts/common.js";
import type { RuntimePolicy } from "./contracts/policy.js";
import { FileEvidenceSink } from "./evidence/file-sink.js";
import { HandoffCoordinator } from "./handoff/coordinator.js";
import { createOperatorConsole } from "./handoff/operator-console.js";
import { DeterministicExecutor } from "./replay/executor.js";
import { BrowserSurface } from "./surface/browser-surface.js";
import { createTargetApp } from "./target/app.js";

const program = new Command();

program.name("ucr").description("Discover and deterministically replay typed UI capabilities").version("0.1.0");

program.command("doctor").description("Check local configuration without calling live services").action(() => {
  process.stdout.write(`${JSON.stringify({
    node: process.version,
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    modelConfigured: Boolean(process.env.OPENAI_MODEL),
    targetAppPort: Number(process.env.TARGET_APP_PORT ?? 4310),
    operatorPort: Number(process.env.OPERATOR_PORT ?? 4311),
  }, null, 2)}\n`);
});

program.command("target").description("Run the fictional legacy operations target")
  .option("--port <number>", "listening port", process.env.TARGET_APP_PORT ?? "4310")
  .option("--scenario <name>", "happy, transient, or permission", process.env.TARGET_SCENARIO ?? "happy")
  .action(async (options: { port: string; scenario: string }) => {
    if (!(["happy", "transient", "permission"] as string[]).includes(options.scenario)) throw new Error(`unknown target scenario ${options.scenario}`);
    const app = createTargetApp({ forcedScenario: options.scenario as "happy" | "transient" | "permission" });
    const server = app.listen(Number(options.port), "127.0.0.1", () => {
      process.stdout.write(`${JSON.stringify({ status: "ready", scenario: options.scenario, url: `http://127.0.0.1:${options.port}/ops` })}\n`);
    });
    await new Promise<void>((resolvePromise) => {
      const stop = () => server.close(() => resolvePromise());
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  });

program.command("discover").description("Run genuine LLM-driven discovery and compile a draft capability")
  .requiredOption("--goal <text>", "natural-language goal")
  .requiredOption("--target <url>", "target entry point")
  .option("--model <model>", "OpenAI model", process.env.OPENAI_MODEL)
  .option("--output <path>", "artifact output path", "evidence/prepare-internal-transfer.v1.json")
  .option("--evidence-dir <path>", "evidence root", "evidence")
  .option("--max-steps <number>", "discovery step limit", "20")
  .option("--headed", "show the discovery browser", false)
  .option("--handoff", "enable same-session human takeover if discovery is stuck", false)
  .option("--operator-port <number>", "operator console port", process.env.OPERATOR_PORT ?? "4311")
  .action(async (options: { goal: string; target: string; model?: string; output: string; evidenceDir: string; maxSteps: string; headed: boolean; handoff: boolean; operatorPort: string }) => {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for genuine discovery");
    if (!options.model) throw new Error("--model or OPENAI_MODEL is required for genuine discovery");
    const runId = `discovery-${randomUUID()}`;
    const evidence = new FileEvidenceSink(resolve(options.evidenceDir), runId);
    const profile = createNorthstarProfile(options.target);
    const policy = runtimePolicyFromProfile(profile, "northstar-discovery-policy");
    const surface = await BrowserSurface.launch({ headless: options.handoff ? false : !options.headed, slowMoMs: options.headed || options.handoff ? 120 : 0 });
    const coordinator = options.handoff ? new HandoffCoordinator() : undefined;
    const operatorServer = coordinator
      ? createOperatorConsole(coordinator, resolve(options.evidenceDir)).listen(Number(options.operatorPort), "127.0.0.1", () => process.stdout.write(`${JSON.stringify({ status: "operator_ready", url: `http://127.0.0.1:${options.operatorPort}` })}\n`))
      : undefined;
    try {
      const model = new OpenAIDiscoveryModel(options.model, process.env.OPENAI_API_KEY);
      const discovery = await new DiscoveryAgent(model, surface, policy).run(options.goal, options.target, { runId, evidence, maxSteps: Number(options.maxSteps), ...(coordinator ? { handoff: coordinator } : {}) });
      if (discovery.status !== "success") {
        process.stdout.write(`${JSON.stringify(discovery, null, 2)}\n`);
        process.exitCode = 2;
        return;
      }
      const capability = await new CapabilityCompiler(model).compile(discovery, profile);
      const outputPath = resolve(options.output);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(capability, null, 2)}\n`, "utf8");
      process.stdout.write(`${JSON.stringify({ status: "success", runId, artifact: outputPath, evidence: evidence.references() }, null, 2)}\n`);
    } finally {
      await surface.close();
      if (operatorServer) await new Promise<void>((resolvePromise, reject) => operatorServer.close((error) => (error ? reject(error) : resolvePromise())));
    }
  });

program.command("replay").description("Replay a saved capability deterministically without an LLM")
  .requiredOption("--artifact <path>", "saved capability JSON")
  .requiredOption("--args <json>", "typed invocation arguments as JSON")
  .option("--evidence-dir <path>", "evidence root", "evidence")
  .option("--headed", "show the replay browser", false)
  .option("--handoff", "enable the local operator console", false)
  .option("--operator-port <number>", "operator console port", process.env.OPERATOR_PORT ?? "4311")
  .action(async (options: { artifact: string; args: string; evidenceDir: string; headed: boolean; handoff: boolean; operatorPort: string }) => {
    const capability = capabilitySchema.parse(JSON.parse(await readFile(resolve(options.artifact), "utf8")));
    const inputs = JSON.parse(options.args) as Record<string, JsonPrimitive>;
    const runId = `replay-${randomUUID()}`;
    const evidenceRoot = resolve(options.evidenceDir);
    const evidence = new FileEvidenceSink(evidenceRoot, runId);
    const policy: RuntimePolicy = {
      id: `${capability.id}-runtime-policy`,
      allowedOrigins: capability.target.allowedOrigins,
      allowedRoutePatterns: capability.policy.allowedRoutePatterns,
      allowedActionTypes: capability.policy.allowedActionTypes,
      maximumAutomatedRisk: capability.policy.maximumAutomatedRisk,
      redactInputNames: capability.contract.inputs.filter((input) => input.sensitive).map((input) => input.name),
      blockedTargetTextPatterns: ["Submit Transfer", "Delete", "Close Account"],
    };
    const surface = await BrowserSurface.launch({ headless: options.handoff ? false : !options.headed, slowMoMs: options.headed || options.handoff ? 100 : 0 });
    const coordinator = options.handoff ? new HandoffCoordinator() : undefined;
    const operatorServer = coordinator
      ? createOperatorConsole(coordinator, evidenceRoot).listen(Number(options.operatorPort), "127.0.0.1", () => process.stdout.write(`${JSON.stringify({ status: "operator_ready", url: `http://127.0.0.1:${options.operatorPort}` })}\n`))
      : undefined;
    try {
      const result = await new DeterministicExecutor(capability, surface, policy).run(inputs, { runId, evidence, ...(coordinator ? { handoff: coordinator } : {}) });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.status === "failure") process.exitCode = 2;
    } finally {
      await surface.close();
      if (operatorServer) await new Promise<void>((resolvePromise, reject) => operatorServer.close((error) => (error ? reject(error) : resolvePromise())));
    }
  });

program.command("validate").description("Validate a capability artifact without running it")
  .requiredOption("--artifact <path>")
  .action(async (options: { artifact: string }) => {
    const capability = capabilitySchema.parse(JSON.parse(await readFile(resolve(options.artifact), "utf8")));
    process.stdout.write(`${JSON.stringify({ status: "valid", id: capability.id, revision: capability.revision, lifecycle: capability.status }, null, 2)}\n`);
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ status: "failure", message })}\n`);
  process.exitCode = 1;
});

function runtimePolicyFromProfile(profile: ReturnType<typeof createNorthstarProfile>, id: string): RuntimePolicy {
  return {
    id,
    allowedOrigins: profile.allowedOrigins,
    allowedRoutePatterns: profile.allowedRoutePatterns,
    allowedActionTypes: profile.allowedActionTypes,
    maximumAutomatedRisk: profile.maximumAutomatedRisk,
    redactInputNames: ["member-id", "amount"],
    blockedTargetTextPatterns: ["Submit Transfer", "Delete", "Close Account"],
  };
}
