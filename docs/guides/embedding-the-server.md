# Guide: embedding the server

> Normative source: [`spec/SPEC.md` §Reference server](../../spec/SPEC.md#reference-server)
> and [§Projection semantics](../../spec/SPEC.md#projection-semantics). This
> guide shows `@wboard/server`; the requirements it must meet are SPEC's.

The reference board service is an **embeddable in-process library** — no
transport, no session, no connection, no auth required to use it. `board_id` is
a plain minted string; the service holds zero per-connection state. You embed
it and call methods.

## `BoardService` in-process

```ts
import { compileToWire, defineSchema } from "@wboard/core";
import { BoardService, project } from "@wboard/server";

const service = new BoardService(); // default: a fresh in-memory store

const boardId = await service.createBoard(compileToWire(schema));
await service.apply(boardId, ops, "alice"); // -> { ok: true } | { ok: false, code, message }
const { events } = await service.getEvents(boardId, 0); // { events, cursor }
const state = await service.getState(boardId); // ReadonlyMap<id, Element>
await service.describe(boardId); // { board_id, protocol_version: "0.1" }
```

Every method takes the `board_id` as an argument. An unknown board throws a
plain `Error` — the [closed error enum](host-schemas.md) belongs to `apply`
validation only, not to lookups.

## The `BoardStore` seam and pluggable persistence

State is **never stored** — it is always a projection of the log — so the
persistence contract is **log + schema only**. That contract is the `BoardStore`
interface, and it is the seam a host plugs its own storage into:

```ts
interface BoardStore {
  createBoard(boardId: string, schema: WireSchema): Promise<void>;
  getSchema(boardId: string): Promise<WireSchema | undefined>;
  append(boardId: string, entries: readonly AppendEntry[]): Promise<Event[]>;
  getEvents(boardId: string, afterSeq: number): Promise<Event[]>;
}
// AppendEntry is { actor: string; op: Op } — the store assigns each event's seq.
```

The shipped `InMemoryBoardStore` is **one** implementation. A host wanting
durability supplies another — e.g. a Postgres- or file-backed store — and
passes it in:

```ts
class MyDurableStore implements BoardStore {
  /* create/getSchema/append/getEvents backed by your database */
}

const service = new BoardService(new MyDurableStore());
```

`append` must assign each event a **contiguous `seq` starting at 1** and land a
batch's events atomically — all or none. Reads never throw on an absent board;
they return an empty list. A store must not alias caller memory: copy on write,
and hand back copies on read, so the log stays the single source of truth. See
[`spec/SPEC.md` §Reference server](../../spec/SPEC.md#reference-server).

## Same-board serialization

Concurrent `apply` calls **to the same board are serialized** — the
read-log → validate → append window cannot interleave. Without that, two
applies carrying the same `op_id` could both pass dedup and each append an
event. `BoardService` is the single writer, so it enforces this in-process (a
per-board promise chain); the store interface needs no compare-and-set. A
multi-process deployment that shares one store across writers would need
store-level CAS instead. See
[`spec/SPEC.md` §Reference server](../../spec/SPEC.md#reference-server).

## Reading state: library API vs folding the wire

There are two honest ways to read a board, and they agree:

- **Embedder (library API):** `service.getState(boardId)` returns the projected
  `ReadonlyMap<id, Element>` directly. State access is a library call, not a
  wire tool.
- **Wire client:** there is no "read state" tool. A wire client reads the log
  with `getEvents` (a.k.a. `get_events`) and folds it itself with `project`:

  ```ts
  const { events } = await service.getEvents(boardId);
  const { elements } = project(events);
  ```

Both routes are the same pure fold over the same log, so they always produce
the same state. See [concepts](../concepts.md) and the
[kanban example](../examples/kanban.md), which drives this whole path with
assertions.
