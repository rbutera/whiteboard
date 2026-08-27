# Guide: host schemas

> Normative source: [`spec/SPEC.md` §Host schema](../../spec/SPEC.md#host-schema)
> and [§Error codes](../../spec/SPEC.md#error-codes). This guide shows the
> authoring kit; the wire shapes and the error enum are SPEC's.

A board declares its **host schema at creation**, and that schema is the
authority typed validation checks against. The protocol carries no meaning of
its own — the schema is where a `note`, a `card`, or a `node` gets defined.

## Kinds and attributes

A schema is a set of **kinds**. Each kind has an id, an agent-facing
description, and a list of **attributes**. An attribute is a name, a
description, a type, whether it is `required`, and optionally `many`:

```ts
{
  kinds: [
    {
      id: "card",
      description: "a work item",
      attributes: [
        { name: "title", description: "the card title", type: "string", required: true },
        { name: "column", description: "the column it sits in", type: "element", required: true },
        { name: "tags", description: "labels", type: "string", required: false, many: true },
      ],
    },
  ],
}
```

That is the **wire schema** — the JSON a board is created with. You rarely write
it by hand; the authoring kit below does.

## The five attribute types

| type | value | notes |
| ---- | ----- | ----- |
| `string` | a string | |
| `number` | a finite number | non-finite (`NaN`, `±Infinity`) can't cross JSON, so validation requires finiteness |
| `boolean` | a boolean | |
| `element` | **another element's id** (a string) | an id-first reference; see below |
| `json` | any opaque JSON value | the protocol does not shape it |

`many: true` makes the value a **list** of that type — `tags` above is a
`string[]`. A `many` attribute is validated as a list of the base type.

## `element` refs

An `element`-typed attribute holds another element's **id** — a plain string.
The reference must be **live**: an id already present on the board, or one
minted earlier in the same `apply` batch. Later ops in a batch may reference
ids created by earlier ops in that same batch, so you can create a column and
the cards that point at it in one call. A ref to an unknown id is rejected as
`bad-ref`. Referencing *by kind* (a card's `column` points at a `column`) is
host convention — the wire only checks that the id is live.

## Required vs undeclared passthrough

- A **required** attribute absent on a *created* element is `missing-required`.
- A **declared** attribute present with the wrong type is `wrong-type`.
- An **undeclared** attribute — a key the schema never names — **passes through
  unvalidated** and is stored as-is. The schema types the surface you declare,
  not the whole `data` bag.

## The authoring kit: `defineSchema` / `compileToWire`

`@wboard/core` ships a typed TS surface so you author kinds as a keyed object
and lower it to the wire schema. **Authoring is convenience; the wire is
truth** — the kit invents no validation of its own.

```ts
import { compileToWire, defineSchema } from "@wboard/core";

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
      column: { description: "the column it sits in", type: "element", required: true },
      tags: { description: "labels", type: "string", required: false, many: true },
    },
  },
});

const wire = compileToWire(schema); // pass this to createBoard / create_board
```

`defineSchema` is a typed identity — it constrains the shape and preserves the
literal types, so `ElementData<typeof schema, "card">` reads each attribute's
type, `required`, and `many`. Kind ids and attribute names come from the map
keys. `compileToWire` emits the canonical wire schema; the authored form is
discarded after that.

For validating ops against an authored schema without compiling by hand, core
also exports `validateAuthored(authored, ops, existing)`, which compiles to
wire and defers to `validate`.

## All-or-nothing rejection

Validation is **all-or-nothing**: an invalid batch changes nothing and comes
back with exactly one code from the **closed error enum**. The six codes
(`unknown-kind`, `missing-required`, `wrong-type`, `bad-ref`,
`unknown-element`, `duplicate-id`) and what each means are defined in
[`spec/SPEC.md` §Error codes](../../spec/SPEC.md#error-codes) — that table is
normative, so it lives there, not here. Adding or renaming a code is a
protocol-version change.

See the [kanban example](../examples/kanban.md) for a schema like this one
driven end to end.
