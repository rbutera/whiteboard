# Whiteboard protocol — SPEC

A host-agnostic shared-canvas protocol. An **append-only attributed event log**
is the truth; board **state is a projection** of that log. Agents and humans
author the same board through a small set of **stateless tools**.

This document is the authority for the wire contract and its version. Package
semver (each `@whtbrd/*` library's npm version) is a **separate axis** from
the protocol version defined here.

> Status: A2 finalized the **Wire shape** and **Error codes** sections against
> the shipped `@whtbrd/core` schemas. The locked shapes come from the decision
> tickets (rbutera/rennet#453–#456); the one remaining section marked _draft_
> (**Projection semantics**) is finalized by A3 (reference server). No section
> here may contradict those tickets.

## Protocol version

The **protocol version** is the version of the wire contract this document
defines. It starts at **`0.1`**.

- It is owned by this SPEC.md and is **independent of package semver**. A
  library may release many npm versions while implementing the same protocol
  version.
- Every whiteboard library declares the protocol version it implements (in TS,
  `@whtbrd/core` exports `PROTOCOL_VERSION`) and **surfaces it in the MCP
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
5. **events** — read the board's append-only event log (`get_events` polling;
   a direct WebSocket is an alternative live-update transport).

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

The canonical wire is **JSON**. The `@whtbrd/core` Zod schemas (and the Python
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
schema plus the set of known element ids. All six appear in the `apply` response
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
not defined here (the `@whtbrd/core` corpus runner enforces both). Adding,
renaming, or removing a code is a **protocol-version change** — it may not happen
without a bump to the protocol version above and the discussion that implies.

## Projection semantics

_Draft (A3)._ How the append-only event log projects to board state: event
ordering, how `apply` ops become events, `op_id` dedup (via client op-ids and
the event log, per #453 — A3 decides where dedup happens), and the deterministic
fold from log to current state. A3 will extend the fixture corpus with
log→projection cases; today the corpus covers validate/reject only.
