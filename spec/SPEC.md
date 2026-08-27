# Whiteboard protocol — SPEC

A host-agnostic shared-canvas protocol. An **append-only attributed event log**
is the truth; board **state is a projection** of that log. Agents and humans
author the same board through a small set of **stateless tools**.

This document is the authority for the wire contract and its version. Package
semver (each `@wboard/*` library's npm version) is a **separate axis** from
the protocol version defined here.

> Status: A2 finalized the **Wire shape** and **Error codes** sections against
> the shipped `@wboard/core` schemas; A3 finalized **Projection semantics** and
> the **Reference server** requirement against the shipped `@wboard/server`; A4
> finalized the **MCP facade** section against the shipped `@wboard/mcp`,
> resolving the WebSocket live-update channel the Overview once deferred. The
> locked shapes come from the decision tickets (rbutera/rennet#453–#456); no
> section here may contradict those tickets, and no section remains in draft.

## Protocol version

The **protocol version** is the version of the wire contract this document
defines. It starts at **`0.1`**.

- It is owned by this SPEC.md and is **independent of package semver**. A
  library may release many npm versions while implementing the same protocol
  version.
- Every whiteboard library declares the protocol version it implements (in TS,
  `@wboard/core` exports `PROTOCOL_VERSION`) and **surfaces it in the MCP
  `describe` handshake**, so a client can learn what a given board service
  speaks.
- TS and Python twins that claim the same protocol version MUST agree on every
  shape in this document and pass the same fixture corpus (`spec/fixtures/`).

## Overview — the five tools

The protocol is exposed as five stateless tools (plus a `screenshot` capability
for rendered read-back):

1. **create** — mint a board, declaring its host schema up front. Returns a
   `board_id` (a plain minted string threaded as an argument to later calls).
2. **schema** — read back the host schema declared for a board.
3. **apply** — the single mutation verb: a flat, ordered list of ops against a
   board, each carrying an `op_id` for dedup.
4. **describe** — board metadata and the protocol version the service implements.
5. **events** — read the board's append-only event log by polling (`get_events`).
   (#453 also blesses a direct WebSocket for live updates; that is a facade-level
   transport — the `@wboard/mcp` WS push channel described under **MCP facade** —
   not a wire shape this document defines. Polling `get_events` stays the default.)

Statelessness: the facade holds **zero per-connection state**. `board_id` is a
plain minted string passed as a tool argument; tools are listed unconditionally;
dedup is by client-supplied `op_id` against the event log.

## Elements

An element is `{ id, kind, data }`:

- `id` — caller-assigned stable identifier (id-first binding).
- `kind` — one of the kinds declared by the board's host schema.
- `data` — the element's attributes, typed per the host schema.

The protocol carries **no presentation, relations, or attention** concepts —
those belong to hosts, not the wire.

## Host schema

A board declares its host schema **at creation**. A schema is a set of kinds:

- kind — `{ id, description, attributes }`.
- attribute — a name with a type of `string | number | boolean | element | json`,
  optionally `many` (a list of that type).

Validation is typed against this schema. An invalid batch changes **nothing**
(all-or-nothing). Attributes not declared by the schema **pass through**
unvalidated.

## Wire shape

The canonical wire is **JSON**. The `@wboard/core` Zod schemas (and the Python
Pydantic twins) are **derived surfaces** that describe this JSON; the shapes
below are the source of truth, and every twin claiming protocol `0.1` matches
them field for field.

### Element

The sole unit on the wire:

```json
{ "id": "e1", "kind": "note", "data": { "text": "hello" } }
```

- `id` — caller-assigned stable string.
- `kind` — a kind id declared by the board's host schema.
- `data` — an object of attribute values. Declared attributes are typed per the
  host schema; undeclared fields pass through unvalidated.

### Wire host schema

Declared at `create` and read back by `schema`:

```json
{
  "kinds": [
    {
      "id": "note",
      "description": "a sticky note",
      "attributes": [
        { "name": "text", "description": "the note body", "type": "string", "required": true },
        { "name": "tags", "description": "labels", "type": "string", "required": false, "many": true }
      ]
    }
  ]
}
```

- attribute `type` is one of `"string" | "number" | "boolean" | "element" | "json"`.
- `required` is a boolean; `many` is an optional boolean (a list of that type).
- an `element` attribute value is another element's `id` (a string).

### Op envelope

`apply` carries a flat, ordered list of ops. Each op names a verb and carries an
`op_id` (the client-supplied string that dedups the op against the event log).
Later ops may reference ids minted by earlier ops in the same list.

```json
{ "op": "create", "op_id": "o1", "element": { "id": "e1", "kind": "note", "data": {} } }
{ "op": "update", "op_id": "o2", "id": "e1", "data": { "text": "edited" } }
{ "op": "delete", "op_id": "o3", "id": "e1" }
```

- `create` carries a full `element`; `update` merges `data` into an existing
  element (partial); `delete` removes an element by `id`.

### The five tools (plus screenshot)

Each tool is a request/response pair. `board_id` is a plain minted string on
every call — there is no session or connection concept.

| tool | request | response |
| ---- | ------- | -------- |
| **create** | `{ "schema": <wire host schema> }` | `{ "board_id": "b1" }` |
| **schema** | `{ "board_id": "b1" }` | `{ "schema": <wire host schema> }` |
| **apply** | `{ "board_id": "b1", "ops": [ <op>, … ] }` | accepted `{ "ok": true }` or rejected `{ "ok": false, "code": <error-code>, "message": "…" }` |
| **describe** | `{ "board_id": "b1" }` | `{ "board_id": "b1", "protocol_version": "0.1" }` |
| **events** | `{ "board_id": "b1", "cursor": 0 }` (`cursor` optional) | `{ "events": [ <event>, … ], "cursor": 12 }` |
| **screenshot** | `{ "board_id": "b1" }` | `{ "mime_type": "image/png", "base64": "…" }` |

`apply` is **all-or-nothing**: a rejected batch carries exactly one error code
and implies no change. An event is `{ "seq": <number>, "actor": "…", "op": <op> }`;
`events` returns them ordered by `seq`, and the returned `cursor` is the seq to
read after next.

## Error codes

The set of error codes is a **closed enum**. Typed validation rejects a batch
with exactly one of these codes; no library invents codes outside this list, and
each code names one failure family stateless validation can detect from the host
schema plus the known element ids and their kinds. All six appear in the `apply` response
(`{ ok: false, code, message }`); `message` is human-facing and carries the
offending attribute's description on the typed failures.

| code | meaning | appears in |
| ---- | ------- | ---------- |
| `unknown-kind` | an element's `kind` is not declared by the board's host schema | `apply` |
| `missing-required` | a required attribute is absent on a created element | `apply` |
| `wrong-type` | an attribute value does not match its declared type (`many` expects a list of that type) | `apply` |
| `bad-ref` | an `element`-typed attribute references an id neither already present nor minted earlier in the batch | `apply` |
| `unknown-element` | an `update`/`delete` targets an id that does not exist | `apply` |
| `duplicate-id` | a `create` reuses an id already live or minted earlier in the batch | `apply` |

**Closure.** The enum is closed in both directions: every code has at least one
reject fixture in `spec/fixtures/reject/`, and no fixture may reject with a code
not defined here (the `@wboard/core` corpus runner enforces both). Adding,
renaming, or removing a code is a **protocol-version change** — it may not happen
without a bump to the protocol version above and the discussion that implies.

## Projection semantics

The board's truth is its **append-only attributed event log**. Board state is a
deterministic **projection** of that log — never stored, always derivable, so
the same log always yields the same state.

### Events

An event is `{ seq, actor, op }`:

- `seq` — a monotonic sequence number, **contiguous and starting at 1**,
  assigned by storage at append time.
- `actor` — the caller-supplied string attributed to this op (see
  **Attribution**).
- `op` — the accepted op verbatim (`create` / `update` / `delete`).

`apply` appends **one event per accepted op**. A batch's events are appended
**atomically**: they all land, contiguously, or none do (all-or-nothing). A
rejected batch appends nothing. `events` returns events ordered by `seq`.

### Dedup

Dedup lives in the **server's `apply` path**, per-op, **before validation**. An
op whose `op_id` already appears in the board's event log — or earlier in the
same batch — is dropped as already-applied. The surviving ops validate
(all-or-nothing) and append. A batch whose every op is a duplicate returns
`{ ok: true }` and appends nothing, so **replay is idempotent**: re-applying an
already-applied batch leaves the log unchanged. The protocol itself supplies no
idempotency token — the client-supplied `op_id` and the log provide it. Typed
`validate` is dedup-unaware; dedup is not one of the closed error codes.

### The fold

Board state is folded from the log in `seq` order:

- **create** — insert the op's element (id → element).
- **update** — **shallow-merge** the op's `data` keys into the element's `data`:
  supplied keys overwrite, untouched keys survive, undeclared passthrough keys
  survive. Structure below the top level is replaced, not deep-merged.
- **delete** — remove the element.

The projection is the resulting id → element map. It is a pure function of the
events: same log, same projection, always. Because state is only ever this fold,
a service may cache the projection but MUST be able to rebuild it from the log
and MUST serve state equal to that rebuild.

### Cursor

`events` (a.k.a. `get_events`) reads by cursor. `get_events(board_id, cursor?)`
returns events with `seq > cursor` (cursor omitted = `0` = from the start),
ordered by `seq`. The returned `cursor` is the last returned event's `seq`, or
the request's `cursor` when nothing newer exists. Polling by cursor is the
default live-update mechanism (#453).

### Attribution

`actor` is **data, not authentication**: a plain string the caller of `apply`
supplies, recorded on each event so the log carries who acted. The reference
server performs no identity ceremony and no auth — anonymous mutation is
structurally impossible only in that every event carries whatever actor the
caller passed. A transport facade (a later workstream) may bind `actor` to an
authenticated principal; the protocol does not require it.

## Reference server

A conforming reference board service MUST be an **embeddable in-process
library** with **pluggable persistence**:

- The event-log storage behind the service is an **interface the host
  supplies** — log + schema only (create a board, read a board's schema, atomic
  store-assigned-`seq` append, read events after a `seq`). The shipped in-memory
  store is **one** implementation; a host may supply another (e.g. a durable
  one) without touching the service.
- No **transport, session, connection, or auth** concept may be required to
  embed it. `board_id` is a plain minted string threaded as an argument; the
  service holds **zero per-connection state**. HTTP / WebSocket / stdio / MCP
  are facade concerns layered on top, never a prerequisite for embedding.
- State access is a **library API** (read the projection directly); it is not a
  wire tool. Wire clients fold `events` themselves.
- Concurrent `apply` calls to the **same board** MUST be serialized so the
  read-log → validate → append window cannot interleave (otherwise two applies
  carrying the same `op_id` could both pass dedup and each append an event). The
  service is the single writer, so this is an in-process guarantee; it does not
  require compare-and-set in the storage interface. A multi-process deployment
  that shares a store across writers needs store-level CAS instead.

This embeddability-with-pluggable-persistence requirement is load-bearing: it is
what lets a host (e.g. Rennet) embed the reference server in-process and wrap it
with its own persistence. In TypeScript this is `@wboard/server`'s
`BoardService` over a `BoardStore` interface, defaulting to an in-memory store;
any conforming twin exposes the equivalent seam.

## MCP facade

The **MCP facade** exposes the reference service as [Model Context
Protocol](https://modelcontextprotocol.io) tools, so an agent authors a board
through the same stateless calls a human does. It is a **thin translator, not a
second service**: every tool call is exactly one `BoardService` call, and the
facade holds **zero board state and zero per-connection state**. Tools are
listed unconditionally (#453). In TypeScript this is `@wboard/mcp`.

### Tool-name binding

MCP tools land in one flat list beside every other server's tools, so the bare
protocol verbs (`create`, `apply`, …) are ambiguous. The facade binds each to a
self-describing `verb_noun` name; these are the MCP names, while the short names
above stay the transport-neutral protocol names.

| protocol tool | MCP tool | service call |
| ------------- | -------- | ------------ |
| create | `create_board` | `createBoard(schema)` |
| schema | `get_schema` | `getSchema(board_id)` |
| apply | `apply_ops` | `apply(board_id, ops, actor)` |
| describe | `describe_board` | `describe(board_id)` — carries `protocol_version` (the MCP handshake surface, #456) |
| events | `get_events` | `getEvents(board_id, cursor)` |
| screenshot | `screenshot` | `getSchema` + state projection → renderer |

### Results

Every tool returns its wire response **verbatim** as the result's
`structuredContent`, with the same JSON serialized in a text content block
(structured-text-first read-back, #454). `screenshot` additionally returns an
image content block. Tool inputs reuse the `@wboard/core` request shapes
unchanged; malformed inputs are rejected by the MCP SDK's own schema validation,
the one standard MCP error path the facade leaves alone.

### Errors

The closed error enum surfaces **through tool results, not exceptions**. An
`apply_ops` rejection (`{ ok: false, code, message }`) is a **normal**
(non-error) result, because a rejection is protocol data the agent must read.
The service's plain `Error` throws — an unknown `board_id` — map to
`isError: true` results carrying the message; the facade never raises an MCP
protocol error for a protocol-semantics failure.

### Attribution

`apply_ops` extends the wire `apply` request with an optional `actor` string —
a **facade-level input only** (`ApplyRequestSchema` is untouched). When omitted,
the facade attributes its configured `defaultActor` (default `"agent"`).
Attribution stays data, not authentication (see **Attribution** above).

### Screenshot rendering

The protocol carries no presentation, so no generic renderer can draw a host's
true visual. Rendering is therefore **pluggable**: a host with real presentation
semantics injects a `BoardRenderer` taking the schema and the projected elements
and returning `{ mime_type, base64 }`. The facade ships a deterministic,
dependency-free schematic SVG (`image/svg+xml`) as the default so the tool
always answers — one card per element (id, kind, `data` key/values), grouped by
kind, byte-identical for a given projection.

### WebSocket push channel

A live-update WebSocket channel streams events without polling. A client
connects with `board_id` (required) and `cursor` (optional, default 0) as URL
query parameters; the channel sends each event `{ seq, actor, op }` as its own
JSON frame — the backlog after `cursor` first, then new events as they append.
An unknown `board_id` yields one JSON error frame and a close.

This channel is a **transport convenience, not a wire shape**: frames are the
event shape defined above, the per-connection cursor is transport state (not
board state), and the implementation is a thin per-connection poller over
`get_events` that adds **no observer hook** to the reference service. Polling
`get_events` by cursor remains the default live-update mechanism (#453).

### Embeddability

The facade is built over a **host-supplied `BoardService`** (default: a fresh
in-memory one), the same in-process seam the reference server exposes — a host
(e.g. Rennet) passes its own persistence-wrapped service and connects the
returned server over any MCP transport: in-process for embedding, or the shipped
`wboard-mcp` stdio executable (a fresh in-memory service over stdio, no flags).
