# Context packet — A3 server-reference

Track A of the board rebuild (plan: `docs/developing/plans/board-rebuild-plan.md` in rbutera/rennet; tracker: https://github.com/rbutera/rennet/issues/463). This repo is public and MIT. Rule Zero governs: no consent gates, no ceremony, no speculative hardening. The decision tickets below are CLOSED — implement them, never re-open or contradict them.

A1 + A2 landed: the nx monorepo with the `pnpm check` gate, and the full `@whtbrd/core` wire contract — Zod schemas for the five tool shapes (+ screenshot), the host-schema authoring kit with its drift test, stateless `validate(wireSchema, ops, existing: ReadonlyMap<id, kind>)` with the closed six-code enum, and the populated validate/reject corpus with its core runner. `@whtbrd/server` is a skeleton re-exporting `PROTOCOL_VERSION`. **Build on what exists — do not re-scaffold, do not touch core's validation.** The npm scope is `@whtbrd/*`.

## Loop rules

The loop rules from `openspec/changes/a1-bootstrap-monorepo/context.md` apply verbatim. In brief:

- Fresh context per session; state lives on disk (this packet, `tasks.md`, git history). Assume interruption at any moment.
- Session start: read this packet + `tasks.md`, `git log --oneline -15`, run `pnpm check`, pick the highest unfinished task. Search before assuming something is unimplemented.
- Commit per completed task with a descriptive message; push freely (pushing is not publishing). No AI attribution or co-author trailers.
- **No placeholder or stub implementations.** If a task cannot be completed fully, leave it unchecked with a note.
- Verification closes the loop, not self-report: evidence shown, never asserted.

## Objective

Make `@whtbrd/server` the real reference board service: an **embeddable in-process TypeScript library** (no transport, no sessions) whose truth is an **append-only attributed event log** behind a **pluggable storage interface**, with board state a deterministic projection of that log. Extend the corpus with log→projection cases and run the *entire* corpus (A2's validate cases included) end-to-end through the server's `apply`. Finish by making SPEC.md's **Projection semantics** section normative — including the embeddability + pluggable-persistence requirement Rennet's B4 depends on. SPEC.md must not lie about the shipped code.

## Decision tickets (the spec — closed, permalinked)

- https://github.com/rbutera/rennet/issues/454 — **primary authority for A3's spine**: diverge from prior art's last-writer-wins mutable Map. The append-only **attributed** event log is the source of truth; current state is a projection of the log, rebuildable at any time; every event carries an actor; anonymous mutation is structurally impossible.
- https://github.com/rbutera/rennet/issues/453 — statelessness: `board_id` is a plain minted string threaded as an argument; the service holds zero per-connection state; **dedup via client op-ids + the event log** (the protocol supplies no idempotency — the log does); live updates default to `get_events` polling by cursor.
- https://github.com/rbutera/rennet/issues/455 — tool shapes (validated v3): five tools + screenshot, flat ordered ops list, all-or-nothing `apply`. A3 implements their server-side semantics; the wire shapes are already shipped in `@whtbrd/core` and are not renegotiated here.
- https://github.com/rbutera/rennet/issues/456 — layout + interop: `@whtbrd/server` is the reference board service; the corpus covers **server semantics**, not just validation — given the same ops, conforming board services fold the log into identical projections and emitted events.
- https://github.com/rbutera/rennet/issues/463 — Track A packet. **A3 must make `@whtbrd/server` embeddable in-process with pluggable persistence, and this requirement goes into SPEC.md** — it is the Rennet-side bet that gates Track B's B4 (Rennet embeds the server under `.rennet/` with its own persistence wrap). The R27/R28 comment binds: thread growth is ordinary append — no new mutation semantics, no span primitive.

## Decisions baked in (decided here, not re-litigated by the implementer)

- **Dedup lives in the server's `apply` path, per-op, before validation.** An op whose `op_id` already appears in the board's event log — or earlier in the same batch — is dropped as already-applied. The surviving ops validate (all-or-nothing) and append atomically. A batch whose every op is a duplicate returns `{ok: true}` and appends nothing: replay is idempotent. Core's `validate` stays dedup-unaware (its A2 signature is closed).
- **Event = `{seq, actor, op}`** (core's `EventSchema`). One event per accepted op. `seq` is contiguous, starts at **1**, assigned by the store at append time (assignment and append are one atomic act — a batch's events land contiguously or not at all).
- **Fold rules**: in seq order — `create` inserts the element; `update` shallow-merges the op's `data` keys into the element's `data`; `delete` removes the element. Projection = id → element. Deterministic: same log, same projection, always.
- **Cursor semantics**: `getEvents(board_id, cursor?)` returns events with `seq > cursor` (cursor omitted = 0 = from the start), ordered by seq; the returned `cursor` is the last returned event's seq, or the request's cursor when nothing new exists.
- **Storage interface is log + schema only**, Promise-returning, atomic append, store-assigned seqs. Projections are always derivable from the log; any in-memory projection cache the service keeps must be rebuildable and provably equivalent. The interface is the pluggability contract B4 plugs into; the shipped in-memory store is the reference implementation. **No database dependencies.**
- **Attribution is data, not authentication**: `actor` is a plain string the caller of `apply` supplies, recorded on each event. No identity ceremony, no auth (Rule Zero — this is an embeddable library).
- **Unknown `board_id` throws a plain `Error`** — the closed error enum is validation's, surfaced only in the `apply` response. A4 maps library errors to transport errors later.
- **`getState` is a library API, not a wire tool** — embedders (Rennet B4) read the projection directly; wire clients fold `events` client-side.
- **No screenshot work in A3.** A renderer needs only the schema and the projection, both already readable; A4 decides how screenshot is served. A3 stores nothing extra for it.

## Out of scope (later workstreams — do NOT start these)

- **A4**: the MCP facade and *any* transport — no HTTP, no WebSocket, no stdio, no MCP. The server is a library.
- **A5**: nx release / npm publish.
- **A6**: all Python.
- **A7**: docs site and worked examples.
- Rendering / screenshot implementation (A4).
- Any concept #453–#456 excluded: presentation, relations, attention, spans/anchors, containment, sessions, connections.

## Verification (end-to-end, positive controls that can fail)

1. From a clean checkout: `pnpm install && pnpm check` — green.
2. **Projection-rebuild equivalence**: the test that folds the raw log from storage and asserts it equals the service's served state FAILS when the fold (or any cached-projection path) is deliberately broken; revert. Evidence shown.
3. **Dedup replay**: re-applying an already-applied batch returns `{ok: true}` and leaves the log length unchanged — and the test FAILS when dedup is disabled; revert. Evidence shown.
4. **Corpus through apply**: the server runner runs every A2 accept/reject fixture end-to-end through `create` + `apply` and every A3 log→projection fixture through the full apply/fold path. Flip one fixture's expectation → the server runner FAILS `pnpm check`; revert. Evidence shown.
5. **All-or-nothing**: a project fixture with a mid-batch invalid op asserts the exact reject code AND that state and log are unchanged from the prior batch — shown failing when apply is made to append before validating; revert.
6. SPEC.md **Projection semantics** reads true against the shipped code — the embeddability + pluggable-persistence requirement is stated normatively, and no `_Draft (A3)._` marker remains.

## Completion sigil

`<promise>A3-COMPLETE</promise>`
