import type { Element } from "@wboard/core";
import { describe, expect, it } from "vitest";
import { schematicRenderer } from "./render.js";

const SCHEMA = { kinds: [] };

function els(list: Element[]): ReadonlyMap<string, Element> {
  return new Map(list.map((e) => [e.id, e]));
}

function svgOf(shot: { mime_type: string; base64: string }): string {
  return Buffer.from(shot.base64, "base64").toString("utf8");
}

describe("schematicRenderer", () => {
  it("emits base64 image/svg+xml", async () => {
    const shot = await schematicRenderer(SCHEMA, els([]));
    expect(shot.mime_type).toBe("image/svg+xml");
    expect(svgOf(shot)).toMatch(/^<svg /);
  });

  it("is deterministic regardless of element/kind order", async () => {
    const a: Element = { id: "e1", kind: "note", data: { text: "one" } };
    const b: Element = { id: "e2", kind: "note", data: { text: "two" } };
    const c: Element = { id: "e3", kind: "card", data: { n: 3 } };
    const forward = await schematicRenderer(SCHEMA, els([a, b, c]));
    const shuffled = await schematicRenderer(SCHEMA, els([c, b, a]));
    expect(shuffled.base64).toBe(forward.base64);
  });

  it("canonicalizes data key order — reversed keys yield identical bytes", async () => {
    const forward: Element = { id: "e1", kind: "note", data: { a: 1, b: 2, meta: { x: 1, y: 2 } } };
    const reversed: Element = {
      id: "e1",
      kind: "note",
      data: { meta: { y: 2, x: 1 }, b: 2, a: 1 },
    };
    const shotA = await schematicRenderer(SCHEMA, els([forward]));
    const shotB = await schematicRenderer(SCHEMA, els([reversed]));
    expect(shotB.base64).toBe(shotA.base64);
  });

  it("renders id, kind and data key/values", async () => {
    const svg = svgOf(
      await schematicRenderer(
        SCHEMA,
        els([{ id: "e1", kind: "note", data: { text: "hi", n: 2 } }]),
      ),
    );
    expect(svg).toContain("e1 · note");
    expect(svg).toContain("text: hi");
    expect(svg).toContain("n: 2");
  });

  it("XML-escapes ids, kinds and values", async () => {
    const svg = svgOf(
      await schematicRenderer(SCHEMA, els([{ id: "a&b", kind: "k<x>", data: { q: '"<&>"' } }])),
    );
    expect(svg).toContain("a&amp;b");
    expect(svg).toContain("k&lt;x&gt;");
    expect(svg).toContain("&quot;&lt;&amp;&gt;&quot;");
    // no raw unescaped angle brackets leaked from data
    expect(svg).not.toContain("k<x>");
  });

  it("serializes object/array values as compact JSON", async () => {
    const svg = svgOf(
      await schematicRenderer(
        SCHEMA,
        els([{ id: "e1", kind: "note", data: { tags: ["a", "b"] } }]),
      ),
    );
    expect(svg).toContain("tags: [&quot;a&quot;,&quot;b&quot;]");
  });
});
