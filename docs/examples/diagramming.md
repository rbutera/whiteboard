# Example: diagramming (the MCP path)

> Normative source: [`spec/SPEC.md` §MCP facade](../../spec/SPEC.md#mcp-facade).
> The runnable truth is
> [`examples/diagramming/src/main.ts`](../../examples/diagramming/src/main.ts) —
> the fences below follow it; when they differ, the source is right.

`examples/diagramming` drives the **MCP path** — a real MCP `Client` over the
in-process `InMemoryTransport` against `createWhiteboardMcpServer()` — end to
end, with plain `assert`s. It runs inside `pnpm check`, so the MCP facade cannot
silently drift from what this page shows.

Run it directly:

```sh
pnpm nx build diagramming && node examples/diagramming/dist/main.js
# diagramming example: ok
```

## What it demonstrates

- **Element-ref integrity.** A `node`/`edge` schema where an edge's `from`/`to`
  are `element` refs. The valid graph creates three nodes and two edges whose
  refs resolve.
- **Rejection as data.** A deliberate `bad-ref` batch — an edge to a nonexistent
  node — comes back as a **normal** tool result `{ ok: false, code: "bad-ref" }`,
  not an `isError`. The closed enum is protocol data the agent reads. A
  follow-up `get_events` proves the rejected batch appended nothing
  (all-or-nothing).
- **Wire-client fold.** The client reads `get_events` and folds it itself. This
  log is create-only, so the fold collects created elements; the general fold is
  `project` (see the [kanban example](kanban.md)).
- **Screenshot read-back.** `screenshot` returns the default schematic SVG —
  asserted to be `image/svg+xml` with non-empty base64 bytes.
- **Handshake.** `describe_board` reports `protocol_version === "0.1"`.

## The flow

```ts
const facade = createWhiteboardMcpServer();
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "diagramming-example", version: "0" });
await facade.server.connect(serverTransport);
await client.connect(clientTransport);

const created = await client.callTool({ name: "create_board", arguments: { schema: compileToWire(schema) } });
const boardId = (created.structuredContent as { board_id: string }).board_id;

// A valid 3-node / 2-edge graph.
await client.callTool({ name: "apply_ops", arguments: { board_id: boardId, ops: graph } });

// A bad-ref batch: a NORMAL result carrying the enum code, changing nothing.
const rejected = await client.callTool({ name: "apply_ops", arguments: { board_id: boardId, ops: badBatch } });
// rejected.isError is falsy; rejected.structuredContent -> { ok: false, code: "bad-ref", message }

// get_events shows only the 5 valid creates — the rejected batch appended nothing.
const shot = await client.callTool({ name: "screenshot", arguments: { board_id: boardId } });
// shot.structuredContent.mime_type === "image/svg+xml", base64 non-empty

const described = await client.callTool({ name: "describe_board", arguments: { board_id: boardId } });
// described.structuredContent.protocol_version === "0.1"
```

See the [MCP facade guide](../guides/mcp-facade.md) for tool names, result
shapes, and the renderer seam. The library counterpart is
[`examples/kanban`](kanban.md).
