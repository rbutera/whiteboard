Ordered clusters. Each cluster is a clean stopping point: land it, run `pnpm check`, commit, push, stop if the session is done. Within a cluster each numbered task is independently committable.

## Cluster 1 — package scaffold + nx wiring

- [x] 1.1 `packages/python/`: `pyproject.toml` (name `wboard`, version `0.1.0a0`, `requires-python = ">=3.12"`, deps `pydantic>=2,<3`; dev deps `pytest>=8,<9`, `mypy>=1,<2`, `ruff` exact-pinned), `.python-version` = 3.13, `src/wboard/{__init__.py, py.typed}` exporting `PROTOCOL_VERSION = "0.1"`, one trivial test, `LICENSE` (copy of root MIT), stub `README.md`. `uv sync` produces `uv.lock`; commit the lock.
- [x] 1.2 `packages/python/project.json`: nx project `python` with run-commands targets `format` (`uv run ruff format --check .`), `lint` (`uv run ruff check .`), `typecheck` (`uv run mypy src tests`), `test` (`uv run pytest`), all `cwd: packages/python`, cacheable, no outputs. Named input `pythonFiles` = `{projectRoot}/**/*` excluding `.venv/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`; `test` inputs additionally `{workspaceRoot}/spec/fixtures/**`. Verify with `pnpm nx show project python` that all four targets and their inputs are as declared.
- [x] 1.3 Ensure `.gitignore` covers `.venv/` and the Python tool caches; `pnpm check` runs the python targets and stays green. Add the setup-uv step (pinned) to `.github/workflows/ci.yml`. Commit.

## Cluster 2 — core wire models + error enum

- [x] 2.1 `wboard.core` wire models (pydantic v2, `extra` handling matching the wire: element `data` is an open dict): element, attribute/kind/wire-schema, op envelope discriminated union (`create`/`update`/`delete`, each with `op_id`), event `{seq, actor, op}`, and the six tool request/response shapes from SPEC.md §Wire shape. Tests: round-trip parse per shape from raw JSON dicts; unknown op verb fails.
- [x] 2.2 The closed error enum as a `Literal`/`StrEnum` plus an `ERROR_CODES` constant tuple (the corpus runner keys off it): `unknown-kind`, `missing-required`, `wrong-type`, `bad-ref`, `unknown-element`, `duplicate-id`. Exactly six; adding one is a protocol-version change. Commit.

## Cluster 3 — validate twin

- [x] 3.1 `wboard.core.validate(wire_schema, ops, existing: Mapping[str, str])` → ok, or first-failure `{code, message}`; semantics per context.md §Semantics: in-order, all-or-nothing, within-batch mint/delete tracking, ever-minted `duplicate-id` (create→delete→create rejects), `bad-ref` on non-live element refs, updates type-checked against the target's kind, extras pass through, `many` = list of base type, numbers finite and not `bool`, messages carry the attribute description on typed failures.
- [x] 3.2 Unit tests: at least one accept + one reject per code, extras-pass-through, within-batch mint-then-reference, update partial-merge typing, create-delete-create, `True` rejected for a number attribute. Commit.

## Cluster 4 — server twin

- [ ] 4.1 `wboard.server` store: `BoardStore` Protocol (create_board / get_schema / append / get_events) + `InMemoryBoardStore` — seqs contiguous from 1 assigned at append, batch lands atomically, `copy.deepcopy` at every boundary (stored and returned values never alias caller memory). Tests: contiguity, no-aliasing (mutate what you passed/read → stored state unmoved), unknown-board reads return empty.
- [ ] 4.2 `project(events)` pure fold → elements-by-id + id→kind map: create inserts, update shallow-merges top-level `data` keys, delete removes, absent-id update/delete is a no-op. Tests mirror the TS fold tests.
- [ ] 4.3 `BoardService` (sync): create_board mints an id; `apply(board_id, ops, actor)` dedups by `op_id` against log + earlier-in-batch **before** validation (all-duplicate → ok, appends nothing), validates against the projection's kinds, rejects verbatim appending nothing, else appends one attributed event per survivor; `get_events(board_id, cursor=0)` per SPEC.md §Cursor; `get_state`; `describe` reports `protocol_version`; unknown board raises a plain exception everywhere. Tests: replay idempotence, mid-batch reject appends nothing, attribution, cursor round-trip. Commit.

## Cluster 5 — authoring twin

- [ ] 5.1 Pydantic authoring surface: declare kinds + typed attributes in Python and `compile_to_wire()` → wire schema. One honest layer — authoring is convenience, wire is truth.
- [ ] 5.2 Drift test: every authored example compiles to output the wire models parse, and validating via authored schemas agrees with `validate()` on the same inputs. Commit.

## Cluster 6 — corpus runners

- [ ] 6.1 Shared test loader (twin of the TS `loadFixtures`/`assertRootLayout`): fixtures root = repo-root-relative `Path(__file__).resolve().parents[N] / "spec" / "fixtures"`, assert it exists; root layout closed to `{.gitkeep, README.md, accept, reject, project}`; per-dir loading errors on any stray file, nested dir, or non-`.gitkeep` hidden entry — fail, never skip; JSON/read errors propagate. Tests for each guard via tmp dirs (mirror the TS loader tests).
- [ ] 6.2 Core corpus runner: every `accept/`+`reject/` fixture through `validate()` from an empty board; exact code on reject; enum closure both ways (every code has ≥1 reject fixture; every fixture code is in `ERROR_CODES`); asserts the corpus is non-empty.
- [ ] 6.3 Server corpus runner: the whole corpus through `BoardService` — accept applies cleanly, reject returns the code and leaves the log empty, `project/` fixtures fold batch-by-batch to the exact `expect.state` and `expect.events` (seqs, actors, ops deep-equal). Commit.
- [ ] 6.4 Docs: root `README.md` Python paragraph (layout, uv requirement, not on PyPI yet); `spec/fixtures/README.md` present-tense Python runner status. Commit.

## Cluster 7 — verification (positive controls)

- [ ] 7.1 Clean-checkout gate: `pnpm install`, `uv` present, `pnpm check` green with `python:{format,lint,typecheck,test}` visibly in the run.
- [ ] 7.2 Positive control, corpus: flip one fixture's `expect` (accept→reject or swap a code) → the **Python** runners fail `pnpm check`; revert; `git status` clean. Evidence shown.
- [ ] 7.3 Positive control, semantics: change the fold's shallow-merge to whole-`data` replace → a `project/` fixture fails in Python; revert. Evidence shown.
- [ ] 7.4 Positive control, fail-not-skip: stray file in `spec/fixtures/` root and a nested dir in `accept/` → Python loaders throw; revert. Cache honesty: edit a fixture's content → `pnpm nx run python:test` re-executes (no stale hit); revert.
- [ ] 7.5 Final clean `pnpm check`, commit, push, verify origin/main == HEAD, output `<promise>A6-COMPLETE</promise>`.

## Notes

- SPEC.md is the authority over the TS source on any discrepancy — file the discrepancy, do not silently pick a side.
- No SPEC.md semantic edits, no new error codes, no fixture additions except transient positive controls (always reverted).
- Out of scope: Python MCP facade, WS, screenshot, PyPI publishing (all deferred to later changes).
