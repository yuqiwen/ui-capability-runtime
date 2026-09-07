import express, { type Express } from "express";

export function createTicketDeskApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_request, response) => response.json({ status: "ok", service: "ticket-desk" }));
  app.get("/tickets", (_request, response) => response.type("html").send(`<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><title>Acme Ticket Desk</title></head><body>
      <h1>Ticket Desk</h1>
      <label for="ticket">Ticket ID</label><input id="ticket" name="ticket-id">
      <button id="find">Find ticket</button>
      <section id="result" hidden><h2>Ticket Summary</h2><output id="summary" data-output></output></section>
      <script>
        document.querySelector('#find').addEventListener('click', () => {
          const id = document.querySelector('#ticket').value;
          document.querySelector('#summary').textContent = id + ': Open';
          document.querySelector('#result').hidden = false;
        });
      </script>
    </body></html>`));
  return app;
}
