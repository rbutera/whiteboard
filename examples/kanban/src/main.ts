import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { compileToWire, defineSchema, type Op } from "@wboard/core";
import { BoardService, project } from "@wboard/server";

/**
 * The whiteboard **library path** end to end: author a host schema, embed a
 * `BoardService`, apply a batch whose later ops reference ids minted by earlier
 * ops, move a card as an `update`, delete a card, fold the log with `project`,
 * and prove replay is idempotent — all with plain `assert`s so the gate fails
 * if the packages drift from what `docs/examples/kanban.md` shows.
 */

const schema = defineSchema({
  column: {
    description: "a kanban column",
    attributes: {
      title: { description: "the column title", type: "string", required: true },
    },
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

/** One batch: two columns, then three cards that reference the column ids
 * minted earlier in this same list (id-first, within-batch refs). */
const firstBatch: Op[] = [
  {
    op: "create",
    op_id: "c-todo",
    element: { id: "col-todo", kind: "column", data: { title: "To do" } },
  },
  {
    op: "create",
    op_id: "c-doing",
    element: { id: "col-doing", kind: "column", data: { title: "Doing" } },
  },
  {
    op: "create",
    op_id: "c-a",
    element: {
      id: "card-a",
      kind: "card",
      data: { title: "Write docs", column: "col-todo", tags: ["docs"] },
    },
  },
  {
    op: "create",
    op_id: "c-b",
    element: {
      id: "card-b",
      kind: "card",
      data: { title: "Ship examples", column: "col-todo", tags: [] },
    },
  },
  {
    op: "create",
    op_id: "c-c",
    element: {
      id: "card-c",
      kind: "card",
      data: { title: "Review", column: "col-doing", tags: ["urgent"] },
    },
  },
];

export async function run(): Promise<void> {
  const service = new BoardService();
  const boardId = await service.createBoard(compileToWire(schema));

  // Apply the create batch — all-or-nothing, 5 ops accepted.
  assert.deepEqual(await service.apply(boardId, firstBatch, "alice"), { ok: true });

  // Move card-c from Doing to To do: an `update` overwriting the `column` ref.
  // The shallow merge keeps title and tags, overwrites column.
  assert.deepEqual(
    await service.apply(
      boardId,
      [{ op: "update", op_id: "m-1", id: "card-c", data: { column: "col-todo" } }],
      "alice",
    ),
    { ok: true },
  );

  // Delete card-b.
  assert.deepEqual(
    await service.apply(boardId, [{ op: "delete", op_id: "d-1", id: "card-b" }], "alice"),
    { ok: true },
  );

  // Fold the log into state and assert the exact final elements map.
  const { events } = await service.getEvents(boardId);
  const { elements } = project(events);

  assert.deepEqual(
    elements,
    new Map([
      ["col-todo", { id: "col-todo", kind: "column", data: { title: "To do" } }],
      ["col-doing", { id: "col-doing", kind: "column", data: { title: "Doing" } }],
      [
        "card-a",
        {
          id: "card-a",
          kind: "card",
          data: { title: "Write docs", column: "col-todo", tags: ["docs"] },
        },
      ],
      [
        "card-c",
        {
          id: "card-c",
          kind: "card",
          data: { title: "Review", column: "col-todo", tags: ["urgent"] },
        },
      ],
    ]),
  );

  // 5 creates + 1 move + 1 delete = 7 events.
  assert.equal(events.length, 7);

  // Re-apply the identical first batch: every op_id already appears in the log,
  // so dedup drops all five — replay is idempotent, the log is unchanged.
  assert.deepEqual(await service.apply(boardId, firstBatch, "alice"), { ok: true });
  const { events: afterReplay } = await service.getEvents(boardId);
  assert.equal(afterReplay.length, 7);
}

// Runnable directly (`node dist/main.js`); guarded so importing `run` in the
// test does not execute it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run()
    .then(() => console.log("kanban example: ok"))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
