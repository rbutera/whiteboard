import { describe, expect, it } from "vitest";
import { validate } from "./validate.js";
import type { Op } from "./wire/ops.js";
import type { WireSchema } from "./wire/schema.js";

const schema: WireSchema = {
  kinds: [
    {
      id: "note",
      description: "a sticky note",
      attributes: [
        { name: "text", description: "the note body", type: "string", required: true },
        { name: "weight", description: "a number", type: "number", required: false },
        { name: "done", description: "a flag", type: "boolean", required: false },
        { name: "meta", description: "opaque json", type: "json", required: false },
        { name: "parent", description: "the parent element", type: "element", required: false },
        { name: "tags", description: "many strings", type: "string", required: false, many: true },
        {
          name: "children",
          description: "child elements",
          type: "element",
          required: false,
          many: true,
        },
      ],
    },
  ],
};

const create = (id: string, data: Record<string, unknown>, kind = "note"): Op => ({
  op: "create",
  op_id: `c-${id}`,
  element: { id, kind, data },
});
const empty: ReadonlyMap<string, string> = new Map();

describe("validate — accepts", () => {
  it("accepts a minimal valid create", () => {
    expect(validate(schema, [create("e1", { text: "hi" })], empty)).toEqual({ ok: true });
  });

  it("accepts every attribute type including many", () => {
    const ops = [
      create("a", { text: "t" }),
      create("e2", {
        text: "t",
        weight: 3,
        done: true,
        meta: { anything: [1, 2] },
        parent: "a",
        tags: ["x", "y"],
        children: ["a"],
      }),
    ];
    expect(validate(schema, ops, empty)).toEqual({ ok: true });
  });

  it("passes undeclared data fields through untouched", () => {
    expect(validate(schema, [create("e1", { text: "hi", nope: 42 })], empty).ok).toBe(true);
  });

  it("accepts within-batch mint-then-reference", () => {
    const ops = [create("p", { text: "parent" }), create("c", { text: "child", parent: "p" })];
    expect(validate(schema, ops, empty)).toEqual({ ok: true });
  });

  it("accepts an element ref to a pre-existing id", () => {
    const ops = [create("c", { text: "child", parent: "old" })];
    expect(validate(schema, ops, new Map([["old", "note"]]))).toEqual({ ok: true });
  });

  it("accepts a partial update that matches declared types", () => {
    const ops: Op[] = [
      create("e1", { text: "hi" }),
      { op: "update", op_id: "u1", id: "e1", data: { weight: 5 } },
    ];
    expect(validate(schema, ops, empty)).toEqual({ ok: true });
  });

  it("accepts delete of a live element", () => {
    const ops: Op[] = [create("e1", { text: "hi" }), { op: "delete", op_id: "d1", id: "e1" }];
    expect(validate(schema, ops, empty)).toEqual({ ok: true });
  });
});

