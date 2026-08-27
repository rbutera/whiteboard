import { createServer, type Server } from "node:http";
import type { Op, WireSchema } from "@wboard/core";
import { BoardService } from "@wboard/server";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { attachWebSocketPush, type WebSocketPushHandle } from "./ws.js";

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

/** A listening http server on an ephemeral port + its bound port. */
async function listen(): Promise<{ server: Server; port: number }> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  if (typeof addr !== "object" || !addr) throw new Error("no port");
  return { server, port: addr.port };
}

/** Collect frames until `done(frames)` is true (or fail after a timeout). */
function collect(
  ws: WebSocket,
  done: (frames: unknown[]) => boolean,
  timeoutMs = 2000,
): Promise<unknown[]> {
  const frames: unknown[] = [];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout; got ${JSON.stringify(frames)}`)),
      timeoutMs,
    );
    ws.on("message", (data) => {
      frames.push(JSON.parse(data.toString()));
      if (done(frames)) {
        clearTimeout(timer);
        resolve(frames);
      }
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe("attachWebSocketPush", () => {
  let handle: WebSocketPushHandle | undefined;
  let http: Server | undefined;
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const ws of sockets) ws.close();
    sockets.length = 0;
    await handle?.close();
    handle = undefined;
    await new Promise<void>((resolve) => (http ? http.close(() => resolve()) : resolve()));
    http = undefined;
  });

  async function seed(): Promise<{ service: BoardService; board: string; port: number }> {
    const service = new BoardService();
    const board = await service.createBoard(SCHEMA);
    const { server, port } = await listen();
    http = server;
    handle = attachWebSocketPush(service, { server, pollMs: 10 });
    return { service, board, port };
  }

  function open(port: number, query: string): WebSocket {
    const ws = new WebSocket(`ws://localhost:${port}/?${query}`);
    sockets.push(ws);
    return ws;
  }

  it("delivers the backlog after a cursor", async () => {
    const { service, board, port } = await seed();
    await service.apply(board, [createOp("e1", "o1")], "a");
    await service.apply(board, [createOp("e2", "o2")], "a");
    await service.apply(board, [createOp("e3", "o3")], "a");

    const ws = open(port, `board_id=${board}&cursor=1`);
    const frames = (await collect(ws, (f) => f.length >= 2)) as { seq: number }[];
    expect(frames.map((f) => f.seq)).toEqual([2, 3]);
  });

  it("streams events applied mid-subscription", async () => {
    const { service, board, port } = await seed();
    const ws = open(port, `board_id=${board}`);
    await new Promise<void>((resolve) => ws.on("open", () => resolve()));

    await service.apply(board, [createOp("e1", "o1")], "a");
    const frames = (await collect(ws, (f) => f.length >= 1)) as { seq: number; actor: string }[];
    expect(frames[0]?.seq).toBe(1);
    expect(frames[0]?.actor).toBe("a");
  });

  it("fans out to two subscribers", async () => {
    const { service, board, port } = await seed();
    const a = open(port, `board_id=${board}`);
    const b = open(port, `board_id=${board}`);
    await Promise.all([
      new Promise<void>((r) => a.on("open", () => r())),
      new Promise<void>((r) => b.on("open", () => r())),
    ]);

    await service.apply(board, [createOp("e1", "o1")], "a");
    const [fa, fb] = await Promise.all([
      collect(a, (f) => f.length >= 1) as Promise<{ seq: number }[]>,
      collect(b, (f) => f.length >= 1) as Promise<{ seq: number }[]>,
    ]);
    expect(fa[0]?.seq).toBe(1);
    expect(fb[0]?.seq).toBe(1);
  });

  it("sends an error frame and closes for an unknown board", async () => {
    const { port } = await seed();
    const ws = open(port, "board_id=ghost");
    const closed = new Promise<void>((resolve) => ws.on("close", () => resolve()));
    const frames = (await collect(ws, (f) => f.length >= 1)) as { error: string }[];
    expect(frames[0]?.error).toMatch(/unknown board/);
    await closed; // the channel closes after the error frame
  });
});
