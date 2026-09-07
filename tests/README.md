# Test organization

Test filenames communicate scope:

- `*.test.ts` covers contracts, policies, adapters, and bounded orchestration behavior.
- `*.integration.test.ts` starts real local HTTP applications and/or Playwright browsers.
- `fixtures/` contains hand-authored test artifacts only; production commands never load them.

The Northstar integration tests exercise the deep assignment workflow and exceptional states. `generic-web-discovery.integration.test.ts` uses the separate Ticket Desk target to prove that discovery, compilation, and deterministic replay work without a target-specific profile.
