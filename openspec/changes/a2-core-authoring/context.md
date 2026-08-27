# Context packet — A2 core-authoring

Track A of the board rebuild (plan: `docs/developing/plans/board-rebuild-plan.md` in rbutera/rennet; tracker: https://github.com/rbutera/rennet/issues/463). This repo is public and MIT. Rule Zero governs: no consent gates, no ceremony, no speculative hardening. The decision tickets below are CLOSED — implement them, never re-open or contradict them.

A1 landed: the nx monorepo, `@wboard/core` + `@wboard/server` skeletons, `spec/SPEC.md` skeleton, `spec/fixtures/` corpus contract, the `pnpm check` gate, CI. **Build on what exists — do not re-scaffold.** The npm scope is `@wboard/*` (org rename); "whiteboard" appears only in the repo slug and prose.

## Loop rules

The loop rules from `openspec/changes/a1-bootstrap-monorepo/context.md` apply verbatim. In brief:

- Fresh context per session; state lives on disk (this packet, `tasks.md`, git history). Assume interruption at any moment.
- Session start: read this packet + `tasks.md`, `git log --oneline -15`, run `pnpm check`, pick the highest unfinished task. Search before assuming something is unimplemented.
- Commit per completed task with a descriptive message; push freely (pushing is not publishing). No AI attribution or co-author trailers.
- **No placeholder or stub implementations.** If a task cannot be completed fully, leave it unchecked with a note.
- Verification closes the loop, not self-report: evidence shown, never asserted.

## Objective

Make `@wboard/core` the real wire contract: the five tool shapes as Zod schemas + types, the host-schema authoring kit with its compile-to-wire step, typed validation with all-or-nothing batch semantics, the finalized closed error-code enum, and a populated `spec/fixtures/` corpus that a core test runs in full. Finish by making SPEC.md's **Wire shape** and **Error codes** sections normative — SPEC.md must not lie about the shipped code.

## Decision tickets (the spec — closed, permalinked)

- https://github.com/rbutera/rennet/issues/455 — **primary authority for A2**: validated v3 tool shapes. Five tools (create / schema / apply / describe / events, + screenshot); element = `{id, kind, data}`; one mutation verb `apply` with a flat ordered ops list (`create|update|delete`) and `op_id` dedup; later ops may reference ids minted earlier in the same list; host schema declared at creation — kinds `{id, description, attributes}`, attributes `{name, description, type, required, many?}` with types `string|number|boolean|element|json`; element-typed attributes carry all relations/hierarchy; typed validation with precise errors, invalid batch changes nothing, extras pass through; **no presentation, no kinds, no relations, no attention in the protocol**; Zod authors the schema, compiled to wire.
- https://github.com/rbutera/rennet/issues/456 — corpus contract: fixtures are `{schema, input, expect: "accept" | {reject: <error-code>}}` under `accept/` and `reject/`; error codes are a small **closed** enum in SPEC.md; TS and Python twins run the same corpus in CI; the canonical source is the wire shape, language-neutral — Zod/Pydantic compile down to it, neither language is normative.
- https://github.com/rbutera/rennet/issues/453 — statelessness: `board_id` is a plain minted string threaded as a tool argument; dedup via client op-ids + event log.
- https://github.com/rbutera/rennet/issues/454 — prior art: structured-text-first read-back, id-first binding, stable caller ids + field passthrough.
- https://github.com/rbutera/rennet/issues/463 — Track A packet. Its selection-threads comment (R27/R28) is binding here: **quote anchoring below element granularity is HOST data** — an element-typed attribute plus a json attribute carrying the quote descriptor. **The protocol must not grow a span primitive**, relation kind, or any anchoring concept.

## Facts to bake in

- The error-code enum is finalized HERE and is closed in **both** directions: every code has at least one reject fixture, and no fixture may use a code SPEC.md does not define. A later change may not add codes without a protocol-version discussion in SPEC.md.
- Core validation is stateless: it takes the wire schema, the ops list, and a map of already-existing element ids to their kinds (`ReadonlyMap<string, string>`) as inputs, so the A3 server can call it against its projection. The kind lets updates to pre-existing elements be type-checked, not just existence-checked. Within-batch minting counts — an op may reference an id created earlier in the same list.
- The wire shape is canonical JSON; the Zod schemas describe it, they do not define it. The drift test proves the authoring-kit compiler always emits output the wire schema accepts.
- A2 fixtures are validate/reject cases run from an empty board (`input` carries the apply ops). Log→projection fixtures are A3's — do not add them.

## Out of scope (later workstreams — do NOT start these)

- **A3**: reference server — event log, projections, dedup execution, persistence. A2 defines shapes and validation only; nothing in `@wboard/server` changes beyond what compiles.
- **A4**: the MCP facade.
- **A5**: nx release / npm publish.
- **A6**: all Python.
- **A7**: docs site and worked examples.
- Any protocol concept #453–#456 excluded: presentation, relations, attention, spans/anchors, containment.

## Verification (end-to-end, a positive control that can fail)

1. From a clean checkout: `pnpm install && pnpm check` — green.
2. Corpus is live: flip one fixture's `expect` (accept→reject, or swap a reject code) → the corpus runner FAILS `pnpm check`; revert. Evidence shown.
3. Drift control: break the compiler's emitted wire shape (e.g. drop a field) → the drift test FAILS; revert. Evidence shown.
4. Closure proof: the runner asserts every SPEC.md error code appears in at least one reject fixture and every fixture's reject code is in the enum — show both assertions failing when violated (add a bogus fixture, then remove it).
5. SPEC.md **Wire shape** and **Error codes** sections read true against the exported schemas — no `_Draft (A2)_` markers remain in those sections.

## Completion sigil

`<promise>A2-COMPLETE</promise>`
