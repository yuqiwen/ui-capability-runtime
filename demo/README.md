# Demo targets

This directory contains applications operated by the runtime during demonstrations and integration tests. They are deliberately outside `src/`: neither target is part of the automation runtime, and production modules must not import them.

## Northstar

`targets/northstar/` is the primary assignment surface: a fictional credit-union back-office application with an iframe, duplicate labels, multi-step forms, business outcomes, transient failure, permission escalation, and an irreversible submit control.

```bash
npm run target -- --scenario happy
```

Supported scenarios are `happy`, `transient`, and `permission`.

## Ticket Desk

`targets/ticket-desk/` is an unrelated minimal application used to prove that generic discovery and replay do not depend on Northstar markup or a Ticket Desk profile.

```bash
npm run target:ticket
```

The corresponding integration test records `CASE-123`, compiles a parameterized capability, and deterministically replays it with `CASE-987`.
