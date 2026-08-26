Ordered clusters. Each cluster is a clean stopping point: land it, run `pnpm check`, commit, push, stop if the session is done. Within a cluster each numbered task is independently committable.

## Cluster 1 — wire primitives

- [x] 1.1 Add `zod` to `@whtbrd/core` (runtime dependency, current stable major). `pnpm check` stays green.
- [x] 1.2 `src/wire/element.ts`: Zod schema + inferred type for the element `{id: string, kind: string, data: Record<string, unknown>}`. Test: valid element parses; missing `id`/`kind` fails.
- [x] 1.3 `src/wire/schema.ts`: Zod schemas + types for the wire host schema — attribute `{name, description, type: "string"|"number"|"boolean"|"element"|"json", required: boolean, many?: boolean}`, kind `{id, description, attributes: Attribute[]}`, wire schema = `{kinds: Kind[]}`. Tests cover each attribute type and `many`.
- [x] 1.4 `src/wire/ops.ts`: the flat ordered op envelope — `{op: "create", op_id, element}`, `{op: "update", op_id, id, data}`, `{op: "delete", op_id, id}` — as a discriminated union, plus the ops-list schema. Tests: each variant parses; unknown `op` fails.
- [x] 1.5 `src/wire/errors.ts`: the closed error-code enum as a Zod enum + type: `unknown-kind`, `missing-required`, `wrong-type`, `bad-ref`, `unknown-element`, `duplicate-id`. Export the list as a constant (the corpus runner and SPEC.md both key off it). If a code proves undetectable by pure validation during Cluster 3, delete it here and in SPEC.md in the same commit.
- [x] 1.6 Re-export everything from `src/index.ts` alongside `PROTOCOL_VERSION`. Commit.

## Cluster 2 — five tool shapes

- [x] 2.1 `src/wire/tools.ts`: Zod request/response schemas + inferred types for the five tools, per #455 v3 — `create` (host schema in, `board_id` string out), `schema` (`board_id` in, wire schema out), `apply` (`board_id` + ops list in; accepted result or a single rejection `{code, message}` out — all-or-nothing), `describe` (`board_id` in; board metadata + `protocol_version` out), `events` (`board_id` + cursor in; ordered attributed events out) — plus `screenshot` (`board_id` in, rendered image out). `board_id` is a plain string everywhere; no session or connection concepts anywhere in these shapes.
- [x] 2.2 Tests: one round-trip parse per tool request and response; a rejection response carries exactly one enum code. Commit.

## Cluster 3 — typed validation

- [x] 3.1 `src/validate.ts`: `validate(wireSchema, ops, existingIds: ReadonlySet<string>)` → `{ok: true}` or `{ok: false, code, message}` (first failure wins; message includes the attribute's description for typed failures). Checks, in op order with within-batch minting/deletion tracked: unknown kind → `unknown-kind`; required attribute absent on create → `missing-required`; declared attribute value vs type (`many` = array of that type) → `wrong-type`; element-typed attribute referencing an id neither existing nor minted earlier → `bad-ref`; update/delete of an unknown id → `unknown-element`; create reusing a live id → `duplicate-id`. Undeclared data fields pass through untouched.
- [ ] 3.2 Unit tests: at least one accept and one reject per code, plus extras-pass-through, within-batch mint-then-reference accept, and update semantics (partial `data` merge validated against declared types). Commit.

## Cluster 4 — host-schema kit + drift test

- [ ] 4.1 `src/authoring.ts`: `defineSchema(...)` — the TS authoring surface a host uses to declare kinds and typed attributes (full type inference; `element` attributes referenced by kind or plain id), and `compileToWire(authored)` producing a wire schema. Keep it one honest layer: authoring is convenience, wire is truth.
- [ ] 4.2 Per-kind data typing: from an authored schema, expose the inferred TS type (and a Zod validator) for a kind's `data`, so a host gets compile-time checking of the elements it writes.
- [ ] 4.3 Drift test: every authored example in the test suite compiles to output that parses under the wire-schema Zod schema, and validating via the authored kit agrees with `validate()` on the same inputs. This is the Zod→wire derivation-chain guard the plan demands. Commit.

## Cluster 5 — populate the corpus + runner

- [ ] 5.1 Fill `spec/fixtures/accept/` and `spec/fixtures/reject/`: language-neutral JSON `{schema, input: {ops}, expect}` run from an empty board. Cover: each attribute type, `many`, optional-vs-required, extras pass through, within-batch mint-then-reference, multi-op batches — and at least one reject fixture per enum code, each named for what it proves.
- [ ] 5.2 Corpus runner test in `@whtbrd/core`: load every fixture under `spec/fixtures/{accept,reject}`, parse `schema` with the wire schema, run `validate()`, assert the verdict matches `expect` (exact code on reject). Enforce enum closure both ways: every enum code appears in ≥1 reject fixture; every fixture's reject code is in the enum. The runner must fail on an unreadable or shape-invalid fixture, never skip it.
- [ ] 5.3 Update `spec/fixtures/README.md`: drop the "intentionally empty" skeleton status; state that A2 populated validate/reject and A3 adds log→projection cases. Commit.

## Cluster 6 — SPEC.md normative + verification

- [ ] 6.1 SPEC.md **Wire shape**: replace the draft stub with the concrete JSON shapes of the five tool requests/responses, the element, the op envelope, and the wire host schema — matching the shipped Zod exports exactly (SPEC.md must not lie). Note that Zod/Pydantic are derived surfaces; the JSON here is canonical.
- [ ] 6.2 SPEC.md **Error codes**: replace the draft table with the finalized closed enum (one row per code, meaning, and the tool response it appears in); state the closure rule (no new codes without a protocol-version discussion) and remove the `_Draft (A2)_` markers from both sections.
- [ ] 6.3 Run the packet's verification: clean `pnpm check`; positive controls (flip a fixture's expect → runner fails; break compiler output → drift test fails; add a bogus-code fixture → closure assertion fails; revert each). Show evidence, commit, push, output `<promise>A2-COMPLETE</promise>`.

## Notes

- `@whtbrd/server` gets no new behavior in A2 — it only has to keep compiling against core's exports.
- No span/anchor/relation/presentation concepts anywhere (#463 R27/R28): quote anchoring is host data via element-typed + json attributes.
