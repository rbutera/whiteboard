## Why

A2 shipped the wire contract as code, but nothing *runs* a board: `@wboard/server` still exports one constant. The protocol's spine — an append-only attributed event log as truth with state as a projection (rbutera/rennet#454's deliberate divergence from prior art's mutable Map) — exists only as prose in SPEC.md's draft Projection semantics section. A2 also deferred two things to A3: where `op_id` dedup happens, and the log→projection corpus cases. And Track B's B4 is gated on a requirement that must become normative now: `@wboard/server` embeddable in-process with pluggable persistence (rbutera/rennet#463), so Rennet can run it under `.rennet/` with its own storage wrap. A3 ships the reference board service and finalizes the spec it implements.

## What Changes

- **`@wboard/server` becomes the reference board service** — an embeddable in-process TypeScript library, no transport, no sessions, no auth: `createBoard(schema)` mints a `board_id` (a plain `crypto.randomUUID()` string) and stores the declared wire schema; `getSchema`, `describe` (metadata + `protocol_version`), `getEvents` (ordered, attributed, cursor-based: events with `seq > cursor`, returned cursor = last seq served), `getState` (the projection — a library API for embedders, not a wire tool), and `apply(board_id, ops, actor)`.
- **Apply path, decided**: dedup happens **here**, per-op, before validation — an op whose `op_id` is already in the board's log (or earlier in the same batch) is dropped as already-applied; survivors validate via core's `validate()` fed from the projection's id→kind map (all-or-nothing, exactly the wire `ApplyResponse`); accepted ops append atomically as events `{seq, actor, op}` with contiguous store-assigned seqs from 1. Replay of a whole batch is idempotent: `{ok: true}`, nothing appended. Core's `validate` signature is untouched.
- **Event log as truth, projection derived**: a pure deterministic fold (create inserts, update shallow-merges `data`, delete removes) from log to state. Any projection cache is rebuildable from the log and proven equivalent by test.
- **Pluggable persistence**: a small Promise-returning storage interface — create board (schema), read schema, atomic seq-assigning append, read events after a seq — with the in-memory store as the shipped reference implementation. The interface is the contract Rennet's B4 plugs its own persistence into. No database dependencies.
- **SPEC.md Projection semantics goes normative**: event/attribution shape, seq and cursor semantics, the fold, the dedup location decision, and the **embeddability + pluggable-persistence requirement** — a conforming reference server is an in-process library whose event-log storage is host-suppliable.
- **Corpus grows server semantics**: new `spec/fixtures/project/` log→projection cases — `{schema, batches: [{actor, ops, expect}], expect: {state, events}}` — covering the fold, dedup replay, all-or-nothing mid-batch rejection, shallow-merge update, delete, and within-batch mint-then-reference. A server-side corpus runner executes the **whole** corpus end-to-end through `apply`: A2's accept/reject fixtures (verdicts must match, rejects leave the log empty) plus the new project fixtures (final state and emitted events must match exactly).

Out of scope: MCP facade and any transport — HTTP/WebSocket/stdio (A4), screenshot/rendering (A4 decides serving; the schema + projection A3 already exposes is all a renderer needs), release (A5), Python (A6), docs site (A7), and any excluded concept — no presentation, relations, attention, spans, sessions, or connections. Attribution is a plain `actor` string on events, not authentication (Rule Zero).

## Capabilities

### New Capabilities

- `board-service`: the embeddable reference board service — create/schema/apply/describe/getEvents/getState over an append-only attributed event log.
- `event-log-projection`: the deterministic log→state fold, rebuild equivalence, and cursor-based event reads.
- `op-dedup`: per-op `op_id` dedup against the event log in the apply path — idempotent replay, decided and specified here.
- `pluggable-persistence`: the storage interface (the B4 pluggability contract) plus the in-memory reference store.

### Modified Capabilities

- `conformance-corpus`: gains `spec/fixtures/project/` log→projection cases and a server runner that drives the entire corpus through `apply`.
- `spec-skeleton`: SPEC.md's Projection semantics section goes from draft to normative, embeddability requirement included.

## Impact

- `packages/server/src/**` — the service, projection fold, storage interface + in-memory store, and their tests including the server corpus runner. No new dependencies (core + Node stdlib only).
- `spec/fixtures/project/*.json` — new; `spec/fixtures/README.md` — project-fixture shape documented, status updated.
- `spec/SPEC.md` — Projection semantics finalized; `_Draft (A3)._` marker removed.
- `@wboard/core` untouched except as a consumed dependency.
