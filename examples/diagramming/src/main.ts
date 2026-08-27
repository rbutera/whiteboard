import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { compileToWire, defineSchema, type Element, type Event, type Op } from "@wboard/core";
import { createWhiteboardMcpServer } from "@wboard/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

/**
 * The whiteboard **MCP path** end to end: a real MCP `Client` over the
 * in-process `InMemoryTransport` against `createWhiteboardMcpServer()`. It shows
 * element-ref integrity, rejection-as-data (a `bad-ref` batch comes back as a
 * NORMAL result and changes nothing), a wire-client fold of `get_events`, and a
 * screenshot read-back — all with plain `assert`s so the gate fails if the MCP
 * facade drifts from what `docs/examples/diagramming.md` shows.
 */

const schema = defineSchema({
  node: {
    description: "a graph node",
    attributes: { label: { description: "the node label", type: "string", required: true } },
  },
  edge: {
    description: "a directed edge between two nodes",
    attributes: {
      from: { description: "the source node", type: "element", required: true },
      to: { description: "the target node", type: "element", required: true },
      label: { description: "the edge label", type: "string", required: false },
    },
  },
});

/** A wire client folds `get_events` itself. This log is create-only, so the
 * fold just collects created elements by id — the general fold (create/update/
 * delete) is `project`, shown in the kanban library-path example. */
function graphFromEvents(events: readonly Event[]): Map<string, Element> {
  const elements = new Map<string, Element>();
  for (const { op } of events) {
    if (op.op === "create") elements.set(op.element.id, op.element);
  }
  return elements;
}

function structured<T>(result: unknown): T {
  return (result as { structuredContent?: unknown }).structuredContent as T;
}

export async function run(): Promise<void> {
  // Connect a real MCP client to the facade over the in-process transport.
  const facade = createWhiteboardMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "diagramming-example", version: "0" });
  await facade.server.connect(serverTransport);
  await client.connect(clientTransport);

  // create_board.
  const created = await client.callTool({
    name: "create_board",
    arguments: { schema: compileToWire(schema) },
  });
  const boardId = structured<{ board_id: string }>(created).board_id;
  assert.ok(boardId, "create_board returns a board id");

  // apply_ops: a 3-node, 2-edge graph. Edges reference node ids minted earlier.
  const graph: Op[] = [
    { op: "create", op_id: "n-a", element: { id: "a", kind: "node", data: { label: "A" } } },
    { op: "create", op_id: "n-b", element: { id: "b", kind: "node", data: { label: "B" } } },
    { op: "create", op_id: "n-c", element: { id: "c", kind: "node", data: { label: "C" } } },
    { op: "create", op_id: "e-ab", element: { id: "ab", kind: "edge", data: { from: "a", to: "b", label: "a to b" } } },
    { op: "create", op_id: "e-bc", element: { id: "bc", kind: "edge", data: { from: "b", to: "c", label: "b to c" } } },
  ];
  const applied = await client.callTool({ name: "apply_ops", arguments: { board_id: boardId, ops: graph } });
  assert.ok(!applied.isError, "apply_ops of a valid graph is not an isError result");
  assert.deepEqual(structured(applied), { ok: true });

  // A deliberate bad-ref batch: an edge to a node that does not exist.
  const badBatch: Op[] = [
    { op: "create", op_id: "e-bad", element: { id: "bad", kind: "edge", data: { from: "a", to: "ghost", label: "x" } } },
  ];
  const rejected = await client.callTool({ name: "apply_ops", arguments: { board_id: boardId, ops: badBatch } });
  // The rejection is a NORMAL result carrying the closed enum code, not an isError.
  assert.ok(!rejected.isError, "an apply rejection is a normal result, not an isError");
  const rej = structured<{ ok: boolean; code: string; message: string }>(rejected);
  assert.equal(rej.ok, false);
  assert.equal(rej.code, "bad-ref");
  assert.equal(typeof rej.message, "string");

  // All-or-nothing: the bad batch appended nothing — still the 5 graph events.
  const afterBad = await client.callTool({ name: "get_events", arguments: { board_id: boardId } });
  const events = structured<{ events: Event[] }>(afterBad).events;
  assert.equal(events.length, 5, "the rejected batch appended nothing");

  // Fold the wire events and assert the whole graph.
  const elements = graphFromEvents(events);
  assert.deepEqual(
    elements,
    new Map([
      ["a", { id: "a", kind: "node", data: { label: "A" } }],
      ["b", { id: "b", kind: "node", data: { label: "B" } }],
      ["c", { id: "c", kind: "node", data: { label: "C" } }],
      ["ab", { id: "ab", kind: "edge", data: { from: "a", to: "b", label: "a to b" } }],
      ["bc", { id: "bc", kind: "edge", data: { from: "b", to: "c", label: "b to c" } }],
    ]),
  );

  // screenshot: the default schematic renderer answers with an SVG.
  const shot = await client.callTool({ name: "screenshot", arguments: { board_id: boardId } });
  assert.ok(!shot.isError, "screenshot is not an isError result");
  const img = structured<{ mime_type: string; base64: string }>(shot);
  assert.equal(img.mime_type, "image/svg+xml");
  assert.ok(img.base64.length > 0, "screenshot returns non-empty base64 bytes");

  // describe_board: the MCP handshake surface reports the protocol version.
  const described = await client.callTool({ name: "describe_board", arguments: { board_id: boardId } });
  assert.equal(structured<{ protocol_version: string }>(described).protocol_version, "0.1");

  await client.close();
}

// Runnable directly (`node dist/main.js`); guarded so importing `run` in the
// test does not execute it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run()
    .then(() => console.log("diagramming example: ok"))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
