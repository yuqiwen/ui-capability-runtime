# Assignment requirements matrix

This matrix maps each evaluated requirement to executable or inspectable evidence. Formal run evidence is populated only by the genuine live demo commands; tests are supporting proof, not a substitute for that run.

| Requirement | Implementation | Automated proof | Formal evidence |
| --- | --- | --- | --- |
| Goal + target LLM loop | `DiscoveryAgent`, `OpenAIDiscoveryModel`, `BrowserSurface` | `discovery-compiler.integration.test.ts` proves the loop shape with a scripted model | Genuine discovery JSONL + completion screenshot |
| Real UI interaction | Framed local Northstar operations app, Chromium surface | Target and discovery browser integration tests | Discovery screenshot and action log |
| Typed versioned artifact | Zod capability schema and `CapabilityCompiler` | Contract and compiler tests | `evidence/prepare-internal-transfer.v1.json` |
| Automatic parameterization | Goal/trace proposal, exact lineage matching, compiler validation | Compiler test proves sample member and amount are absent | Saved artifact input refs and parameterized goal |
| Deterministic no-model replay | `DeterministicExecutor` depends on `Surface`, not a model | Successful Chromium replay integration test | Successful replay JSONL with different inputs |
| Checkpoints and typed outputs | Step conditions, final checkpoint, output transforms | Success replay asserts all outputs | Replay result and log |
| Expected business outcome | Artifact-declared `MEMBER_NOT_FOUND` and validation branches | Member-not-found browser test | Business-outcome replay JSONL |
| Recoverable runtime state | Artifact-declared bounded transient handler | Recovery browser test | Log containing `recovery_completed` |
| Hard debuggable failure | Tagged failure result with step/expected/observed/evidence | Contract and policy tests | Failure screenshot when encountered |
| Safety allowlist | Origin, route, action, risk, target-pattern policy | Policy tests block origin and final submission | Policy decisions in run behavior |
| Sensitive-data treatment | Parameterized artifact, `store: false`, pre-write redaction | Evidence redaction test | Sanitized artifact and JSONL |
| Human escalation | Intervention schema and coordinator | Permission escalation browser test | Intervention screenshot and event |
| Same-session handoff | Controller lease, original `BrowserContext`, operator console | Full takeover/resume browser integration test | `human_control_resumed` event with redacted manual actions |
| Legacy/desktop seam | General surface/action/observation contracts | Type checking and browser implementation | REPORT section 4 |
| Multi-tenant design | App-family target and tenant profiles/overrides | Schema validation | REPORT section 4 |
| Exact deliverables | README, seven-section REPORT, evidence directory | `npm run verify:submission` | Public repository |

