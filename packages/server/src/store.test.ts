import type { AppendEntry } from "./store.js";
import { InMemoryBoardStore } from "./store.js";
import { describe, expect, it } from "vitest";
import type { Op, WireSchema } from "@wboard/core";

const SCHEMA: WireSchema = { kinds: [] };

const createOp = (id: string): Op => ({
  op: "create",
  op_id: `op-${id}`,
  element: { id, kind: "note", data: {} },
});

const entry = (id: string, actor = "alice"): AppendEntry => ({ actor, op: createOp(id) });

describe("InMemoryBoardStore", () => {
  it("assigns contiguous seqs from 1 across multiple appends", async () => {
    const store = new InMemoryBoardStore();
    await store.createBoard("b", SCHEMA);

    const first = await store.append("b", [entry("a"), entry("b")]);
    const second = await store.append("b", [entry("c")]);

    expect(first.map((e) => e.seq)).toEqual([1, 2]);
    expect(second.map((e) => e.seq)).toEqual([3]);
  });

  it("reads events back in order and filtered by after-seq", async () => {
    const store = new InMemoryBoardStore();
    await store.createBoard("b", SCHEMA);
    await store.append("b", [entry("a"), entry("b"), entry("c")]);

    expect(
      (await store.getEvents("b", 0)).map((e) => e.op.op === "create" && e.op.element.id),
    ).toEqual(["a", "b", "c"]);
    expect((await store.getEvents("b", 1)).map((e) => e.seq)).toEqual([2, 3]);
    expect(await store.getEvents("b", 3)).toEqual([]);
  });

  it("records the actor supplied per entry", async () => {
    const store = new InMemoryBoardStore();
    await store.createBoard("b", SCHEMA);
    await store.append("b", [entry("a", "alice"), entry("b", "bob")]);

    expect((await store.getEvents("b", 0)).map((e) => e.actor)).toEqual(["alice", "bob"]);
  });

  it("returns undefined schema and empty events for an unknown board", async () => {
    const store = new InMemoryBoardStore();
    expect(await store.getSchema("missing")).toBeUndefined();
    expect(await store.getEvents("missing", 0)).toEqual([]);
  });

  it("rejects appending to an unknown board", async () => {
    const store = new InMemoryBoardStore();
    await expect(store.append("missing", [entry("a")])).rejects.toThrow(/unknown board/);
  });

  it("rejects re-creating an existing board", async () => {
    const store = new InMemoryBoardStore();
    await store.createBoard("b", SCHEMA);
    await expect(store.createBoard("b", SCHEMA)).rejects.toThrow(/already exists/);
  });

  it("hands back copies so callers cannot mutate stored events", async () => {
    const store = new InMemoryBoardStore();
    await store.createBoard("b", SCHEMA);
    await store.append("b", [entry("a")]);

    const read = await store.getEvents("b", 0);
    read[0]!.seq = 999;

    expect((await store.getEvents("b", 0))[0]!.seq).toBe(1);
  });

  it("does not alias the caller's op on write (mutating element.data after append)", async () => {
    const store = new InMemoryBoardStore();
    await store.createBoard("b", SCHEMA);
    const op = createOp("a");
    await store.append("b", [{ actor: "alice", op }]);

    (op.op === "create" ? op.element.data : {}).leaked = "mutated after append";

    const stored = await store.getEvents("b", 0);
    expect(stored[0]!.op.op === "create" && stored[0]!.op.element.data).toEqual({});
  });

  it("hands back deep copies so callers cannot mutate a stored op's nested data", async () => {
    const store = new InMemoryBoardStore();
    await store.createBoard("b", SCHEMA);
    await store.append("b", [entry("a")]);

    const read = await store.getEvents("b", 0);
    if (read[0]!.op.op === "create") read[0]!.op.element.data.leaked = "mutated after read";

    const reread = await store.getEvents("b", 0);
    expect(reread[0]!.op.op === "create" && reread[0]!.op.element.data).toEqual({});
  });

  it("hands back a deep copy of the schema so callers cannot mutate stored kinds", async () => {
    const store = new InMemoryBoardStore();
    const schema: WireSchema = {
      kinds: [{ id: "note", description: "a note", attributes: [] }],
    };
    await store.createBoard("b", schema);

    const read = await store.getSchema("b");
    read!.kinds[0]!.id = "mutated";
    // The caller's own input must not leak in either.
    schema.kinds[0]!.description = "mutated input";

    expect((await store.getSchema("b"))!.kinds[0]).toEqual({
      id: "note",
      description: "a note",
      attributes: [],
    });
  });
});
