import { describe, expect, it } from "vitest";
import { OpSchema, OpsSchema } from "./ops.js";

describe("OpSchema", () => {
  it("parses a create op", () => {
    const op = { op: "create", op_id: "o1", element: { id: "e1", kind: "note", data: {} } };
    expect(OpSchema.parse(op)).toEqual(op);
  });

  it("parses an update op", () => {
    const op = { op: "update", op_id: "o2", id: "e1", data: { text: "x" } };
    expect(OpSchema.parse(op)).toEqual(op);
  });

  it("parses a delete op", () => {
    const op = { op: "delete", op_id: "o3", id: "e1" };
    expect(OpSchema.parse(op)).toEqual(op);
  });

  it("rejects an unknown op verb", () => {
    expect(OpSchema.safeParse({ op: "patch", op_id: "o4", id: "e1" }).success).toBe(false);
  });

  it("rejects a create missing its element", () => {
    expect(OpSchema.safeParse({ op: "create", op_id: "o5" }).success).toBe(false);
  });

  it("rejects a delete carrying an unknown field (strict wire object)", () => {
    const op = { op: "delete", op_id: "o6", id: "e1", data: { text: "x" } };
    expect(OpSchema.safeParse(op).success).toBe(false);
  });
});

describe("OpsSchema", () => {
  it("parses an ordered list of mixed ops", () => {
    const ops = [
      { op: "create", op_id: "o1", element: { id: "e1", kind: "note", data: {} } },
      { op: "update", op_id: "o2", id: "e1", data: { text: "x" } },
      { op: "delete", op_id: "o3", id: "e1" },
    ];
    expect(OpsSchema.parse(ops)).toHaveLength(3);
  });
});
