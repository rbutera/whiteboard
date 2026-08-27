import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Op, WireSchema } from "@wboard/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

/** The built bin — its `test` target `dependsOn: ["build"]`, so `dist/bin.js`
 * exists when this runs. Driving it over real stdio proves the transport wiring. */
const BIN = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/bin.js");

const SCHEMA: WireSchema = {
  kinds: [
    {
      id: "note",
      description: "a note",
      attributes: [{ name: "text", description: "body", type: "string", required: true }],
    },
  ],
};

function createOp(id: string, opId: string): Op {
  return { op: "create", op_id: opId, element: { id, kind: "note", data: { text: id } } };
}

describe("wboard-mcp stdio bin", () => {
  let client: Client | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it("round-trips create -> apply -> get_events over stdio", async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [BIN] });
    client = new Client({ name: "stdio-smoke", version: "0" });
    await client.connect(transport);

    const created = await client.callTool({ name: "create_board", arguments: { schema: SCHEMA } });
    const board = (created.structuredContent as { board_id: string }).board_id;
    expect(board).toMatch(/./);

    const applied = await client.callTool({
      name: "apply_ops",
      arguments: { board_id: board, ops: [createOp("e1", "o1")], actor: "stdio" },
    });
    expect(applied.structuredContent).toEqual({ ok: true });

    const events = await client.callTool({ name: "get_events", arguments: { board_id: board } });
    const page = events.structuredContent as { events: { seq: number; actor: string }[] };
    expect(page.events).toHaveLength(1);
    expect(page.events[0]?.actor).toBe("stdio");
  }, 15000);
});
