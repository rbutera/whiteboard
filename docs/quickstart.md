# Quickstart

> Normative source: [`spec/SPEC.md`](../spec/SPEC.md). This page shows the
> shipped APIs; on any conflict with the wire contract, SPEC wins.

From nothing to a board you author both ways — as an embedded library and
through the MCP facade — in one sitting.

## Install

The packages are on npm under the `alpha` dist-tag:

```sh
npm install @wboard/core@alpha @wboard/server@alpha @wboard/mcp@alpha
```

- `@wboard/core` — the wire shapes, the host-schema authoring kit, typed `validate`.
- `@wboard/server` — the embeddable `BoardService` and its `project` fold.
- `@wboard/mcp` — the stateless MCP facade over any board service.

## Embed a board service

`BoardService` is an in-process library — no transport, no session, no auth. A
board declares its host schema at creation. Author the schema with
[`defineSchema`](guides/host-schemas.md) and lower it to the wire with
`compileToWire`:

```ts
import { compileToWire, defineSchema } from "@wboard/core";
import { BoardService, project } from "@wboard/server";

const schema = defineSchema({
  note: {
    description: "a sticky note",
    attributes: {
      text: { description: "the note body", type: "string", required: true },
    },
  },
});

const service = new BoardService();
const boardId = await service.createBoard(compileToWire(schema));
```

## Apply ops

`apply` takes a flat, ordered ops list, an actor string, and is
all-or-nothing. Each op carries an `op_id` that dedups it against the log:

```ts
const result = await service.apply(
  boardId,
  [{ op: "create", op_id: "o1", element: { id: "n1", kind: "note", data: { text: "hello" } } }],
  "alice",
);
// result -> { ok: true }   (or { ok: false, code, message } on a rejected batch)
```

A rejected batch returns one [closed error code](guides/host-schemas.md) and
appends nothing.

## Fold state with `project`

The log is the truth; state is a projection of it. Read the events and fold
them, or ask the service for the projection directly:

```ts
const { events } = await service.getEvents(boardId); // { events, cursor }
const { elements } = project(events); // ReadonlyMap<id, Element>
elements.get("n1"); // { id: "n1", kind: "note", data: { text: "hello" } }

// Or, the library shortcut that folds for you:
const state = await service.getState(boardId); // same ReadonlyMap
```

`project` is a pure fold: the same log always yields the same state. See
[concepts](concepts.md) and [`spec/SPEC.md` §Projection semantics](../spec/SPEC.md#projection-semantics).

## The same board through MCP

The MCP facade exposes the **same** service as Model Context Protocol tools, so
an agent authors the very board you created above through the same stateless
calls. Wrap the existing `service` — passing it is what makes `facade.service`
the one holding `boardId` — and connect a real MCP client over the in-process
`InMemoryTransport`:

```ts
import { createWhiteboardMcpServer } from "@wboard/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Wrap the SAME service, so the tools act on the board created above.
const facade = createWhiteboardMcpServer({ service });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "quickstart", version: "0" });
await facade.server.connect(serverTransport);
await client.connect(clientTransport);

// Author the original board over MCP. A fresh op_id — o1 is already applied, so
// reusing it would dedup to a no-op.
await client.callTool({
  name: "apply_ops",
  arguments: {
    board_id: boardId,
    ops: [{ op: "create", op_id: "o2", element: { id: "n2", kind: "note", data: { text: "hi from MCP" } } }],
  },
});

// The op landed on the original board — getState now holds both notes.
const both = await service.getState(boardId); // Map { n1, n2 }
```

The MCP tool names are `verb_noun` (`create_board`, `apply_ops`, `get_events`,
…); each returns its wire response verbatim as `structuredContent`. See the
[MCP facade guide](guides/mcp-facade.md).

## Next

- [Concepts](concepts.md) — the model behind these calls.
- [Host schemas](guides/host-schemas.md) — designing the schema a board declares.
- [`examples/kanban`](../examples/kanban) and [`examples/diagramming`](../examples/diagramming) — the runnable versions of both paths above.
