import { describe, expect, it } from "vitest";
import { AttributeSchema, KindSchema, WireSchema } from "./schema.js";

const attr = (over: Record<string, unknown> = {}) => ({
  name: "text",
  description: "the note body",
  type: "string",
  required: true,
  ...over,
});

describe("AttributeSchema", () => {
  it.each(["string", "number", "boolean", "element", "json"])("accepts type %s", (type) => {
    expect(AttributeSchema.parse(attr({ type })).type).toBe(type);
  });

  it("rejects an unknown type", () => {
    expect(AttributeSchema.safeParse(attr({ type: "date" })).success).toBe(false);
  });

  it("defaults many to undefined and accepts many: true", () => {
    expect(AttributeSchema.parse(attr()).many).toBeUndefined();
    expect(AttributeSchema.parse(attr({ many: true })).many).toBe(true);
  });

  it("requires name, description, type, required", () => {
    expect(
      AttributeSchema.safeParse({ name: "text", type: "string", required: true }).success,
    ).toBe(false);
  });
});

describe("KindSchema", () => {
  it("parses a kind with attributes", () => {
    const kind = { id: "note", description: "a sticky", attributes: [attr()] };
    expect(KindSchema.parse(kind)).toEqual(kind);
  });
});

describe("WireSchema", () => {
  it("parses a schema of kinds", () => {
    const schema = { kinds: [{ id: "note", description: "a sticky", attributes: [attr()] }] };
    expect(WireSchema.parse(schema)).toEqual(schema);
  });
});
