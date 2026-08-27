# Fixture corpus

The shared conformance corpus for the whiteboard protocol. It is **not a
package** — it is language-neutral JSON that every implementation runs. Today
`@wboard/core` runs the whole corpus in CI; the reference server (A3) and the
Python twins (A6) must run this same corpus to claim conformance. Passing it is
what "implements protocol version X" means.

> Status: A2 populated `accept/` and `reject/` with the validate/reject cases —
> every attribute type, `many`, optional-vs-required, extras pass-through,
> within-batch mint-then-reference, multi-op batches, and one reject fixture per
> error code. A3 added `project/` — the log→projection cases (see Scope) — so
> the corpus now covers **server semantics**, not just validation. Two runners
> run it: `@wboard/core` (`packages/core/src/corpus.test.ts`) drives every
> `accept/`+`reject/` fixture through `validate()`, and `@wboard/server`
> (`packages/server/src/corpus.test.ts`) runs the **whole** corpus — validate
> cases *and* projection cases — end-to-end through the reference service. The
> Python twins (A6) run this same corpus.

## Fixture shape

Each fixture is a JSON document:

```json
{
  "schema": { "...": "the host schema the board was created with" },
  "input": { "...": "the element(s) / apply ops under test" },
  "expect": "accept"
}
```

or, for a rejection:

```json
{
  "schema": { "...": "..." },
  "input": { "...": "..." },
  "expect": { "reject": "<error-code>" }
}
```

- `expect` is either the string `"accept"` or an object `{ "reject": <error-code> }`.
- `<error-code>` MUST be one of the codes from SPEC.md's **closed** error-code
  enum (`unknown-kind`, `missing-required`, `wrong-type`, `bad-ref`, …). A
  fixture may not use a code that SPEC.md does not define.

## Projection fixture shape

A `project/` fixture drives ordered attributed batches through the reference
server's `apply` and pins the resulting projection **and** the emitted event
log:

```json
{
  "schema": { "...": "the host schema the board was created with" },
  "batches": [
    { "actor": "alice", "ops": [ "<op>", "…" ], "expect": "accept" },
    { "actor": "bob", "ops": [ "<op>", "…" ], "expect": { "reject": "<code>" } }
  ],
  "expect": {
    "state": { "<id>": { "id": "<id>", "kind": "…", "data": {} } },
    "events": [ { "seq": 1, "actor": "alice", "op": "<op>" } ]
  }
}
```

- `batches` run in order. Each batch is one `apply(board, ops, actor)` call; its
  `expect` is the same `"accept"` / `{ "reject": <code> }` verdict as a validate
  fixture, asserted per batch.
- `expect.state` is the **final** projection (id → element) after every batch.
- `expect.events` is the **full** emitted log: one `{ seq, actor, op }` event per
  op that actually appended. Dedup-dropped ops and every op of a rejected
  (all-or-nothing) batch emit **nothing**, so they never appear here. `seq` is
  contiguous from 1.

## Layout

- `accept/` — fixtures whose `input` is valid against `schema` (`expect: "accept"`).
- `reject/` — fixtures whose `input` is invalid (`expect: { reject: <code> }`).
- `project/` — log→projection cases: batches folding to an `expect.state` and
  `expect.events` (multi-batch fold, dedup replay, all-or-nothing, shallow-merge
  update, delete, within-batch mint-then-reference, distinct attribution).

## Scope

The corpus is both validate/reject **and** log→projection server semantics: an
event log folding to an expected projected state, `op_id` dedup, and
all-or-nothing batch application. The `project/` cases landed with the reference
server (A3); the TS server runs the whole corpus today, and the Python twins
(A6) run the identical corpus.
