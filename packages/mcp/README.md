# @wboard/mcp

The stateless MCP facade for the whiteboard protocol. It exposes the board tools (`create_board`, `get_schema`, `apply_ops`, `describe_board`, `get_events`, `screenshot`) over any `BoardService`, holding zero board state and zero per-connection state — every tool call is one service call. Ships the `wboard-mcp` stdio binary and an optional WebSocket push helper.

```sh
npm install @wboard/mcp@alpha
```

```ts
import { createWhiteboardMcpServer } from "@wboard/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const facade = createWhiteboardMcpServer();
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "example", version: "0" });
await facade.server.connect(serverTransport);
await client.connect(clientTransport);

const schema = {
  kinds: [
    {
      id: "note",
      description: "a sticky note",
      attributes: [{ name: "text", description: "the body", type: "string", required: false }],
    },
  ],
};

const created = await client.callTool({ name: "create_board", arguments: { schema } });
const boardId = (created.structuredContent as { board_id: string }).board_id;

await client.callTool({
  name: "apply_ops",
  arguments: {
    board_id: boardId,
    ops: [{ op: "create", op_id: "o1", element: { id: "x", kind: "note", data: { text: "hi" } } }],
  },
});

const events = await client.callTool({ name: "get_events", arguments: { board_id: boardId } });
console.log(events.structuredContent);
```

Run the stdio server directly with `npx wboard-mcp` (or the installed `wboard-mcp` bin).

> **Alpha.** Published under the `alpha` dist-tag while the protocol is young; the API may change between alpha releases. Pin an exact version if you depend on it.

The authoritative protocol definition is [`spec/SPEC.md`](https://github.com/rbutera/whiteboard/blob/main/spec/SPEC.md). `describe_board` reports `protocol_version` (`"0.1"`) — the protocol axis, separate from this package's npm semver.
