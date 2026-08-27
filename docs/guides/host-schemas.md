# Guide: host schemas

> Normative source: [`spec/SPEC.md` §Host schema](../../spec/SPEC.md#host-schema)
> and [§Error codes](../../spec/SPEC.md#error-codes). This guide shows the
> authoring kit; the wire shapes and the error enum are SPEC's.

A board declares its **host schema at creation**, and that schema is the
authority typed validation checks against. The protocol carries no meaning of
its own — the schema is where a `note`, a `card`, or a `node` gets defined.

## Kinds and attributes

A schema is a set of **kinds**. Each kind has an id, an agent-facing
description, and a list of **attributes**; an attribute is a name, a
description, a type, whether it is `required`, and optionally `many`. That
declared shape is the **wire schema** a board is created with, defined
normatively in
[`spec/SPEC.md` §Wire host schema](../../spec/SPEC.md#wire-host-schema). You
rarely write it by hand — the authoring kit below does.

## Attribute types

An attribute's `type` is one of the five the schema language defines;
[`spec/SPEC.md` §Host schema](../../spec/SPEC.md#host-schema) is the normative
list. Two carry nuance worth calling out here:

- **`element`** is an id-first reference to another element — see below.
- **`many: true`** makes the value a **list** of the base type (a `string`
  `many` attribute is a `string[]`), validated as a list. A `number` value must
  be finite: `NaN` and `±Infinity` can't cross JSON, so validation requires
  finiteness.

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
back with exactly one code from the **closed error enum**. For example, the
`bad-ref` above is one such code, and a card created without its required
`title` comes back `missing-required`. The full enum and each code's meaning
are normative in [`spec/SPEC.md` §Error codes](../../spec/SPEC.md#error-codes) —
they live there, not here. Adding or renaming a code is a protocol-version
change.

See the [kanban example](../examples/kanban.md) for a schema like this one
driven end to end.
