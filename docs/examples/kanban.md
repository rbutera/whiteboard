# Example: kanban (the library path)

> Normative source: [`spec/SPEC.md`](../../spec/SPEC.md). The runnable truth is
> [`examples/kanban/src/main.ts`](../../examples/kanban/src/main.ts) — the fences
> below follow it; when they differ, the source is right.

`examples/kanban` drives the **library path** — an embedded `BoardService`
folded with `project` — end to end, with plain `assert`s. It runs inside
`pnpm check`, so if the packages drift from what this page shows, the gate goes
red.

Run it directly:

```sh
pnpm nx build kanban && node examples/kanban/dist/main.js
# kanban example: ok
```

## What it demonstrates

- **Within-batch refs.** One `apply` batch creates two columns, then three
  cards whose required `column` attribute references a column id **minted
  earlier in the same batch**. Later ops seeing earlier ops' ids is how
  id-first refs resolve without a second round-trip.
- **Move as `update`.** Moving a card between columns is an `update` that
  overwrites the `column` ref. The fold shallow-merges: `title` and `tags`
  survive, `column` is replaced.
- **Delete.** Removing a card is a `delete` op.
- **Fold.** State is read by folding the log with `project` — never stored,
  always derived.
- **Replay idempotence.** Re-applying the identical first batch changes
  nothing: every `op_id` already appears in the log, so dedup drops all five and
  the log length is unchanged.

## The schema

Authored with `defineSchema` and lowered to the wire with `compileToWire`:

```ts
const schema = defineSchema({
  column: {
    description: "a kanban column",
    attributes: { title: { description: "the column title", type: "string", required: false } },
  },
  card: {
    description: "a work item",
    attributes: {
      title: { description: "the card title", type: "string", required: true },
      column: { description: "the column the card sits in", type: "element", required: true },
      tags: { description: "labels", type: "string", required: false, many: true },
    },
  },
});
```

## The flow

```ts
const service = new BoardService();
const boardId = await service.createBoard(compileToWire(schema));

// 2 columns + 3 cards in one batch; cards reference the column ids above.
await service.apply(boardId, firstBatch, "alice"); // { ok: true }

// Move card-c to another column — an update overwriting the `column` ref.
await service.apply(boardId, [{ op: "update", op_id: "m-1", id: "card-c", data: { column: "col-todo" } }], "alice");

// Delete a card.
await service.apply(boardId, [{ op: "delete", op_id: "d-1", id: "card-b" }], "alice");

// Fold and assert the exact final state.
const { events } = await service.getEvents(boardId);
const { elements } = project(events); // 2 columns + 2 cards; card-c moved
assert.equal(events.length, 7); // 5 creates + 1 move + 1 delete

// Replay the same batch — dedup drops it, the log is unchanged.
await service.apply(boardId, firstBatch, "alice");
assert.equal((await service.getEvents(boardId)).events.length, 7);
```

See the [host-schemas guide](../guides/host-schemas.md) for the schema kit and
the [embedding guide](../guides/embedding-the-server.md) for `BoardService` and
the `project` fold. The MCP counterpart is
[`examples/diagramming`](diagramming.md).
