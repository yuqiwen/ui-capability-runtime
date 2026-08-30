import { createTargetApp } from "./app.js";

const port = Number(process.env.TARGET_APP_PORT ?? 4310);
const scenario = process.env.TARGET_SCENARIO;
const app = createTargetApp(scenario === "happy" || scenario === "transient" || scenario === "permission" ? { forcedScenario: scenario } : {});

const server = app.listen(port, "127.0.0.1", () => {
  process.stdout.write(`${JSON.stringify({ status: "ready", service: "northstar-ops", url: `http://127.0.0.1:${port}/ops` })}\n`);
});

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
