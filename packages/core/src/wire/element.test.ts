import { describe, expect, it } from "vitest";
import { ElementSchema } from "./element.js";

describe("ElementSchema", () => {
  it("parses a valid element", () => {
    const el = { id: "e1", kind: "note", data: { text: "hi", marked: true } };
    expect(ElementSchema.parse(el)).toEqual(el);
  });

  it("accepts an empty data bag", () => {
    expect(ElementSchema.parse({ id: "e1", kind: "note", data: {} }).data).toEqual({});
  });

  it("rejects a missing id", () => {
    expect(ElementSchema.safeParse({ kind: "note", data: {} }).success).toBe(false);
  });

  it("rejects a missing kind", () => {
    expect(ElementSchema.safeParse({ id: "e1", data: {} }).success).toBe(false);
  });

  it("rejects a non-string id", () => {
    expect(ElementSchema.safeParse({ id: 1, kind: "note", data: {} }).success).toBe(false);
  });

  it("rejects an unknown top-level field (strict wire object)", () => {
    const el = { id: "e1", kind: "note", data: {}, presentation: { x: 1 } };
    expect(ElementSchema.safeParse(el).success).toBe(false);
  });
});