describe("validate — one reject per code", () => {
  it("unknown-kind", () => {
    const r = validate(schema, [create("e1", { text: "hi" }, "widget")], empty);
    expect(r).toMatchObject({ ok: false, code: "unknown-kind" });
  });

  it("missing-required (message carries the description)", () => {
    const r = validate(schema, [create("e1", { weight: 1 })], empty);
    expect(r).toMatchObject({ ok: false, code: "missing-required" });
    if (!r.ok) expect(r.message).toContain("the note body");
  });

  it("wrong-type (scalar, message carries the description)", () => {
    const r = validate(schema, [create("e1", { text: 5 })], empty);
    expect(r).toMatchObject({ ok: false, code: "wrong-type" });
    if (!r.ok) expect(r.message).toContain("the note body");
  });

  it("wrong-type (a many attribute given a non-array)", () => {
    const r = validate(schema, [create("e1", { text: "hi", tags: "x" })], empty);
    expect(r).toMatchObject({ ok: false, code: "wrong-type" });
  });

  it("wrong-type (a many attribute with a bad element)", () => {
    const r = validate(schema, [create("e1", { text: "hi", tags: [1] })], empty);
    expect(r).toMatchObject({ ok: false, code: "wrong-type" });
  });

  it("bad-ref (element attribute referencing an unknown id)", () => {
    const r = validate(schema, [create("e1", { text: "hi", parent: "ghost" })], empty);
    expect(r).toMatchObject({ ok: false, code: "bad-ref" });
  });

  it("bad-ref (a many element attribute referencing an unknown id)", () => {
    const r = validate(schema, [create("e1", { text: "hi", children: ["ghost"] })], empty);
    expect(r).toMatchObject({ ok: false, code: "bad-ref" });
  });

  it("unknown-element (update of an absent id)", () => {
    const r = validate(schema, [{ op: "update", op_id: "u1", id: "ghost", data: {} }], empty);
    expect(r).toMatchObject({ ok: false, code: "unknown-element" });
  });

  it("unknown-element (delete of an absent id)", () => {
    const r = validate(schema, [{ op: "delete", op_id: "d1", id: "ghost" }], empty);
    expect(r).toMatchObject({ ok: false, code: "unknown-element" });
  });

  it("duplicate-id (create reusing a pre-existing id)", () => {
    const r = validate(schema, [create("old", { text: "hi" })], new Map([["old", "note"]]));
    expect(r).toMatchObject({ ok: false, code: "duplicate-id" });
  });

  it("duplicate-id (create reusing an id minted earlier in the batch)", () => {
    const ops = [create("e1", { text: "a" }), create("e1", { text: "b" })];
    expect(validate(schema, ops, empty)).toMatchObject({ ok: false, code: "duplicate-id" });
  });
});

describe("validate — batch and update semantics", () => {
  it("first failure wins across a multi-op batch", () => {
    const ops: Op[] = [
      create("e1", { text: "ok" }),
      create("e2", { text: 9 }), // wrong-type
      create("e3", {}, "widget"), // unknown-kind, never reached
    ];
    expect(validate(schema, ops, empty)).toMatchObject({ ok: false, code: "wrong-type" });
  });

  it("type-checks a partial update against declared types", () => {
    const ops: Op[] = [
      create("e1", { text: "hi" }),
      { op: "update", op_id: "u1", id: "e1", data: { weight: "heavy" } },
    ];
    expect(validate(schema, ops, empty)).toMatchObject({ ok: false, code: "wrong-type" });
  });

  it("a referenced id deleted earlier in the batch no longer resolves", () => {
    const ops: Op[] = [
      create("p", { text: "p" }),
      { op: "delete", op_id: "d1", id: "p" },
      create("c", { text: "c", parent: "p" }),
    ];
    expect(validate(schema, ops, empty)).toMatchObject({ ok: false, code: "bad-ref" });
  });

  const preexisting = new Map([["old", "note"]]);

  it("type-checks an update to a pre-existing element (wrong-type)", () => {
    const ops: Op[] = [{ op: "update", op_id: "u1", id: "old", data: { text: 42 } }];
    expect(validate(schema, ops, preexisting)).toMatchObject({ ok: false, code: "wrong-type" });
  });

  it("checks refs on an update to a pre-existing element (bad-ref)", () => {
    const ops: Op[] = [{ op: "update", op_id: "u1", id: "old", data: { parent: "ghost" } }];
    expect(validate(schema, ops, preexisting)).toMatchObject({ ok: false, code: "bad-ref" });
  });

  it("accepts a well-typed update to a pre-existing element", () => {
    const ops: Op[] = [{ op: "update", op_id: "u1", id: "old", data: { weight: 5 } }];
    expect(validate(schema, ops, preexisting)).toEqual({ ok: true });
  });

  it("duplicate-id when a create-delete-create remints an id (SPEC: any id minted earlier)", () => {
    const ops: Op[] = [
      create("e1", { text: "a" }),
      { op: "delete", op_id: "d1", id: "e1" },
      create("e1", { text: "b" }),
    ];
    expect(validate(schema, ops, empty)).toMatchObject({ ok: false, code: "duplicate-id" });
  });
});
