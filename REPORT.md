# Design Report

This report is maintained during implementation so that design intent and cut lines stay synchronized with the code. The final version will remain within the requested approximate 1-3 pages.

## 1. Architecture

The system separates perception/action, discovery decisions, capability compilation, deterministic execution, policy, evidence, and human control transfer. The implemented surface is a browser, but neither the capability contract nor the executor state machine exposes Playwright types. Discovery begins from only a goal and entry point. Each observation combines a screenshot with a compact accessibility-oriented element inventory, URL, visible text, and recent action results. This is more robust than prompting with a full DOM and more inspectable than screenshot-only coordinates.

The model returns one strictly structured action at a time. The surface resolves its chosen observed element into a recorded locator bundle, while policy remains outside the model. After success, a separate compiler proposes the business contract and checkpoints; deterministic validators prove that parameter references correspond to concrete trace values and that checkpoint phrases were actually observed. A single-process architecture keeps the vertical slice reproducible. The model provider, surface, evidence sink, policy engine, executor, and handoff coordinator are interfaces or isolated modules that could later become service boundaries.

## 2. Artifact schema

The artifact is both an agent-facing business contract and an executable deterministic program. It declares typed inputs and outputs, known business outcomes, target application-family constraints, policy requirements, ordered steps, locator candidates, preconditions, postconditions, retry rules, recoveries, interventions, checkpoints, and inference provenance. This avoids two weak extremes: a business-only DSL that hides UI execution, and a raw click macro with no callable contract.

Concrete values seen during discovery become `input` references only when they match a proposed input unambiguously. Required inputs unused by any executable step, undeclared references, duplicate names, and checkpoint text absent from the recorded observation all fail compilation. The parameterized goal and redacted provenance remain reviewable, while sample member IDs and amounts do not. Runtime outcomes and recoveries come from a curated application-family profile because a single happy discovery cannot safely infer exceptional states it never observed.

## 3. Determinism & error handling

Replay never constructs a model client or invokes a model to choose an action. Each step resolves an ordered locator bundle. Role/name and label locators are preferred, CSS is a guarded fallback, and coordinates cannot perform deterministic text input or extraction. If a candidate is ambiguous, the resolver tries a stronger unique fallback; it never selects the first match silently. Preconditions, bounded retries, declared runtime handlers, step postconditions, and the final checkpoint gate progress.

Results are a tagged union: success with typed outputs, known business outcome, escalation, or a debuggable hard failure containing step, expected state, observed state, retryability, and evidence. `MEMBER_NOT_FOUND` and target validation rejection are business outcomes. A known transient validation interstitial performs one artifact-declared recovery and verifies its checkpoint. Unknown states, exhausted recovery, locator ambiguity, and checkpoint mismatch stop. Runtime-condition handlers are evaluated before the happy-path postcondition so expected alternate states are classified deliberately.

## 4. Heterogeneity & multi-tenant

Surface adapters translate general observations and actions to browser, accessibility, screenshot-coordinate, or future desktop mechanisms. A desktop adapter could return the same observation/action contracts from an OS accessibility tree plus screenshot and execute through native automation. The artifact therefore records semantic targets and fallback candidates, not Playwright objects.

Capabilities target an application family rather than one tenant instance. Tenant profiles can override entry routes and selected locators without forking the business contract. Application fingerprints and checkpoint failure stop an incompatible version safely. The submission implements one tenant because cross-tenant infrastructure would add breadth before the core is proven; a second branded/route variant is the first extension after the required evidence is stable.

## 5. Escalation & handoff

The executor owns a live session under an explicit controller lease: `automation -> none -> human -> none -> automation`. When discovery reports stuck or replay reaches a declared intervention, the coordinator pauses progress, captures a screenshot, and publishes a request containing the redacted goal, run, step, reason, and resume checkpoint. The minimal operator console lets a person take control, operate the already-open headed browser, then request resume.

Browser click/change/navigation events are captured while the human lease is active; entered values are recorded only as `[REDACTED]`. Resume ends human capture and re-evaluates the declared checkpoint in the same `BrowserContext`. A failed checkpoint returns control to the human rather than guessing. An integration test performs a supervisor override in the original permission-blocked session and proves that the original executor resumes and extracts outputs.

## 6. Safety

The same pre-action policy gate protects discovery, replay, and declared recovery actions. It enforces allowed origins, routes, action types, blocked target patterns, and an automated risk ceiling. Preparing a transfer is treated as sensitive but reversible; `Submit Transfer` is irreversible and is blocked before the surface is called. Page content is untrusted observation data and cannot modify policy.

The local target contains only fictional records. Model API responses are requested with server-side storage disabled, artifacts replace sample data with parameter references, and structured evidence is redacted before disk write. This demo does transmit the fictional screenshot to the configured model provider during discovery; a production bank deployment would additionally require an institution-approved provider/data-residency agreement, zero-retention controls, field-level masking before observation, authenticated operator access, encrypted storage, and auditable identity.

## 7. Cuts

The implementation intentionally targets one browser surface and one deep workflow. It does not build distributed scheduling, real authentication, a production remote co-browsing console, native desktop control, or general LLM fallback during replay. The operator console is local and unauthenticated and must not be exposed beyond loopback. Recovery is declared and bounded; unknown replay states do not call a model.

Artifact approval remains represented as `draft / verified / approved`, but this submission does not build a review product. A second tenant variant, stability scoring across repeated runs, encrypted evidence, operator authentication, and explicit approval gates are next. These cuts preserve a thin but real implementation of every core requirement instead of polishing infrastructure around an incomplete execution path.
