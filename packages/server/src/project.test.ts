import type { Event, Op } from "@whtbrd/core";
import { describe, expect, it } from "vitest";
import { project } from "./project.js";

let seq = 0;
const ev = (actor: string, op: Op): Event => ({ seq: ++seq, actor, op });
const create = (id: string, data: Record<string, unknown> = {}, kind = "note"): Op => ({
  op: "create",
  op_id: `c-${id}-${seq}`,
  element: { id, kind, data },
});
const update = (id: string, data: Record<string, unknown>): Op => ({
  op: "update",
  op_id: `u-${id}-${seq}`,
  id,
  data,
});
const del = (id: string): Op => ({ op: "delete", op_id: `d-${id}-${seq}`, id });

describe("project", () => {
  it("is deterministic — same events fold to deep-equal state", () => {
    const log = [ev("a", create("x", { n: 1 })), ev("b", update("x", { n: 2 }))];
    expect(project(log).elements).toEqual(project(log).elements);
  });

  it("shallow-merges update: untouched keys survive, supplied keys overwrite, undeclared pass through", () => {
    const { elements } = project([
      ev("a", create("x", { a: 1, b: 2 })),
      ev("a", update("x", { b: 20, c: 3 })),
    ]);
    expect(elements.get("x")).toEqual({ id: "x", kind: "note", data: { a: 1, b: 20, c: 3 } });
  });

  it("delete removes the element", () => {
    const { elements } = project([ev("a", create("x")), ev("a", del("x"))]);
    expect(elements.has("x")).toBe(false);
  });

  it("create-after-delete of a different id leaves the survivor", () => {
    const { elements } = project([
      ev("a", create("x", { v: 1 })),
      ev("a", del("x")),
      ev("a", create("y", { v: 2 })),
    ]);
    expect([...elements.keys()]).toEqual(["y"]);
    expect(elements.get("y")).toEqual({ id: "y", kind: "note", data: { v: 2 } });
  });

  it("folds mint-then-update-then-reference within a run", () => {
    const { elements, kinds } = project([
      ev("a", create("box", {}, "container")),
      ev("a", create("x", { parent: "box" }, "note")),
      ev("a", update("x", { text: "hi" })),
    ]);
    expect(elements.get("x")).toEqual({ id: "x", kind: "note", data: { parent: "box", text: "hi" } });
    expect(kinds.get("box")).toBe("container");
    expect(kinds.get("x")).toBe("note");
  });

  it("preserves id and kind across an update", () => {
    const { elements } = project([ev("a", create("x", { n: 1 }, "note")), ev("a", update("x", { n: 2 }))]);
    const x = elements.get("x")!;
    expect(x.id).toBe("x");
    expect(x.kind).toBe("note");
  });
});
