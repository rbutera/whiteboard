# Concepts

> Normative source: [`spec/SPEC.md`](../spec/SPEC.md). Every guarantee below
> links to the SPEC section that defines it; on conflict, SPEC wins.

Four ideas carry the whole protocol. Learn them once here.

## The event log is the truth; state is a projection

A board's truth is an **append-only attributed event log**. Board state — the
current set of elements — is never stored. It is a deterministic **projection**
folded from the log, so the same log always yields the same state.

The fold, in `seq` order: `create` inserts an element, `update` shallow-merges
its `data` into the existing element (supplied keys overwrite, untouched keys
survive), `delete` removes it. Because state is only ever this fold, a service
may cache the projection but must be able to rebuild it from the log.

`apply` appends one event per accepted op, atomically — a batch's events all
land contiguously or none do. See
[`spec/SPEC.md` §Projection semantics](../spec/SPEC.md#projection-semantics).

## Statelessness

The protocol holds **zero per-connection state**. Three things make that work:

- **`board_id` is a plain minted string**, threaded as an argument to every
  call. There is no session, connection, or handle — a board is named, not
  opened.
- **`op_id` dedups**, per-op, before validation. An op whose `op_id` already
  appears in the log (or earlier in the same batch) is dropped as
  already-applied.
- **Replay is idempotent.** Re-applying an already-applied batch leaves the log
  unchanged and still returns `{ ok: true }`. The client-supplied `op_id` plus
  the log provide idempotency; the protocol needs no separate token.

See [`spec/SPEC.md` §Overview](../spec/SPEC.md#overview--the-five-tools) and
[§Dedup](../spec/SPEC.md#dedup).

## Host schemas own meaning; the protocol owns storage and typed validation

The wire carries **no presentation, relations, or attention** — those belong to
hosts. An element is just `{ id, kind, data }`. What a `kind` means, and what
its attributes are, is declared by the board's **host schema** at creation.

The protocol's job is narrow: store the log, and validate a batch against the
declared schema. Validation is typed and **all-or-nothing** — an invalid batch
changes nothing and comes back with exactly one [closed error code](guides/host-schemas.md).
Attributes the schema does not declare **pass through** unvalidated. See
[`spec/SPEC.md` §Host schema](../spec/SPEC.md#host-schema) and
[§Elements](../spec/SPEC.md#elements).

## Attribution is data, not auth

Every event records an `actor` — a plain string the caller of `apply` supplies.
It says *who acted*, and that is all: the reference server performs no identity
check and no authentication. A transport facade may later bind `actor` to an
authenticated principal, but the protocol does not require it. Attribution is
carried, not enforced. See
[`spec/SPEC.md` §Attribution](../spec/SPEC.md#attribution).

## Where to go next

- [Host schemas](guides/host-schemas.md) — design the schema a board declares.
- [Embedding the server](guides/embedding-the-server.md) — the `BoardService` and its persistence seam.
- [The MCP facade](guides/mcp-facade.md) — the same board over Model Context Protocol.
