# Context packet — A6 python-twins

Track A of the board rebuild (plan: `docs/developing/plans/board-rebuild-plan.md` in rbutera/rennet; tracker: https://github.com/rbutera/rennet/issues/463). This repo is public and MIT. Rule Zero governs: no consent gates, no ceremony, no speculative hardening. The decision tickets below are CLOSED — implement them, never re-open or contradict them.

A1–A5 landed: the nx monorepo, `@wboard/core` (wire contract, validate, authoring kit), `@wboard/server` (store / project fold / BoardService), `@wboard/mcp` (facade), the populated `spec/fixtures/` corpus with two TS runners, and the `0.1.0-alpha` npm release. **A6 TRAILS everything and blocks nothing** — it may fall behind the TS packages without holding up any other workstream, and no other workstream waits on it.

## Loop rules

The loop rules from `openspec/changes/a1-bootstrap-monorepo/context.md` apply verbatim. In brief:

- Fresh context per session; state lives on disk (this packet, `tasks.md`, git history). Assume interruption at any moment.
- Session start: read this packet + `tasks.md`, `git log --oneline -15`, run `pnpm check`, pick the highest unfinished task. Search before assuming something is unimplemented.
- Commit per completed task with a descriptive message; push freely (pushing is not publishing). No AI attribution or co-author trailers.
- **No placeholder or stub implementations.** If a task cannot be completed fully, leave it unchecked with a note.
- Verification closes the loop, not self-report: evidence shown, never asserted.

## Objective

Ship the Python twin of the protocol's semantics: Pydantic wire models, `validate()` with identical verdicts, and a reference server (store, fold, service) with identical log/projection behavior — proven by running the **same** `spec/fixtures/` corpus, loaded from the same files, fail-not-skip, with the same fixture-root closure guards the TS runners have. Passing the corpus is what "implements protocol 0.1" means (#456); the twin mirrors **semantics, not TS file structure**.

## Decisions (settled here — do not re-litigate)

- **One package, `wboard`, at `packages/python/`** — modules `wboard.core` and `wboard.server` (wire, validate, authoring; store, project, service). One version, one lockfile, one toolchain beats two-package plumbing nobody consumes yet; split only if a server-less Python consumer ever materializes. Import name and future PyPI distribution name are both `wboard` (mirrors the npm scope).
- **Toolchain — boring on purpose**: `uv` (env + lock), `pydantic` v2 (wire models — #455 names Pydantic as the Python authoring surface), `pytest`, `mypy --strict`, `ruff` (format + lint). Compatible-release ranges in `pyproject.toml` (`pydantic>=2.11,<3` — 2.11+ for `serialize_by_alias`, `pytest>=8,<9`, `mypy>=1,<2`, exact-pinned `ruff`); the committed `uv.lock` is the exact pin. `.python-version` pins the dev/CI interpreter to 3.13; `requires-python = ">=3.12"` (PEP 695 typing floor, broad availability).
- **Corpus location**: repo-root-relative from the test module, exactly like the TS runners' `resolve(dirname, "../../../spec/fixtures")` — `Path(__file__).resolve().parents[N] / "spec" / "fixtures"` with an assert that the directory exists (a wrong `N` must fail loudly, never yield zero fixtures silently). The corpus is read in place; it is never copied into the package.
- **Nx integration — Python joins `pnpm check`**: an nx project `python` (`packages/python/project.json`, run-commands wrapping `uv run …`) with targets named `format`, `lint`, `typecheck`, `test`, so the existing root gate `nx run-many -t format,lint,typecheck,test,build` picks it up with zero gate changes — one gate command stays the whole truth; a second, Python-only gate command would rot. No `build` target (nothing to build until a publish change exists; run-many skips absent targets). Cache correctness law holds: a `pythonFiles` named input = `{projectRoot}/**/*` minus `.venv/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, and the `test` target's inputs additionally include `{workspaceRoot}/spec/fixtures/**` (the verdict reads the fixtures) and `{workspaceRoot}/spec/SPEC.md` is NOT an input (the verdict never reads it). Targets are verdict-only: declare no outputs.
- **Sync, not asyncio**: the reference service is synchronous — the in-memory store does no I/O, and CPython's per-call execution makes append atomic the same way single-threaded JS does. A future durable store owns its own concurrency story.
- **No-aliasing**: `copy.deepcopy` at every store boundary (create/get/append/read), the twin of the TS `structuredClone` ownership rule — fixtures are plain JSON, so deepcopy is total.

## Decision tickets (the spec — closed, permalinked)

- https://github.com/rbutera/rennet/issues/456 — **primary authority for A6**: TS + Python symmetric twins; `spec/` corpus is the conformance authority ("TS and Python twins run the same corpus in CI"); wire JSON is canonical, Zod/Pydantic are derived surfaces, neither language normative.
- https://github.com/rbutera/rennet/issues/455 — tool shapes v3; "Zod/Pydantic author → wire schema".
- https://github.com/rbutera/rennet/issues/453 — statelessness: `board_id` a plain minted string; dedup via client op-ids + event log.
- https://github.com/rbutera/rennet/issues/463 — Track A packet; A6 trails, never blocks.
- `spec/SPEC.md` — the normative protocol text A1–A3 finalized. **SPEC.md wins over the TS source on any discrepancy** (then file the discrepancy).

## Semantics to twin (the exact behaviors, from SPEC.md + the TS reference)

- **Closed six-code enum**: `unknown-kind`, `missing-required`, `wrong-type`, `bad-ref`, `unknown-element`, `duplicate-id`. Exactly these; adding one is a protocol-version change, not an A6 liberty.
- **`validate(wire_schema, ops, existing: Mapping[str, str])`** — stateless, in-op-order, first failure wins, all-or-nothing; within-batch minting AND deletion tracked; `duplicate-id` on create reusing a live id **or any id ever minted in the batch, even if since deleted** (create→delete→create rejects); `bad-ref` checks liveness (present or minted earlier); updates type-check partial `data` against the target's kind (pre-existing via the `existing` map, or in-batch); undeclared data fields pass through; `number` means finite (NaN/±Inf cannot cross JSON — in Python also reject `bool` masquerading as number, `isinstance(True, int)` is a Python-only trap the TS side never faces); `many` = list of the base type; messages carry the attribute's description on typed failures.
- **Server `apply`**: per-op `op_id` dedup against log + earlier-in-batch **before** validation; all-duplicate batch → `{ok: true}`, appends nothing (idempotent replay); then validate against the projection's id→kind map; reject returns the code verbatim and appends nothing; accept appends one event per surviving op, atomically, actor recorded.
- **Events**: `{seq, actor, op}`; seqs contiguous from 1, assigned by the store; batches land contiguously or not at all; `get_events(board_id, cursor)` returns `seq > cursor` in order, returned cursor = last served seq or the request's cursor.
- **Fold**: create inserts; update **shallow-merges** top-level `data` keys (supplied overwrite, untouched survive, passthrough survives; below top level replaced); delete removes; update/delete of an absent id is a fold no-op (fold stays total).
- **Unknown `board_id`** raises a plain exception everywhere — the closed enum belongs to `apply` validation only.

## Out of scope (deferred, not dropped — #456's full-fat end state arrives in later changes)

- **Python MCP facade twin**, the WebSocket push channel, and screenshot rendering.
- **PyPI publishing** and uv/nx release wiring (npm-only release shipped in A5; the Python release is its own later change).
- Any protocol change: no new codes, no new tools, no SPEC.md semantic edits. SPEC.md prose may gain a one-line "Python twin exists" status note only.
- Rennet-side anything.

## Verification (end-to-end, positive controls that can fail)

1. From a clean checkout with uv installed: `pnpm install && pnpm check` — green, with the `python` project visibly running format/lint/typecheck/test in the gate.
2. Corpus is live in Python: flip one fixture's `expect` → the **Python** corpus runner fails `pnpm check`; revert clean (`git status` clean). Evidence shown.
3. Semantics are load-bearing: break the fold's shallow-merge (deep-merge or replace instead) → a `project/` fixture fails in Python; revert. Evidence shown.
4. Fail-not-skip is live: drop a stray file into `spec/fixtures/` root and a nested dir into `accept/` → the Python loaders throw; revert. Evidence shown.
5. Cache honesty: after a green run, touch a fixture file's content → `pnpm nx run python:test` re-executes (no stale cache hit); revert.

## Completion sigil

`<promise>A6-COMPLETE</promise>`
