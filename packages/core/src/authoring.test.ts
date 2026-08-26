import { describe, expect, it } from "vitest";
import {
  compileToWire,
  dataValidator,
  defineSchema,
  type ElementData,
  validateAuthored,
} from "./authoring.js";
import { validate } from "./validate.js";
import type { Op } from "./wire/ops.js";
import { WireSchema } from "./wire/schema.js";

// An authored schema exercising every attribute type, `many`, and
// required-vs-optional — the fixture the drift guard runs against.
const authored = defineSchema({
  note: {
    description: "a sticky note",
    attributes: {
      text: { description: "the note body", type: "string", required: true },
      weight: { description: "a number", type: "number", required: false },
      done: { description: "a flag", type: "boolean", required: false },
      meta: { description: "opaque json", type: "json", required: false },
      parent: { description: "the parent element", type: "element", required: false },
      tags: { description: "many strings", type: "string", required: false, many: true },
      children: { description: "child elements", type: "element", required: false, many: true },
    },
  },
});

// The hand-written wire schema `authored` must compile to. This is the "truth"
// side of the derivation-chain guard: if compileToWire drifts, this diverges.
const expectedWire: WireSchema = {
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

describe("compileToWire — derivation-chain guard", () => {
  it("emits output that parses under the wire-schema Zod schema", () => {
    expect(() => WireSchema.parse(compileToWire(authored))).not.toThrow();
  });

  it("compiles the authored schema to exactly the canonical wire shape", () => {
    expect(compileToWire(authored)).toEqual(expectedWire);
  });

  it("omits `many` when the attribute is single-valued", () => {
    const wire = compileToWire(authored);
    const text = wire.kinds[0]?.attributes.find((a) => a.name === "text");
    expect(text && "many" in text).toBe(false);
  });
});

describe("validating via the kit agrees with validate()", () => {
  const create = (id: string, data: Record<string, unknown>, kind = "note"): Op => ({
    op: "create",
    op_id: `c-${id}`,
    element: { id, kind, data },
  });
  const empty: ReadonlySet<string> = new Set();

  // Inputs spanning accept and every code the type/ref checks can raise.
  const cases: { ops: Op[]; existing: ReadonlySet<string> }[] = [
    { ops: [create("e1", { text: "hi" })], existing: empty },
    {
      ops: [
        create("a", { text: "t" }),
        create("b", {
          text: "t",
          weight: 3,
          done: true,
          meta: { x: [1] },
          parent: "a",
          tags: ["x"],
          children: ["a"],
        }),
      ],
      existing: empty,
    },
    { ops: [create("e1", { weight: 1 })], existing: empty }, // missing-required
    { ops: [create("e1", { text: 5 })], existing: empty }, // wrong-type
    { ops: [create("e1", { text: "hi", parent: "ghost" })], existing: empty }, // bad-ref
    { ops: [create("e1", { text: "hi" }, "widget")], existing: empty }, // unknown-kind
    { ops: [create("old", { text: "hi" })], existing: new Set(["old"]) }, // duplicate-id
  ];

  it("returns the identical verdict as validate() on the compiled wire", () => {
    const wire = compileToWire(authored);
    for (const { ops, existing } of cases) {
      expect(validateAuthored(authored, ops, existing)).toEqual(validate(wire, ops, existing));
    }
  });
});

describe("per-kind data typing", () => {
  it("infers a kind's data type at compile time", () => {
    // Type-level assertion: this only compiles if ElementData maps types,
    // `many`, and required-ness correctly.
    const data: ElementData<typeof authored, "note"> = {
      text: "required string",
      weight: 3,
      tags: ["a", "b"],
      parent: "some-id",
    };
    expect(data.text).toBe("required string");
  });

  it("exposes a Zod validator that types data and passes extras through", () => {
    const noteData = dataValidator(authored, "note");
    expect(noteData.safeParse({ text: "hi", extra: 42 }).success).toBe(true);
    expect(noteData.safeParse({ weight: 1 }).success).toBe(false); // text required
    expect(noteData.safeParse({ text: 5 }).success).toBe(false); // wrong type
    expect(noteData.safeParse({ text: "hi", tags: ["x", "y"] }).success).toBe(true);
    expect(noteData.safeParse({ text: "hi", tags: "x" }).success).toBe(false); // many wants array
  });

  it("throws on an unknown kind", () => {
    expect(() => dataValidator(authored, "widget")).toThrow(/unknown kind/);
  });
});
