# Context packet — A1 bootstrap-monorepo

Track A of the board rebuild (plan: `docs/developing/plans/board-rebuild-plan.md` in rbutera/rennet; tracker: https://github.com/rbutera/rennet/issues/463). This repo is public and MIT from the first commit. Rule Zero governs: no consent gates, no ceremony, no speculative hardening. The four decision tickets below are CLOSED — implement them, never re-open or contradict them.

## Loop rules (this repo has no BUILD-LOOP.md — these stand in)

- Fresh context per session; state lives on disk (this packet, `tasks.md`, git history), not in your head. Assume interruption at any moment.
- Session start: read this packet + `tasks.md`, `git log --oneline -15`, run the gate if it exists, pick the highest unfinished task. Search before assuming something is unimplemented.
- Commit per completed task with a descriptive message; push freely (pushing is not publishing). No AI attribution or co-author trailers.
- **No placeholder or stub implementations.** A near-empty package is fine; a hollow pass is not. If a task cannot be completed fully, leave it unchecked with a note.
- Verification closes the loop, not self-report: evidence shown, never asserted.

## Objective

Stand up the `whiteboard` nx monorepo so every later workstream (A2–A7) lands on a working toolchain with a real gate:

- pnpm + nx workspace; TypeScript strict toolchain; Biome for lint + format; Vitest for tests.
- Package skeletons `@wboard/core` and `@wboard/server` (server depends on core) — near-empty but genuinely building, typechecking, and passing at least one real test each, so the gate has a positive control.
- `spec/` (NOT a package): `SPEC.md` skeleton + `spec/fixtures/` corpus skeleton with a README stating the corpus contract.
- Root gate `pnpm check` = `nx run-many -t format,lint,typecheck,test,build`, mirroring rennet's gate shape.
- One GitHub Actions workflow running that gate on push and PR.
- MIT `license` field in every package.json; `@wboard/*` scope; per-package semver (versions start `0.0.0`; nx release config is A5 — leave at most a note).

## Decision tickets (the spec — closed, permalinked)

- https://github.com/rbutera/rennet/issues/456 — **primary authority for A1**: repo layout, TS/Python full-fat twins, `spec/` = SPEC.md + shared JSON fixture corpus, per-package semver + a SEPARATE protocol-version axis owned by SPEC.md (every library declares the protocol version it implements, surfaced in the MCP `describe`/handshake), nx toolchain, nx release → npm + PyPI.
- https://github.com/rbutera/rennet/issues/455 — validated v3 tool shapes: five tools (create / schema / apply / describe / events, + screenshot); element = `{id, kind, data}`; one mutation verb `apply` with a flat ordered ops list and `op_id` dedup; host schema declared at creation (kinds `{id, description, attributes}`; attribute types `string|number|boolean|element|json`, `many?`); typed validation, invalid batch changes nothing, extras pass through; no presentation/relations/attention in the protocol.
- https://github.com/rbutera/rennet/issues/453 — MCP statelessness: facade holds zero per-connection state, `board_id` is a plain minted string threaded as a tool argument, tools listed unconditionally, dedup via client op-ids + event log, live updates via `get_events` polling or a direct WebSocket.
- https://github.com/rbutera/rennet/issues/454 — prior art: append-only attributed event log as truth, state as projection; structured-text-first read-back, id-first binding, headless-first.
- https://github.com/rbutera/rennet/issues/463 — the Track A packet tying these together.

Facts A1 must bake into the SPEC.md skeleton so A2–A4 don't fight it: the fixture shape is `{schema, input, expect: "accept" | {reject: <error-code>}}`; error codes are a small CLOSED enum in SPEC.md (`unknown-kind`, `missing-required`, `wrong-type`, `bad-ref`, …); the corpus also covers log→projection server-semantics cases, not just validate/reject; TS and Python twins both run the same corpus in CI.

## Out of scope (later workstreams — do NOT start these)

- **A2**: the five tool shapes as code, host-schema kit, Zod→wire compiler, populating the fixture corpus.
- **A3**: reference server — event log, projections, embeddable-in-process with pluggable persistence.
- **A4**: the MCP facade (stateless five tools, `get_events` polling + WebSocket).
- **A5**: nx release configuration and npm publish.
- **A6**: all Python (uv nx plugin, Pydantic twins, PyPI).
- **A7**: docs site and the kanban/diagramming worked examples.

## Verification (end-to-end, a positive control that can fail)

1. From a clean checkout: `pnpm install && pnpm check` — green, all five targets across both packages.
2. Positive control: deliberately break one assertion in a `@wboard/core` test and one type in `@wboard/server`; `pnpm check` must FAIL both times; revert.
3. Cross-package proof: a `@wboard/server` test imports from `@wboard/core` and passes.
4. CI: the workflow runs the same gate green on the pushed commit (show the run URL).

## Completion sigil

`<promise>A1-COMPLETE</promise>`
