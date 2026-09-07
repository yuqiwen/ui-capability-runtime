export const dashboardPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Inspect and invoke deterministic UI capabilities learned through LLM discovery.">
  <title>UI Capability Runtime</title>
  <style>
    :root {
      color-scheme: dark;
      --ink: #eef4f8;
      --muted: #8ea1ae;
      --panel: #101921;
      --panel-2: #14212b;
      --line: #273844;
      --cyan: #58d6d1;
      --cyan-soft: rgba(88,214,209,.12);
      --amber: #f6bd60;
      --green: #70d6a3;
      --red: #ff7b72;
      --shadow: 0 24px 80px rgba(0,0,0,.34);
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 80% -10%, rgba(35,112,125,.2), transparent 34rem), #081015; color: var(--ink); font: 16px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    button, input, select { font: inherit; }
    .shell { width: min(1200px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 64px; }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .mark { display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid #397079; border-radius: 10px; background: linear-gradient(145deg, #17313a, #0c171d); color: var(--cyan); font: 700 15px/1 ui-monospace, SFMono-Regular, Consolas, monospace; box-shadow: inset 0 0 20px rgba(88,214,209,.08); }
    h1 { margin: 0; font-size: 1.05rem; letter-spacing: .01em; }
    .eyebrow { margin: 1px 0 0; color: var(--muted); font: 12px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; text-transform: uppercase; letter-spacing: .11em; }
    .health { display: flex; align-items: center; gap: 8px; color: #bdd0da; font-size: .875rem; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 14px rgba(112,214,163,.75); }
    .pipeline { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; overflow: hidden; margin-bottom: 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--line); box-shadow: var(--shadow); }
    .phase { position: relative; min-height: 102px; padding: 17px 18px; background: #0d171d; }
    .phase::after { content: "→"; position: absolute; top: 17px; right: -8px; z-index: 2; color: #55707d; }
    .phase:last-child::after { display: none; }
    .phase-index { color: var(--cyan); font: 12px/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .phase strong { display: block; margin: 9px 0 4px; font-size: .94rem; }
    .phase span { color: var(--muted); font-size: .78rem; line-height: 1.35; }
    .workspace { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(360px, .95fr); gap: 18px; align-items: start; }
    .card { border: 1px solid var(--line); border-radius: 14px; background: linear-gradient(155deg, rgba(20,33,43,.98), rgba(13,23,29,.98)); box-shadow: var(--shadow); }
    .card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 22px 24px 18px; border-bottom: 1px solid var(--line); }
    h2 { margin: 0; font-size: 1.2rem; letter-spacing: -.015em; }
    .description { max-width: 650px; margin: 6px 0 0; color: var(--muted); font-size: .88rem; }
    .pill { flex: none; padding: 5px 9px; border: 1px solid rgba(246,189,96,.38); border-radius: 999px; background: rgba(246,189,96,.09); color: var(--amber); font: 11px/1 ui-monospace, SFMono-Regular, Consolas, monospace; text-transform: uppercase; letter-spacing: .09em; }
    .contract { padding: 20px 24px 24px; }
    .section-label { margin: 0 0 10px; color: #b8c8d0; font: 12px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; text-transform: uppercase; letter-spacing: .1em; }
    .schema-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 22px; }
    .schema-item { min-width: 0; padding: 11px 12px; border: 1px solid #263944; border-radius: 9px; background: rgba(4,10,13,.28); }
    .schema-name { overflow: hidden; color: #e9f2f5; font: 13px/1.3 ui-monospace, SFMono-Regular, Consolas, monospace; text-overflow: ellipsis; }
    .schema-type { margin-top: 5px; color: var(--cyan); font-size: .72rem; }
    .outcomes { display: flex; flex-wrap: wrap; gap: 8px; }
    .outcome { padding: 7px 9px; border: 1px solid #34434d; border-radius: 7px; color: #aebfc8; font: 11px/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .invoke { position: sticky; top: 18px; }
    .invoke-body { padding: 20px 24px 24px; }
    .demo-values { margin: 0 0 18px; padding: 10px 12px; border-left: 2px solid var(--cyan); background: var(--cyan-soft); color: #b8d7d8; font-size: .8rem; }
    .field { margin-bottom: 14px; }
    label { display: flex; justify-content: space-between; margin-bottom: 6px; color: #d7e2e7; font-size: .82rem; }
    label span { color: var(--muted); font: 11px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }
    input, select { width: 100%; min-height: 44px; padding: 9px 11px; border: 1px solid #354954; border-radius: 8px; outline: none; background: #091218; color: var(--ink); }
    input:focus, select:focus { border-color: var(--cyan); box-shadow: 0 0 0 3px rgba(88,214,209,.12); }
    .run { width: 100%; min-height: 46px; margin-top: 4px; border: 0; border-radius: 9px; background: var(--cyan); color: #062023; font-weight: 750; cursor: pointer; transition: transform .16s ease, filter .16s ease; }
    .run:hover { filter: brightness(1.08); transform: translateY(-1px); }
    .run:disabled { cursor: wait; filter: grayscale(.55); transform: none; }
    .result { min-height: 80px; margin-top: 16px; padding: 13px; border: 1px solid #2a3e49; border-radius: 9px; background: #081116; color: #b7c7ce; font: 12px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    .result[data-state="success"] { border-color: rgba(112,214,163,.5); color: #bcebd2; }
    .result[data-state="failure"] { border-color: rgba(255,123,114,.5); color: #ffb4ad; }
    .architecture { margin-top: 18px; padding: 24px; }
    .architecture h2 { margin-bottom: 6px; }
    .module-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 18px; }
    .module { padding: 14px; border: 1px solid #263944; border-radius: 9px; background: rgba(4,10,13,.25); }
    .module code { color: var(--cyan); font-size: .78rem; }
    .module p { margin: 7px 0 0; color: var(--muted); font-size: .78rem; }
    .loading { padding: 36px 24px; color: var(--muted); }
    @media (max-width: 850px) {
      .pipeline { grid-template-columns: 1fr 1fr; }
      .phase:nth-child(2)::after { display: none; }
      .workspace { grid-template-columns: 1fr; }
      .invoke { position: static; }
      .module-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 560px) {
      .shell { width: min(100% - 20px, 1200px); padding-top: 18px; }
      .topbar { align-items: flex-start; }
      .pipeline, .schema-grid, .module-grid { grid-template-columns: 1fr; }
      .phase::after { display: none; }
      .card-head { padding: 18px; }
      .contract, .invoke-body, .architecture { padding: 18px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div class="brand"><div class="mark">UCR</div><div><h1>UI Capability Runtime</h1><p class="eyebrow">Agent-facing execution console</p></div></div>
      <div class="health"><span class="dot" aria-hidden="true"></span><span>Runtime ready</span></div>
    </header>

    <section class="pipeline" aria-label="Execution pipeline">
      <div class="phase"><span class="phase-index">01</span><strong>Discover</strong><span>LLM observes and acts against the live UI once.</span></div>
      <div class="phase"><span class="phase-index">02</span><strong>Compile</strong><span>Successful trace becomes a typed, reviewable artifact.</span></div>
      <div class="phase"><span class="phase-index">03</span><strong>Replay</strong><span>Saved steps execute deterministically with no model.</span></div>
      <div class="phase"><span class="phase-index">04</span><strong>Verify</strong><span>Checkpoints, outputs, policy and evidence close the loop.</span></div>
    </section>

    <section class="workspace">
      <article class="card" id="capability-card"><div class="loading">Loading capability contract…</div></article>
      <aside class="card invoke">
        <div class="card-head"><div><p class="section-label">Invocation</p><h2>Run capability</h2><p class="description">Typed arguments in. Structured result out. No LLM in the replay path.</p></div></div>
        <div class="invoke-body">
          <p class="demo-values">Supply arguments that match the selected capability contract.</p>
          <form id="invoke-form"><div id="fields"></div><button class="run" type="submit">Invoke deterministic replay</button></form>
          <div class="result" id="result" role="status" aria-live="polite">Ready to invoke.</div>
        </div>
      </aside>
    </section>

    <section class="card architecture">
      <p class="section-label">Code map</p><h2>One execution core, thin adapters</h2>
      <p class="description">The CLI and this HTTP console call the same executor. Policy and evidence remain outside both the model and the target application.</p>
      <div class="module-grid">
        <div class="module"><code>agent/</code><p>Observe → decide → act loop and structured model boundary.</p></div>
        <div class="module"><code>artifact/</code><p>Compiler, canonical inputs and versioned capability schema.</p></div>
        <div class="module"><code>replay/</code><p>Deterministic state machine, checkpoints and typed outputs.</p></div>
        <div class="module"><code>policy/</code><p>Origin, route, action and irreversible-operation guardrails.</p></div>
        <div class="module"><code>handoff/</code><p>Same-session human control lease and verified resume.</p></div>
        <div class="module"><code>evidence/</code><p>Redacted events, screenshots and debuggable run references.</p></div>
      </div>
    </section>
  </main>
  <script>
    const card = document.querySelector('#capability-card');
    const fields = document.querySelector('#fields');
    const form = document.querySelector('#invoke-form');
    const result = document.querySelector('#result');
    let selected;

    const typeLabel = schema => schema.enum ? 'enum' : schema['x-currency'] ? schema['x-currency'] + ' money' : schema.type;
    const node = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };

    function renderCapability(capability) {
      card.replaceChildren();
      const head = node('div', 'card-head');
      const intro = node('div');
      intro.append(node('p', 'section-label', 'Selected capability'), node('h2', '', capability.name), node('p', 'description', capability.description));
      head.append(intro, node('span', 'pill', capability.status));
      const contract = node('div', 'contract');
      contract.append(node('p', 'section-label', 'Input contract'));
      const inputGrid = node('div', 'schema-grid');
      Object.entries(capability.inputSchema.properties).forEach(([name, schema]) => {
        const item = node('div', 'schema-item');
        item.append(node('div', 'schema-name', name), node('div', 'schema-type', typeLabel(schema)));
        inputGrid.append(item);
      });
      contract.append(inputGrid, node('p', 'section-label', 'Typed outputs'));
      const outputGrid = node('div', 'schema-grid');
      capability.outputs.forEach(output => {
        const item = node('div', 'schema-item');
        item.append(node('div', 'schema-name', output.name), node('div', 'schema-type', output.schema.type));
        outputGrid.append(item);
      });
      contract.append(outputGrid, node('p', 'section-label', 'Known business outcomes'));
      const outcomes = node('div', 'outcomes');
      capability.businessOutcomes.forEach(outcome => outcomes.append(node('span', 'outcome', outcome.code)));
      contract.append(outcomes);
      card.append(head, contract);
      renderForm(capability);
    }

    function renderForm(capability) {
      fields.replaceChildren();
      Object.entries(capability.inputSchema.properties).forEach(([name, schema]) => {
        const wrapper = node('div', 'field');
        const label = node('label');
        label.htmlFor = 'field-' + name;
        label.append(document.createTextNode(name), node('span', '', typeLabel(schema)));
        let control;
        if (schema.enum) {
          control = document.createElement('select');
          schema.enum.forEach(value => { const option = document.createElement('option'); option.value = value; option.textContent = value; control.append(option); });
        } else {
          control = document.createElement('input');
          control.type = schema.type === 'number' ? 'number' : 'text';
          if (schema.minimum !== undefined) control.min = schema.minimum;
          if (schema.type === 'number') control.step = schema['x-currency'] ? '0.01' : 'any';
          if (schema.pattern) control.pattern = schema.pattern;
        }
        control.id = 'field-' + name;
        control.name = name;
        control.required = capability.inputSchema.required.includes(name);
        wrapper.append(label, control);
        fields.append(wrapper);
      });
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!selected) return;
      const button = form.querySelector('button');
      button.disabled = true;
      button.textContent = 'Running browser replay…';
      result.dataset.state = '';
      result.textContent = 'Launching isolated browser session and verifying the target fingerprint…';
      const args = {};
      new FormData(form).forEach((value, key) => { const schema = selected.inputSchema.properties[key]; args[key] = schema.type === 'number' ? Number(value) : value; });
      try {
        const response = await fetch(selected.invoke.path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) });
        const payload = await response.json();
        result.dataset.state = payload.status === 'success' ? 'success' : 'failure';
        result.textContent = JSON.stringify(payload, null, 2);
      } catch (error) {
        result.dataset.state = 'failure';
        result.textContent = 'Request failed: ' + error.message;
      } finally {
        button.disabled = false;
        button.textContent = 'Invoke deterministic replay';
      }
    });

    fetch('/capabilities').then(response => response.json()).then(payload => {
      selected = payload.capabilities[0];
      if (!selected) throw new Error('No capabilities are loaded.');
      renderCapability(selected);
    }).catch(error => { card.textContent = 'Catalog unavailable: ' + error.message; });
  </script>
</body>
</html>`;
