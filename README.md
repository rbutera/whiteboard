# whiteboard

A minimal, host-agnostic shared-canvas protocol: an append-only attributed event log as truth, board state as projection, and five stateless tools for agents and humans to author the same board.

- `@wboard/core` — authoring: element shapes, host-schema kit, Zod → wire validation
- `@wboard/server` — reference board service: event log, projections; embeddable in-process with pluggable persistence
- MCP facade — the five tools over any board service, stateless by construction
- `spec/` — SPEC.md plus a shared JSON fixture corpus; Python twins conform to the same corpus
- `packages/python/` — the Python twin (`wboard.core` + `wboard.server`), proven by running the same `spec/fixtures/` corpus

## Python twin

`packages/python/` holds `wboard`, a Python twin of `@wboard/core` +
`@wboard/server`: Pydantic wire models, `validate()`, and a synchronous
reference server with identical log/projection semantics. It runs the same
`spec/fixtures/` corpus in the same `pnpm check` gate. Development uses
[uv](https://docs.astral.sh/uv/) (`uv sync`, `uv run pytest`); see
`packages/python/README.md`. Not yet published to PyPI — install from source.

Status: pre-alpha, under active build.

The packages are on npm under the `alpha` dist-tag: `npm install @wboard/core@alpha @wboard/server@alpha @wboard/mcp@alpha`.

## Docs

[`docs/`](docs/README.md) explains and shows the protocol (`spec/SPEC.md` stays
the normative source): a [quickstart](docs/quickstart.md),
[concepts](docs/concepts.md), and guides for
[host schemas](docs/guides/host-schemas.md),
[embedding the server](docs/guides/embedding-the-server.md), and the
[MCP facade](docs/guides/mcp-facade.md).

Two runnable worked examples run inside `pnpm check`:

- [`examples/kanban`](examples/kanban) — the library path (`BoardService` + `project`). Walkthrough: [docs/examples/kanban.md](docs/examples/kanban.md).
- [`examples/diagramming`](examples/diagramming) — the MCP path (a real MCP client over `InMemoryTransport`). Walkthrough: [docs/examples/diagramming.md](docs/examples/diagramming.md).

MIT licensed.
