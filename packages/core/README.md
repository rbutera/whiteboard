# @wboard/core

Authoring and wire-contract core for the whiteboard protocol — a minimal, host-agnostic shared-canvas protocol where an append-only attributed event log is truth and board state is a projection. This package holds the element shapes, the host-schema kit, and the Zod-backed `validate()` that checks a batch of ops against a board's declared schema before it is applied.

```sh
npm install @wboard/core@alpha
```

```ts
import { validate, type Op, type WireSchema } from "@wboard/core";

const schema: WireSchema = {
  kinds: [
    {
      id: "note",
      description: "a sticky note",
      attributes: [{ name: "text", description: "the body", type: "string", required: false }],
    },
  ],
};

const ops: Op[] = [
  { op: "create", op_id: "o1", element: { id: "x", kind: "note", data: { text: "hi" } } },
];

// Validate a batch against the schema and the current id -> kind map (empty here).
const result = validate(schema, ops, new Map());
console.log(result.ok); // true
```

> **Alpha.** Published under the `alpha` dist-tag while the protocol is young; the API and wire contract may change between alpha releases. Pin an exact version if you depend on it.

The authoritative protocol definition is [`spec/SPEC.md`](https://github.com/rbutera/whiteboard/blob/main/spec/SPEC.md). `PROTOCOL_VERSION` (`"0.1"`) is the protocol axis owned by SPEC.md — separate from this package's npm semver.
