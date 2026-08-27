# whiteboard

A minimal, host-agnostic shared-canvas protocol: an append-only attributed event log as truth, board state as projection, and five stateless tools for agents and humans to author the same board.

- `@wboard/core` — authoring: element shapes, host-schema kit, Zod → wire validation
- `@wboard/server` — reference board service: event log, projections; embeddable in-process with pluggable persistence
- MCP facade — the five tools over any board service, stateless by construction
- `spec/` — SPEC.md plus a shared JSON fixture corpus; Python twins conform to the same corpus

Status: pre-alpha, under active build.

MIT licensed.
