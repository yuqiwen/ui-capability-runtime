# Build plan and acceptance gates

This file records why each implementation phase exists and what must be true before the next phase is considered complete.

## Phase 1 - Repository and communication baseline

**Purpose:** Make the submission understandable and reproducible before feature work grows.

**Acceptance gate:** Git repository, package scripts, README runbook, seven-heading REPORT, evidence contract, environment example, and architecture decisions exist. `npm run check` is the single local quality gate.

**Status:** Complete.

## Phase 2 - Contracts first

**Purpose:** Prevent discovery, replay, policy, and handoff from inventing incompatible data shapes.

**Acceptance gate:** Versioned capability schema; typed inputs/outputs; locator bundles; conditions; retry rules; business outcomes; recoveries; interventions; tagged run results; and schema tests. Required inputs must be referenced by executable steps, and undeclared references must fail validation.

**Status:** Complete.

## Phase 3 - Independent legacy target

**Purpose:** Exercise the interesting UI and runtime conditions without relying on third-party terms, credentials, or availability.

**Acceptance gate:** Multi-step framed UI, no test IDs, duplicate control text, deterministic fictional fixtures, happy path, member-not-found, validation rejection, transient interstitial, and permission escalation. HTTP tests plus visual browser review pass.

**Status:** Complete.

## Phase 4 - Deterministic production path

**Purpose:** Build the load-bearing no-model execution path before adding LLM discovery.

**Acceptance gate:** Ordered locator resolution, ambiguity rejection, input validation, policy before action, bounded retry, declared recovery, business outcome classification, final checkpoint verification, typed extraction, and structured result. Real Chromium integration tests cover all outcome classes.

**Status:** Complete.

## Phase 5 - Discovery and compilation

**Purpose:** Demonstrate that a goal can become a reusable capability rather than a raw transcript or handwritten macro.

**Acceptance gate:** Hybrid screenshot + element-inventory observation; strict structured model decisions; live UI action loop; automatic contract proposal; concrete-to-parameter lineage; checkpoint verification against recorded observations; no sample member ID or amount in the artifact. Scripted integration test passes; genuine model evidence remains required for submission.

**Status:** Implementation complete; live evidence pending API configuration.

## Phase 6 - Safety and human control transfer

**Purpose:** Ensure both discovery and replay stop rather than guess when an action is unsafe or the target requires authority they do not have.

**Acceptance gate:** Origin/route/action/risk policy, irreversible submission block, pre-persistence redaction, explicit controller states, same-session pause/take/resume, redacted human events, resume checkpoint, and operator console. Browser integration test demonstrates a completed takeover and resumed replay.

**Status:** Complete.

## Phase 7 - Evidence and submission hardening

**Purpose:** Leave reviewer-verifiable proof and make the public repository work from a clean checkout.

**Acceptance gate:** Genuine discovery artifact/log/screenshot; successful replay with different inputs; business-outcome replay; transient recovery replay; human-handoff replay; full tests; build; clean secret scan; final REPORT; optional short recording; public GitHub URL.

**Status:** In progress. Blocked only for the genuine live model run and final external publication.

Run `npm run verify:submission` for the final gate. It intentionally fails until the genuine artifact and all required run classes are present; green unit tests alone are insufficient.
