## Why

A1 left `@wboard/core` exporting one constant. The protocol's locked shapes (rbutera/rennet#455, validated v3) exist only as prose in SPEC.md and closed tickets; nothing enforces them, the fixture corpus is empty, and the error-code enum is still a draft. A3 (server), A4 (facade), and A6 (Python twins) all consume the wire contract as code — A2 ships it: Zod schemas + types for the five tools, the host-schema authoring kit, typed validation, the finalized closed error enum, and a populated corpus that a test actually runs.

## What Changes

- **Wire contract in `@wboard/core`**: Zod schemas + inferred types for the element `{id, kind, data}`, the wire host schema (kinds `{id, description, attributes}`; attributes `{name, description, type, required, many?}`, types `string|number|boolean|element|json`), the flat ordered `apply` op envelope (`create|update|delete`, each with `op_id`), and the request/response shapes of all five tools — `create`, `schema`, `apply`, `describe`, `events` — plus `screenshot`. The wire JSON is canonical; Zod describes it.
- **Closed error-code enum, finalized**: `unknown-kind`, `missing-required`, `wrong-type`, `bad-ref`, `unknown-element` (an update/delete targets an id that does not exist), `duplicate-id` (a create reuses an id that already exists or was minted earlier in the batch). Each code names one failure family pure validation can detect from schema + known ids. Closed in both directions: every code has ≥1 reject fixture; no fixture may use an undefined code. If implementation proves a code undetectable by pure validation, drop it in this change and update SPEC.md — do not ship a dead code.
- **Host-schema kit**: the authoring API a host uses to declare kinds and typed attributes in TS, and the compiler from that authored form to the wire schema declared at board creation, with per-kind inferred TS types for element data. A drift test proves compiler output always parses under the wire-schema Zod schema (the Zod→wire derivation chain cannot silently diverge).
- **Typed validation**: `validate(wireSchema, ops, existingIds)` → accept, or reject with exactly one enum code and a precise message carrying the attribute's description. All-or-nothing: an invalid batch reports rejection and implies no change. Undeclared data fields pass through unvalidated. Later ops may reference ids minted earlier in the same list.
- **Corpus populated**: `spec/fixtures/accept/` and `reject/` filled with `{schema, input, expect}` cases (input = apply ops from an empty board); a `@wboard/core` test loads and runs every fixture and enforces enum closure. Log→projection fixtures remain A3.
- **SPEC.md**: **Wire shape** and **Error codes** sections rewritten from draft to normative, matching the shipped schemas exactly.

Out of scope: server/event-log/projection logic (A3), MCP facade (A4), release (A5), Python (A6), docs site (A7), and any concept #453–#456 excluded — no presentation, relations, attention, or span primitive (quote anchoring is host data per #463's R27/R28 comment).

## Capabilities

### New Capabilities

- `wire-contract`: the five tool shapes, element/op/host-schema wire types, and the closed error-code enum as exported Zod schemas + types.
- `host-schema-kit`: TS authoring of a host schema and its compilation to the wire schema, drift-tested.
- `typed-validation`: stateless batch validation against a declared host schema — all-or-nothing, extras pass through.
- `conformance-corpus`: the populated accept/reject fixture corpus plus the runner that makes it executable truth.

### Modified Capabilities

- `spec-skeleton`: SPEC.md's Wire shape and Error codes sections go from draft to normative; the fixtures README's "intentionally empty" status ends.

## Impact

- `packages/core/src/**` — new modules for wire types, tools, authoring kit, validation, plus their tests and the corpus runner; `zod` added as a runtime dependency of `@wboard/core` (the only new dependency).
- `spec/fixtures/accept/*.json`, `spec/fixtures/reject/*.json` — populated; `spec/fixtures/README.md` status updated.
- `spec/SPEC.md` — Wire shape + Error codes finalized.
- `@wboard/server` untouched except that it must still compile and pass against the new core exports.
