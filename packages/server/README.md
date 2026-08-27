# @wboard/server

The reference board service for the whiteboard protocol — an embeddable, in-process library over an append-only attributed event log. Truth is the log; board state is the `project` fold of it. `BoardService` mints boards, applies flat ops lists all-or-nothing (dedup → validate → append), and serves the event log; the store is pluggable (the default is in-memory).

```sh
npm install @wboard/server@alpha
```

```ts
import { BoardService, project } from "@wboard/server";
import type { WireSchema } from "@wboard/core";

const schema: WireSchema = {
  kinds: [
    {
      id: "note",
      description: "a sticky note",
      attributes: [{ name: "text", description: "the body", type: "string", required: false }],
    },
  ],
};

const service = new BoardService();
const boardId = await service.createBoard(schema);

await service.apply(boardId, [
  { op: "create", op_id: "o1", element: { id: "x", kind: "note", data: { text: "hi" } } },
], "alice");

const { events } = await service.getEvents(boardId);
const state = project(events).elements;
console.log(state.get("x")); // { id: "x", kind: "note", data: { text: "hi" } }
```

> **Alpha.** Published under the `alpha` dist-tag while the protocol is young; the API may change between alpha releases. Pin an exact version if you depend on it.

The authoritative protocol definition is [`spec/SPEC.md`](https://github.com/rbutera/whiteboard/blob/main/spec/SPEC.md). The protocol version (`"0.1"`) is a separate axis from this package's npm semver.
