# Architecture decision log

## ADR-001: Build a local intentionally legacy target

**Decision:** Implement a fictional credit-union operations console as an independent local application.

**Why:** The assignment explicitly permits a local sample or mock. Local ownership makes the run reproducible, avoids third-party terms and credentials, and permits deliberate runtime fault injection. The automation receives no privileged database or internal API access.

## ADR-002: Discover from goal and target only

**Decision:** The primary discovery interface accepts only a natural-language goal and target entry point. It does not require callers to predeclare capability inputs.

**Why:** Contract discovery is part of the learning problem. A compiler may propose parameters from the goal and successful action trace, but programmatic validation must establish lineage between every input reference and its concrete discovery value.

## ADR-003: Use hybrid observations for discovery

**Decision:** Browser observations combine a screenshot, accessibility-oriented interactive-element inventory, URL/title, and recent action result. Coordinate actions are a guarded fallback.

**Why:** Full-DOM prompting overfits clean web applications; screenshot-only control is unnecessarily unreliable. Hybrid observation creates a credible seam for legacy web and future desktop surfaces while preserving inspectability.

## ADR-004: Keep replay model-free

**Decision:** The deterministic executor cannot depend on an LLM provider.

**Why:** Model-free replay is the production path required by the brief. Unknown states stop, use declared recovery, or escalate; they never trigger open-ended reasoning.

## ADR-005: Stop automated transfer at review

**Decision:** The primary capability prepares a fictional internal transfer and extracts review data. Automated final submission is disallowed by default policy.

**Why:** This demonstrates a useful multi-step flow and a concrete irreversible-action boundary without weakening the safety story.

