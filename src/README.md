# Runtime source layout

`src/` contains the shippable automation runtime. It must not import from `demo/`, `tests/`, `scripts/`, or `evidence/`.

| Directory | Responsibility |
|---|---|
| `agent/` | Model-independent discovery loop and OpenAI adapter |
| `api/` | Capability catalog, invocation HTTP API, and local dashboard |
| `artifact/` | Generic profile registry primitives and trace-to-capability compiler |
| `contracts/` | Versioned Zod schemas and TypeScript contracts |
| `evidence/` | Redacted event and screenshot persistence |
| `handoff/` | Same-session controller lease and operator console |
| `policy/` | Policy evaluation, risk classification, and runtime-policy projection |
| `profiles/` | Reviewed application-family knowledge assembled at the composition root |
| `replay/` | Deterministic executor and input validation; no model dependency |
| `surface/` | Browser-independent surface contract and Playwright adapter |

Dependency direction is toward contracts and interfaces. Demo applications may be imported by integration tests, but the runtime never imports a demo target.
