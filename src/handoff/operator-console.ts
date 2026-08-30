import express, { type Express } from "express";
import { resolve, sep } from "node:path";
import type { HandoffCoordinator } from "./coordinator.js";

function escapeHtml(value: unknown): string {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    body{font-family:system-ui,sans-serif;max-width:980px;margin:32px auto;padding:0 18px;color:#172238} .card{border:1px solid #a8b1bd;padding:18px;margin:14px 0;border-radius:8px} code{background:#eef1f4;padding:2px 5px} button{padding:8px 14px;margin-right:8px} .warning{background:#fff4d0;border-left:5px solid #d49c15;padding:12px} img{max-width:100%;border:1px solid #aaa}
  </style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}

export function createOperatorConsole(coordinator: HandoffCoordinator, evidenceRoot: string): Express {
  const app = express();
  app.use(express.urlencoded({ extended: false }));

  app.get("/", (_request, response) => {
    const requests = coordinator.list();
    const body = requests.length
      ? requests.map((request) => `<div class="card"><strong>${escapeHtml(request.reason)}</strong><p>Run <code>${escapeHtml(request.runId)}</code> · status <code>${request.status}</code></p><a href="/interventions/${encodeURIComponent(request.id)}">Open intervention</a></div>`).join("")
      : "<p>No active intervention requests.</p>";
    response.type("html").send(page("Human intervention console", body));
  });

  app.get("/interventions/:id", (request, response) => {
    const intervention = coordinator.get(request.params.id);
    if (!intervention) { response.status(404).type("html").send(page("Intervention not found", "<p>This request is no longer active.</p>")); return; }
    const screenshot = intervention.evidence.find((reference) => reference.kind === "screenshot");
    const controls = intervention.status === "requested"
      ? `<form method="post" action="/interventions/${encodeURIComponent(intervention.id)}/take"><button>Take control</button></form>`
      : intervention.status === "human_active"
        ? `<div><form style="display:inline" method="post" action="/interventions/${encodeURIComponent(intervention.id)}/resume"><button>Resume automation</button></form><form style="display:inline" method="post" action="/interventions/${encodeURIComponent(intervention.id)}/abort"><button>Abort run</button></form></div>`
        : "";
    response.type("html").send(page("Intervention request", `
      <div class="warning">Automation is paused. Operate the already-open target browser; do not open a fresh session.</div>
      <div class="card"><p><strong>Reason:</strong> ${escapeHtml(intervention.reason)}</p><p><strong>Goal:</strong> ${escapeHtml(intervention.goal)}</p><p><strong>Step:</strong> ${escapeHtml(intervention.stepId ?? "unknown")}</p><p><strong>Controller:</strong> ${escapeHtml(intervention.controller)}</p><p><strong>Resume checkpoint:</strong> ${escapeHtml(intervention.resumeCheckpointDescription)}</p></div>
      ${screenshot ? `<img alt="Current session screenshot" src="/asset?path=${encodeURIComponent(screenshot.path)}">` : ""}${controls}`));
  });

  app.post("/interventions/:id/take", (request, response) => {
    coordinator.takeControl(request.params.id);
    response.redirect(`/interventions/${encodeURIComponent(request.params.id)}`);
  });

  app.post("/interventions/:id/resume", async (request, response) => {
    try {
      await coordinator.resume(request.params.id);
      response.type("html").send(page("Automation resumed", "<p>The checkpoint passed and control returned to automation.</p>"));
    } catch (error) {
      response.status(409).type("html").send(page("Resume rejected", `<p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p><p>Complete the required manual step in the live target browser, then try again.</p>`));
    }
  });

  app.post("/interventions/:id/abort", async (request, response) => {
    await coordinator.abort(request.params.id);
    response.type("html").send(page("Run aborted", "<p>The human operator aborted the run.</p>"));
  });

  app.get("/asset", (request, response) => {
    const evidenceBase = resolve(evidenceRoot);
    const requested = resolve(evidenceRoot, "..", String(request.query.path ?? ""));
    if (!(requested === evidenceBase || requested.startsWith(`${evidenceBase}${sep}`))) { response.status(403).send("blocked"); return; }
    response.sendFile(requested);
  });
  return app;
}

