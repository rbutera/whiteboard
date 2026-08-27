# wboard (Python)

The Python twin of the whiteboard protocol — wire models, `validate()`, and a
reference server (store, projection fold, `BoardService`) whose semantics mirror
`@wboard/core` and `@wboard/server`. Conformance is proven by running the shared
`spec/fixtures/` corpus, the same files the TypeScript twins run.

- `wboard.core` — Pydantic wire models, the closed six-code error enum,
  `PROTOCOL_VERSION`, `validate()`, and the authoring surface.
- `wboard.server` — `BoardStore` / `InMemoryBoardStore`, the pure `project()`
  fold, and the synchronous `BoardService`.

## Development

Requires [uv](https://docs.astral.sh/uv/). From this directory:

```sh
uv sync          # create the env from the pinned lockfile
uv run pytest    # run the tests (including the shared corpus)
uv run mypy src tests
uv run ruff check .
uv run ruff format --check .
```

These run automatically as the `python` Nx project in the repo's `pnpm check`
gate.

Not yet published to PyPI; install from source for now.
