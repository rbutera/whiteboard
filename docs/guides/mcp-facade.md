# Guide: the MCP facade

> Normative source: [`spec/SPEC.md` §MCP facade](../../spec/SPEC.md#mcp-facade).
> This guide shows `@wboard/mcp`; the tool-name binding and result contract are
> SPEC's.

The MCP facade exposes the reference service as [Model Context
Protocol](https://modelcontextprotocol.io) tools, so an agent authors a board
through the same stateless calls a human does. It is a **thin translator, not a
second service**: every tool call is exactly one `BoardService` call (bar
`screenshot`, which pairs schema + state before rendering), and the facade holds
zero board state and zero per-connection state.

## Two ways to run it

**Embedded, in-process.** Build a facade over a host-supplied service and
connect a client over any MCP transport. In-process, that is `InMemoryTransport`:

```ts
import { createWhiteboardMcpServer } from "@wboard/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const facade = createWhiteboardMcpServer({ service: myService }); // service optional
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "app", version: "0" });
await facade.server.connect(serverTransport);
await client.connect(clientTransport);
```

`createWhiteboardMcpServer` takes optional `service` (default: a fresh in-memory
`BoardService`), `renderer`, and `defaultActor` (default `"agent"`). A host
passes its own persistence-wrapped service through the `service` seam.

**Standalone, over stdio.** The package ships a `wboard-mcp` binary — a fresh
in-memory service over stdio, no flags — for wiring into an MCP client config:

```sh
npx wboard-mcp
```

## `verb_noun` tool names

MCP tools land in one flat list beside every other server's, so the bare
protocol verbs would be ambiguous. Each is bound to a self-describing
`verb_noun` name. The mapping (`create` → `create_board`, `apply` →
`apply_ops`, and so on) is the table in
[`spec/SPEC.md` §Tool-name binding](../../spec/SPEC.md#tool-name-binding). The
six tools — `create_board`, `get_schema`, `apply_ops`, `describe_board`,
`get_events`, `screenshot` — are listed **unconditionally**.

Every tool returns its wire response **verbatim** as the result's
`structuredContent`, with the same JSON in a text content block:

```ts
const res = await client.callTool({ name: "describe_board", arguments: { board_id } });
res.structuredContent; // { board_id, protocol_version: "0.1" }
```

## Rejections as results; throws as `isError`

Two failure paths, deliberately distinct:

- **A protocol rejection is a normal result.** An `apply_ops` batch that fails
  validation returns `{ ok: false, code, message }` as a normal (non-error)
  tool result — the closed enum is protocol *data* an agent reads, not an
  exception. `res.isError` is falsy; nothing is appended.
- **A service throw becomes `isError`.** An unknown `board_id` throws a plain
  `Error` in the service; the pinned `@modelcontextprotocol/sdk` (`^1.30`)
  converts an uncaught tool-handler throw into an `isError: true` result
  carrying the message. The facade adds no mapping of its own.

Malformed inputs are rejected by the SDK's own schema validation — the one
standard MCP error path the facade leaves alone. See
[`spec/SPEC.md` §Errors](../../spec/SPEC.md#errors).

## `get_events` polling vs the WS push channel

Reading updates has two mechanisms:

- **Polling `get_events` by cursor** is the default. `get_events` returns events
  with `seq > cursor` (cursor omitted = from the start) and a new cursor to read
  after next. Loop on it to follow a board.
- **A WebSocket push channel** streams events without polling. `@wboard/mcp`
  exports `attachWebSocketPush`; a client connects with `board_id` (required)
  and `cursor` (optional) as query params and receives each event
  `{ seq, actor, op }` as its own JSON frame — the backlog after `cursor` first,
  then new events as they append. This is a **transport convenience, not a wire
  shape**: it is a thin per-connection poller over `get_events` that adds no
  observer hook to the service. Polling stays the default. See
  [`spec/SPEC.md` §WebSocket push channel](../../spec/SPEC.md#websocket-push-channel).

## Screenshot: pluggable `BoardRenderer` + the schematic default

The protocol carries no presentation, so no generic renderer can draw a host's
true visual. Rendering is **pluggable**: inject a `BoardRenderer` — a function
taking the schema and the projected elements and returning
`{ mime_type, base64 }`:

```ts
import { type BoardRenderer, createWhiteboardMcpServer } from "@wboard/mcp";

const renderer: BoardRenderer = async (schema, elements) => ({
  mime_type: "image/png",
  base64: renderMyWay(schema, elements),
});
createWhiteboardMcpServer({ renderer });
```

The facade ships a deterministic, dependency-free **schematic SVG**
(`image/svg+xml`) as the default `schematicRenderer`, so `screenshot` always
answers — one card per element (id, kind, `data` key/values), grouped by kind,
byte-identical for a given projection. The
[diagramming example](../examples/diagramming.md) reads a screenshot back and
asserts its mime type and non-empty bytes.
