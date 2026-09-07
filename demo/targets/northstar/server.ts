import { Command } from "commander";
import "dotenv/config";
import { createTargetApp } from "./app.js";

const command = new Command()
  .name("northstar-demo-target")
  .option("--port <number>", "listening port", process.env.TARGET_APP_PORT ?? "4310")
  .option("--scenario <name>", "happy, transient, or permission", process.env.TARGET_SCENARIO ?? "happy")
  .parse();
const options = command.opts<{ port: string; scenario: string }>();
if (!("happy transient permission".split(" ").includes(options.scenario))) throw new Error(`unknown target scenario ${options.scenario}`);
const scenario = options.scenario as "happy" | "transient" | "permission";
const port = Number(options.port);
const app = createTargetApp({ forcedScenario: scenario });

const server = app.listen(port, "127.0.0.1", () => {
  process.stdout.write(`${JSON.stringify({ status: "ready", service: "northstar-ops", scenario, url: `http://127.0.0.1:${port}/ops` })}\n`);
});

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
