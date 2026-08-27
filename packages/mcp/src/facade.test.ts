import { type Op, PROTOCOL_VERSION, type WireSchema } from "@wboard/core";
import { BoardService } from "@wboard/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { createWhiteboardMcpServer, type WhiteboardMcpOptions } from "./facade.js";

/** Connect a real MCP `Client` to a fresh facade over the in-process
 * `InMemoryTransport` — the exact seam B4 embeds through. */
async function connect(options?: WhiteboardMcpOptions) {
  const facade = createWhiteboardMcpServer(options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await facade.server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, service: facade.service };
}

const NOTE_SCHEMA: WireSchema = {
  kinds: [
    {
      id: "note",
      description: "a sticky note",
      attributes: [{ name: "text", description: "the body", type: "string", required: true }],
    },
  ],
};

function createOp(id: string, text: string, opId: string): Op {
  return { op: "create", op_id: opId, element: { id, kind: "note", data: { text } } };
}

/** The text of a result's first content block (asserts it is a text block). */
function textOf(res: unknown): string {
  const content = (res as { content?: unknown }).content;
  const first = (content as { type: string; text: string }[] | undefined)?.[0];
  if (!first || first.type !== "text") throw new Error("expected a text content block");
  return first.text;
}

describe("facade", () => {
  let client: Awaited<ReturnType<typeof connect>>["client"];

  beforeEach(async () => {
    ({ client } = await connect());
  });

  async function newBoard(schema: WireSchema = NOTE_SCHEMA): Promise<string> {
    const res = await client.callTool({ name: "create_board", arguments: { schema } });
    return (res.structuredContent as { board_id: string }).board_id;
  }

  it("lists all six tools unconditionally", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "apply_ops",
      "create_board",
      "describe_board",
      "get_events",
      "get_schema",
      "screenshot",
    ]);
  });

  it("screenshot returns a valid base64 SVG plus an image content block", async () => {
    const board = await newBoard();
    await client.callTool({
      name: "apply_ops",
      arguments: { board_id: board, ops: [createOp("e1", "hi", "o1")] },
    });
    const res = await client.callTool({ name: "screenshot", arguments: { board_id: board } });
    expect(res.isError).toBeFalsy();
    const shot = res.structuredContent as { mime_type: string; base64: string };
    expect(shot.mime_type).toBe("image/svg+xml");
    const svg = Buffer.from(shot.base64, "base64").toString("utf8");
    expect(svg).toContain("<svg");
    expect(svg).toContain("e1");

    const image = (res.content as { type: string; data?: string; mimeType?: string }[]).find(
      (c) => c.type === "image",
    );
    expect(image?.data).toBe(shot.base64);
    expect(image?.mimeType).toBe("image/svg+xml");
  });

  it("screenshot uses an injected renderer verbatim", async () => {
    const stub: import("./render.js").BoardRenderer = async () => ({
      mime_type: "image/png",
      base64: "STUB",
    });
    const { client: c2 } = await connect({ renderer: stub });
    const res = await c2.callTool({ name: "create_board", arguments: { schema: NOTE_SCHEMA } });
    const board = (res.structuredContent as { board_id: string }).board_id;
    const shot = await c2.callTool({ name: "screenshot", arguments: { board_id: board } });
    expect(shot.structuredContent).toEqual({ mime_type: "image/png", base64: "STUB" });
  });

  it("screenshot maps unknown board_id to an isError result", async () => {
    const res = await client.callTool({ name: "screenshot", arguments: { board_id: "nope" } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/unknown board/);
  });

  it("create -> schema -> describe round-trips with the core protocol version", async () => {
    const board = await newBoard();
    expect(board).toMatch(/./);

    const schemaRes = await client.callTool({ name: "get_schema", arguments: { board_id: board } });
    expect(schemaRes.structuredContent).toEqual({ schema: NOTE_SCHEMA });

    const describeRes = await client.callTool({
      name: "describe_board",
      arguments: { board_id: board },
    });
    expect(describeRes.structuredContent).toEqual({
      board_id: board,
      protocol_version: PROTOCOL_VERSION,
    });
  });

  it("mirrors the wire response in a JSON text block (structured-text-first)", async () => {
    const board = await newBoard();
    const res = await client.callTool({ name: "describe_board", arguments: { board_id: board } });
    expect(JSON.parse(textOf(res))).toEqual(res.structuredContent);
  });

  it("apply -> get_events pages by cursor and attributes the actor", async () => {
    const board = await newBoard();

    const apply1 = await client.callTool({
      name: "apply_ops",
      arguments: { board_id: board, ops: [createOp("e1", "one", "o1")], actor: "alice" },
    });
    expect(apply1.structuredContent).toEqual({ ok: true });
    expect(apply1.isError).toBeFalsy();

    const ev1 = await client.callTool({ name: "get_events", arguments: { board_id: board } });
    const page1 = ev1.structuredContent as {
      events: { seq: number; actor: string }[];
      cursor: number;
    };
    expect(page1.events).toHaveLength(1);
    expect(page1.events[0]?.actor).toBe("alice");
    expect(page1.cursor).toBe(1);

    // default actor when omitted
    await client.callTool({
      name: "apply_ops",
      arguments: { board_id: board, ops: [createOp("e2", "two", "o2")] },
    });
    const ev2 = await client.callTool({
      name: "get_events",
      arguments: { board_id: board, cursor: page1.cursor },
    });
    const page2 = ev2.structuredContent as {
      events: { seq: number; actor: string }[];
      cursor: number;
    };
    expect(page2.events).toHaveLength(1);
    expect(page2.events[0]?.actor).toBe("agent");
    expect(page2.cursor).toBe(2);
  });

  it("honours a facade defaultActor override", async () => {
    const { client: c2 } = await connect({ defaultActor: "robot" });
    const res = await c2.callTool({ name: "create_board", arguments: { schema: NOTE_SCHEMA } });
    const board = (res.structuredContent as { board_id: string }).board_id;
    await c2.callTool({
      name: "apply_ops",
      arguments: { board_id: board, ops: [createOp("e1", "x", "o1")] },
    });
    const ev = await c2.callTool({ name: "get_events", arguments: { board_id: board } });
    expect((ev.structuredContent as { events: { actor: string }[] }).events[0]?.actor).toBe(
      "robot",
    );
  });

  it("surfaces an apply rejection as a normal result carrying the enum code", async () => {
    const board = await newBoard();
    const badOp: Op = { op: "create", op_id: "o1", element: { id: "g1", kind: "ghost", data: {} } };
    const res = await client.callTool({
      name: "apply_ops",
      arguments: { board_id: board, ops: [badOp] },
    });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toEqual({
      ok: false,
      code: "unknown-kind",
      message: expect.any(String),
    });
    // all-or-nothing: nothing appended
    const ev = await client.callTool({ name: "get_events", arguments: { board_id: board } });
    expect((ev.structuredContent as { events: unknown[] }).events).toEqual([]);
  });

  it("maps unknown board_id to an isError result on every board-taking tool", async () => {
    const unknown = "nope";
    const calls: { name: string; arguments: Record<string, unknown> }[] = [
      { name: "get_schema", arguments: { board_id: unknown } },
      { name: "describe_board", arguments: { board_id: unknown } },
      { name: "get_events", arguments: { board_id: unknown } },
      { name: "apply_ops", arguments: { board_id: unknown, ops: [createOp("e1", "x", "o1")] } },
    ];
    for (const call of calls) {
      const res = await client.callTool(call);
      expect(res.isError, call.name).toBe(true);
      expect(textOf(res), call.name).toMatch(/unknown board/);
    }
  });

  it("hits the host-supplied BoardService (the B4 embedding seam)", async () => {
    const service = new BoardService();
    const board = await service.createBoard(NOTE_SCHEMA);
    await service.apply(board, [createOp("e1", "seeded", "o1")], "host");

    const { client: embedded } = await connect({ service });
    const ev = await embedded.callTool({ name: "get_events", arguments: { board_id: board } });
    const events = (ev.structuredContent as { events: { actor: string }[] }).events;
    expect(events).toHaveLength(1);
    expect(events[0]?.actor).toBe("host");
  });
});
