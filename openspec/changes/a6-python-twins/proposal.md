# A6 — python-twins

## Why

A5 finished the TS side: `@wboard/{core,server,mcp}` are published and the `spec/fixtures/` corpus is executable truth for TypeScript. But #456's contract is **symmetric twins** — "TS and Python twins run the same corpus in CI" is what makes the wire JSON, not Zod, the canonical shape. Today nothing proves the spec is implementable outside TS; a Python host has nothing to import. A6 ships the Python twin of the protocol semantics and wires it into the same gate, proven by the same fixture files. It trails the TS packages and blocks nothing.

## What Changes

- **New Python package `wboard` at `packages/python/`** — one package, `wboard.core` + `wboard.server` modules (semantics mirrored, not TS file structure). Toolchain: uv + pydantic v2 + pytest + mypy `--strict` + ruff, interpreter pinned via `.python-version` (3.13), `requires-python >= 3.12`, committed `uv.lock` as the exact pin. Rationale for every choice is settled in `context.md` — no re-litigation.
- **Core twin (`wboard.core`)**: Pydantic v2 models for the wire element `{id, kind, data}`, wire host schema (kinds/attributes, types `string|number|boolean|element|json`, `many`), the op envelope discriminated union, events, and the six tool request/response shapes; `PROTOCOL_VERSION = "0.1"`; the closed six-code error enum; `validate()` with verdicts identical to TS (first-failure, all-or-nothing, within-batch mint/delete tracking, ever-minted `duplicate-id`, finite-and-not-bool numbers, extras pass through, description-carrying messages).
- **Authoring twin**: the Pydantic authoring surface (#455: "Zod/Pydantic author → wire schema") — declare kinds and typed attributes in Python, compile to the wire schema, with a drift test proving compiler output always parses under the wire models.
- **Server twin (`wboard.server`)**: `BoardStore` protocol + `InMemoryBoardStore` (contiguous seqs from 1, atomic batch append, `copy.deepcopy` no-aliasing at every boundary), the pure `project()` fold (shallow-merge update, total over raw logs), and a synchronous `BoardService` (mint board ids, per-op `op_id` dedup before validation, all-or-nothing apply, cursor-based `get_events`, actor attribution, plain exception on unknown board).
- **Corpus conformance**: two Python runners twinning the TS ones — `wboard.core`'s validate runner over `accept/` + `reject/`, and the server runner over the **whole** corpus including `project/` — loading the same files from `spec/fixtures/` in place (repo-root-relative path), fail-not-skip on any stray/nested/hidden entry, the fixture-root layout closure guard, and enum closure asserted both ways.
- **Nx integration**: nx project `python` with cacheable `format`/`lint`/`typecheck`/`test` run-commands targets wrapping uv, so the unchanged root gate `pnpm check` runs Python automatically. Inputs declared honestly: project files minus `.venv`/tool caches; the `test` target additionally inputs `{workspaceRoot}/spec/fixtures/**`. No outputs (verdict-only), no `build` target (nothing to build pre-publish).
- **CI**: `ci.yml` gains a `setup-uv` step (pinned action + uv version) so the same `pnpm check` gate covers Python on every push.
- **Docs**: root `README.md` gets a Python paragraph (layout, uv requirement, not-yet-on-PyPI notice); `spec/fixtures/README.md`'s "Python twins (A6) must/will run" prose flips to present tense naming the Python runners.

Out of scope (deferred, not dropped): the Python MCP facade twin, WebSocket push, screenshot rendering, PyPI publishing / uv-nx release wiring, and any protocol change (no new codes, tools, or SPEC.md semantics).

## Capabilities

### New Capabilities

- `python-wire-twin`: Pydantic models for every wire shape + the closed error enum + `PROTOCOL_VERSION`, derived surfaces of the canonical JSON.
- `python-validation-twin`: `validate()` with verdicts identical to `@wboard/core` on every corpus fixture.
- `python-authoring-twin`: Pydantic schema authoring compiled to the wire schema, drift-tested.
- `python-server-twin`: store/fold/service with identical log, dedup, projection, and cursor semantics.
- `python-conformance`: the shared corpus executed from the same files by Python, fail-not-skip, inside the one `pnpm check` gate.

### Modified Capabilities

- `ci-gate`: the gate now provisions uv and runs the `python` project's targets; cache inputs stay honest per the cache correctness law.

## Impact

- `packages/python/**` — new: `pyproject.toml`, `uv.lock`, `.python-version`, `project.json`, `src/wboard/**`, `tests/**`, `LICENSE`, `README.md`.
- `.github/workflows/ci.yml` — setup-uv step.
- Root `README.md`, `spec/fixtures/README.md` — prose updates.
- `spec/SPEC.md`, `spec/fixtures/**/*.json` — **unchanged** (fixtures are mutated only transiently as positive controls, reverted clean).
- TS packages — untouched.
