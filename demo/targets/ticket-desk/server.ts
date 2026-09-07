import { Command } from "commander";
import { createTicketDeskApp } from "./app.js";

const command = new Command()
  .name("ticket-desk-demo-target")
  .option("--port <number>", "listening port", "4320")
  .parse();
const port = Number(command.opts<{ port: string }>().port);
const app = createTicketDeskApp();
const server = app.listen(port, "127.0.0.1", () => {
  process.stdout.write(`${JSON.stringify({ status: "ready", service: "ticket-desk", url: `http://127.0.0.1:${port}/tickets` })}\n`);
});

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
