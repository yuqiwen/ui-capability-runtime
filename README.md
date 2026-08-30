# UI Capability Runtime

UI Capability Runtime gives an AI agent a controlled way to operate applications that do not expose an API. A live LLM-driven discovery run completes a goal against a real UI and is compiled into a typed, reviewable capability. Later invocations replay that capability deterministically, without a model deciding the next action.

The core vertical slice is implemented and covered by browser integration tests. Generating the committed live discovery evidence requires a local model API key; deterministic replay and the full test suite do not.

## What the demo proves

The included fictional credit-union operations console is intentionally legacy-shaped: server-rendered pages, nested tables, frames, duplicate labels, no test IDs, and injectable runtime conditions. The end-to-end demo will show:

1. discovery from only a natural-language goal and target URL;
2. automatic generation of a typed, versioned capability artifact;
3. deterministic replay with different typed inputs and no LLM decision calls;
4. success, known business outcome, recoverable condition, and escalation results;
5. allowlist and irreversible-action enforcement;
6. pause, human control of the same browser session, and verified resume;
7. redacted logs, screenshots, and traces under `/evidence/`.

## Architecture at a glance

```text
goal + target
      |
      v
DiscoveryAgent --> successful typed action trace --> CapabilityCompiler
      |                                                |
      v                                                v
PolicyEngine                                   capability.v1.json
                                                       |
                                                       v
                                            DeterministicExecutor
                                                       |
                         +-----------------------------+------------------+
                         v                             v                  v
                    RunResult                    EvidenceSink       HumanHandoff
```

The recorded artifact is application-family and workflow specific. The runtime and surface contracts are general. Tenant profiles can safely specialize routes and locators for institutions using variants of the same vendor application.

## Setup

Prerequisites:

- Node.js 22 or newer
- a Chromium-compatible browser installed by Playwright
- an OpenAI API key only for the genuine discovery command

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Windows PowerShell equivalent:

```powershell
Copy-Item .env.example .env
```

## Commands

### 1. Verify the repository without live services

```bash
npm run check
npm run cli -- --help
```

The test suite includes real headless-browser runs for successful replay, member-not-found, transient recovery, permission escalation, same-session human takeover/resume, and goal-only discovery with a deterministic scripted model. The scripted model is a test fixture, not the required live discovery evidence.

### 2. Start the target application

In terminal one:

```bash
npm run target -- --scenario happy
```

The fictional operations console is then available at `http://127.0.0.1:4310/ops`.

### 3. Run genuine LLM discovery

Put `OPENAI_API_KEY` and an image-capable structured-output `OPENAI_MODEL` in the untracked `.env` file. Then run in terminal two:

```bash
npm run discover -- \
  --target http://127.0.0.1:4310/ops \
  --goal "Prepare a $125.50 internal transfer for member M-10042 from checking to savings and stop at the review page." \
  --output evidence/prepare-internal-transfer.v1.json \
  --headed
```

Discovery receives only the goal and target. The compiler infers typed inputs from the goal and successful trace, replaces concrete values with `input` references, validates checkpoint phrases against observed states, and writes a `draft` artifact. Model responses are requested with storage disabled. Raw sample member IDs and amounts are not persisted in the artifact.

### 4. Replay without an LLM

Keep the happy target running and invoke the saved capability with different inputs:

```bash
npm run replay -- \
  --artifact evidence/prepare-internal-transfer.v1.json \
  --args '{"member-id":"M-20081","from-account":"checking","to-account":"savings","amount":75}'
```

The replay command never constructs an LLM client. A successful result contains the typed extracted outputs and evidence references.

### 5. Known business outcome

```bash
npm run replay -- \
  --artifact evidence/prepare-internal-transfer.v1.json \
  --args '{"member-id":"M-99999","from-account":"checking","to-account":"savings","amount":75}'
```

Expected result: `business_outcome` with code `MEMBER_NOT_FOUND`, not a thrown automation error.

### 6. Declared transient recovery

Restart terminal one with:

```bash
npm run target -- --scenario transient
```

Run the same replay command. The executor detects the declared temporary validation state, clicks the artifact's `Retry Validation` recovery action once, verifies its checkpoint, and completes.

### 7. Same-session human handoff

Restart terminal one with:

```bash
npm run target -- --scenario permission
```

Then run replay in headed handoff mode:

```bash
npm run replay -- \
  --artifact evidence/prepare-internal-transfer.v1.json \
  --args '{"member-id":"M-30077","from-account":"checking","to-account":"savings","amount":80}' \
  --handoff
```

Open the printed operator URL, take control, click `Apply Supervisor Override` in the already-open target browser, and request resume. The coordinator records redacted human events, verifies the declared resume checkpoint, returns the controller lease to automation, and the original replay finishes.

### Validate an artifact without running it

```bash
npm run cli -- validate --artifact evidence/prepare-internal-transfer.v1.json
```

## Repository layout

```text
src/
  agent/       LLM discovery loop and provider boundary
  artifact/    capability schema and compiler
  evidence/    structured logs, screenshots, traces, and redaction
  handoff/     intervention state and control transfer
  policy/      domain, route, action, and risk enforcement
  replay/      deterministic state-machine executor
  surface/     browser-independent observation/action contract
  target/      fictional local legacy operations console
tests/         contract, replay, policy, compiler, and integration tests
evidence/      committed demonstration artifacts and run evidence
REPORT.md      required seven-part design write-up
```

## Safety boundary

The demo may prepare a fictional internal transfer and reach its review page. The default policy does not permit automation to commit the transfer. Discovery and replay use the same policy engine. Secrets and raw sensitive values are not serialized into artifacts or logs.

## Running without live model services

Deterministic replay, policy tests, target application scenarios, artifact validation, and the scripted discovery/compiler integration test do not require an API key. Only creation of fresh genuine discovery evidence requires a live model call.

## Artifact lifecycle

Compiled artifacts start as `draft`. The schema reserves `verified` and `approved`, but this submission deliberately does not implement a review product or silently promote a discovery after one success. The local demo permits an explicit replay of a draft; a production policy would require repeated replay evidence followed by human approval before unattended use.

## Threat and trust boundaries

- Page text is observation data, never trusted instruction text.
- Discovery decisions and replay actions pass through the same policy engine.
- Locator candidates must resolve unambiguously; a weaker but unique fallback may be used, while ambiguous candidates are rejected.
- Coordinates are discovery fallbacks and cannot be used for deterministic text entry or output extraction.
- Operator takeover uses the original `BrowserContext`; a new session cannot satisfy the handoff contract.
- Evidence redaction happens before persistence.
