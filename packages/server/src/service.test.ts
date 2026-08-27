import type { Element, Op, WireSchema } from "@whtbrd/core";
import { describe, expect, it } from "vitest";
import { BoardService } from "./service.js";
import { InMemoryBoardStore } from "./store.js";

const SCHEMA: WireSchema = {
  kinds: [
    {
      id: "note",
      description: "a note",
      attributes: [{ name: "text", description: "body", type: "string", required: false }],
    },
  ],
};

const create = (opId: string, id: string, data: Record<string, unknown> = {}): Op => ({
  op: "create",
  op_id: opId,
  element: { id, kind: "note", data },
});
const update = (opId: string, id: string, data: Record<string, unknown>): Op => ({
  op: "update",
  op_id: opId,
  id,
  data,
});

describe("BoardService", () => {
  it("folds create → apply → getState / getEvents end to end", async () => {
    const svc = new BoardService();
    const board = await svc.createBoard(SCHEMA);

    expect(await svc.apply(board, [create("o1", "x", { text: "hi" })], "alice")).toEqual({
      ok: true,
    });
    expect(await svc.apply(board, [update("o2", "x", { text: "bye" })], "alice")).toEqual({
      ok: true,
    });

    const state = await svc.getState(board);
    expect(state.get("x")).toEqual({ id: "x", kind: "note", data: { text: "bye" } });

    const { events, cursor } = await svc.getEvents(board);
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
    expect(cursor).toBe(2);
  });

  it("describe reports the board id and protocol version", async () => {
    const svc = new BoardService();
    const board = await svc.createBoard(SCHEMA);
    expect(await svc.describe(board)).toEqual({ board_id: board, protocol_version: "0.1" });
  });

  it("dedups a replayed batch: {ok:true}, log length unchanged", async () => {
    const svc = new BoardService();
    const board = await svc.createBoard(SCHEMA);
    const batch = [create("o1", "x"), create("o2", "y")];

    await svc.apply(board, batch, "alice");
    const before = (await svc.getEvents(board)).events.length;
    expect(await svc.apply(board, batch, "alice")).toEqual({ ok: true });
    expect((await svc.getEvents(board)).events.length).toBe(before);
  });

  it("in a mixed batch, only the not-yet-applied op appends", async () => {
    const svc = new BoardService();
    const board = await svc.createBoard(SCHEMA);
    await svc.apply(board, [create("o1", "x")], "alice");

    expect(await svc.apply(board, [create("o1", "x"), create("o2", "y")], "alice")).toEqual({
      ok: true,
    });

    const state = await svc.getState(board);
    expect([...state.keys()].sort()).toEqual(["x", "y"]);
    expect((await svc.getEvents(board)).events.length).toBe(2);
  });

  it("is all-or-nothing: a mid-batch invalid op leaves state and log untouched", async () => {
    const svc = new BoardService();
    const board = await svc.createBoard(SCHEMA);
    await svc.apply(board, [create("o1", "x")], "alice");
    const logBefore = (await svc.getEvents(board)).events;

    const result = await svc.apply(
      board,
      [create("o2", "y"), update("o3", "ghost", { text: "no" })],
      "alice",
    );

    expect(result).toEqual({ ok: false, code: "unknown-element", message: expect.any(String) });
    expect((await svc.getEvents(board)).events).toEqual(logBefore);
    expect([...(await svc.getState(board)).keys()]).toEqual(["x"]);
  });

  it("attributes each event to the actor of its apply", async () => {
    const svc = new BoardService();
    const board = await svc.createBoard(SCHEMA);
    await svc.apply(board, [create("o1", "x")], "alice");
    await svc.apply(board, [create("o2", "y")], "bob");

    expect((await svc.getEvents(board)).events.map((e) => e.actor)).toEqual(["alice", "bob"]);
  });

  it("pages events by cursor across multiple applies", async () => {
    const svc = new BoardService();
    const board = await svc.createBoard(SCHEMA);
    await svc.apply(board, [create("o1", "x")], "alice");
    await svc.apply(board, [create("o2", "y"), create("o3", "z")], "alice");

    const first = await svc.getEvents(board, 0);
    expect(first.cursor).toBe(3);
    const tail = await svc.getEvents(board, 1);
    expect(tail.events.map((e) => e.seq)).toEqual([2, 3]);

    const caughtUp = await svc.getEvents(board, 3);
    expect(caughtUp.events).toEqual([]);
    expect(caughtUp.cursor).toBe(3);
  });

  it("served state equals a hand-written fold of the raw store log", async () => {
    const store = new InMemoryBoardStore();
    const svc = new BoardService(store);
    const board = await svc.createBoard(SCHEMA);
    await svc.apply(board, [create("o1", "x", { text: "a" }), create("o2", "y")], "alice");
    await svc.apply(board, [update("o3", "x", { text: "b" })], "bob");

    // An independent reduce — deliberately NOT project() — so this asserts the
    // served state against a second implementation, not against itself.
    const hand = new Map<string, Element>();
    for (const { op } of await store.getEvents(board, 0)) {
      if (op.op === "create") hand.set(op.element.id, op.element);
      else if (op.op === "update") {
        const cur = hand.get(op.id);
        if (cur) hand.set(op.id, { ...cur, data: { ...cur.data, ...op.data } });
      } else hand.delete(op.id);
    }

    expect(await svc.getState(board)).toEqual(hand);
  });

  it("serializes concurrent same-op_id applies: exactly one event appends", async () => {
    const svc = new BoardService();
    const board = await svc.createBoard(SCHEMA);

    const [a, b] = await Promise.all([
      svc.apply(board, [create("dup", "x")], "alice"),
      svc.apply(board, [create("dup", "x")], "bob"),
    ]);

    // One apply wins and appends; the other dedups to a no-op — never two events.
    expect([a, b]).toContainEqual({ ok: true });
    expect((await svc.getEvents(board)).events.length).toBe(1);
  });

  it("throws a plain Error for an unknown board", async () => {
    const svc = new BoardService();
    await expect(svc.getSchema("nope")).rejects.toThrow(/unknown board/);
    await expect(svc.describe("nope")).rejects.toThrow(/unknown board/);
    await expect(svc.getEvents("nope")).rejects.toThrow(/unknown board/);
    await expect(svc.getState("nope")).rejects.toThrow(/unknown board/);
    await expect(svc.apply("nope", [create("o1", "x")], "alice")).rejects.toThrow(/unknown board/);
  });
});
