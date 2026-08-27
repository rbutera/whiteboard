# Whiteboard docs

> Normative source: [`spec/SPEC.md` §Protocol version](../spec/SPEC.md#protocol-version).
> These pages explain and show; on any conflict, SPEC wins.

These pages **explain and show** the whiteboard protocol. They are not the
authority: [`spec/SPEC.md`](../spec/SPEC.md) is the single normative source for
the wire contract, and on any conflict **SPEC wins**. Every page here carries a
banner naming the SPEC section it draws from and links there rather than
restating a normative table.

## The map

| Page | What it covers |
| ---- | -------------- |
| [`quickstart.md`](quickstart.md) | Install `@alpha`, embed a `BoardService`, apply ops, fold state with `project`, then drive the same board through the MCP facade. |
| [`concepts.md`](concepts.md) | The model: event log as truth, state as projection, statelessness, host schemas own meaning, attribution is data not auth. |
| [`guides/host-schemas.md`](guides/host-schemas.md) | Designing a host schema: kinds, the five attribute types, `element` refs, `many`, required vs passthrough, the `defineSchema`/`compileToWire` kit, all-or-nothing rejection. |
| [`guides/embedding-the-server.md`](guides/embedding-the-server.md) | Embedding `BoardService` in-process, the `BoardStore` persistence seam, same-board serialization, reading state as a library API vs folding `events` on the wire. |
| [`guides/mcp-facade.md`](guides/mcp-facade.md) | The MCP facade: the `wboard-mcp` stdio bin, in-process embedding, `verb_noun` tool names, rejections-as-results, `get_events` polling vs the WS push channel, pluggable `BoardRenderer`. |
| [`examples/kanban.md`](examples/kanban.md) | Walkthrough of the runnable [`examples/kanban`](../examples/kanban) package — the library path. |
| [`examples/diagramming.md`](examples/diagramming.md) | Walkthrough of the runnable [`examples/diagramming`](../examples/diagramming) package — the MCP path. |

Per-package READMEs ([`core`](../packages/core/README.md),
[`server`](../packages/server/README.md), [`mcp`](../packages/mcp/README.md))
carry one install line and one minimal snippet each. These docs go deeper and
link to them.

## Docs vs SPEC

`spec/SPEC.md` defines the wire contract, the closed error enum, projection
semantics, the reference-server requirement, and the MCP facade. It is
normative. These docs teach the *why* and show runnable *how*; where a shape,
code, or guarantee matters, the page links to the SPEC section that owns it.
When a doc and SPEC disagree, the doc is wrong.

The two **worked examples** ([kanban](../examples/kanban),
[diagramming](../examples/diagramming)) are the drift alarm: they are real
workspace packages whose assert-backed scripts run inside `pnpm check`. If the
packages' APIs or semantics move away from what these docs show, the gate goes
red.

## Two version axes

Two versions travel with the protocol, and they move independently:

- **Package semver** — each `@wboard/*` npm package's version, currently
  `0.1.0-alpha.2`. This bumps on every release: bug fixes, new APIs, packaging
  changes. It is an npm concern.
- **Protocol version** — the version of the wire contract itself, currently
  `"0.1"`, owned by SPEC.md and exported as `PROTOCOL_VERSION` from
  `@wboard/core`. A service surfaces it through the MCP `describe_board`
  handshake so a client can learn what wire contract a board speaks. It bumps
  only when the wire shapes or the error enum change.

A library can publish many npm versions while implementing the same protocol
version `"0.1"`. See [`spec/SPEC.md` §Protocol version](../spec/SPEC.md#protocol-version).
