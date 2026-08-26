import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "./errors.js";
import {
  ApplyRequestSchema,
  ApplyResponseSchema,
  CreateRequestSchema,
  CreateResponseSchema,
  DescribeRequestSchema,
  DescribeResponseSchema,
  EventsRequestSchema,
  EventsResponseSchema,
  SchemaRequestSchema,
  SchemaResponseSchema,
  ScreenshotRequestSchema,
  ScreenshotResponseSchema,
} from "./tools.js";

const schema = { kinds: [{ id: "note", description: "a sticky", attributes: [] }] };

describe("create", () => {
  it("round-trips request and response", () => {
    expect(CreateRequestSchema.parse({ schema })).toEqual({ schema });
    expect(CreateResponseSchema.parse({ board_id: "b1" })).toEqual({ board_id: "b1" });
  });
});

describe("schema", () => {
  it("round-trips request and response", () => {
    expect(SchemaRequestSchema.parse({ board_id: "b1" })).toEqual({ board_id: "b1" });
    expect(SchemaResponseSchema.parse({ schema })).toEqual({ schema });
  });
});

describe("apply", () => {
  const ops = [{ op: "create", op_id: "o1", element: { id: "e1", kind: "note", data: {} } }];

  it("round-trips a request", () => {
    expect(ApplyRequestSchema.parse({ board_id: "b1", ops })).toEqual({ board_id: "b1", ops });
  });

  it("parses an accepted response", () => {
    expect(ApplyResponseSchema.parse({ ok: true })).toEqual({ ok: true });
  });

  it("parses a rejection carrying exactly one enum code", () => {
    const rej = { ok: false, code: "unknown-kind", message: "no such kind: widget" };
    const parsed = ApplyResponseSchema.parse(rej);
    expect(parsed.ok).toBe(false);
    if (parsed.ok === false) {
      expect(ERROR_CODES).toContain(parsed.code);
    }
  });

  it("rejects a rejection with a code outside the enum", () => {
    expect(ApplyResponseSchema.safeParse({ ok: false, code: "boom", message: "x" }).success).toBe(
      false,
    );
  });
});

describe("describe", () => {
  it("round-trips request and response", () => {
    expect(DescribeRequestSchema.parse({ board_id: "b1" })).toEqual({ board_id: "b1" });
    const res = { board_id: "b1", protocol_version: "0.1" };
    expect(DescribeResponseSchema.parse(res)).toEqual(res);
  });
});

describe("events", () => {
  it("round-trips request (with and without cursor) and response", () => {
    expect(EventsRequestSchema.parse({ board_id: "b1" }).cursor).toBeUndefined();
    expect(EventsRequestSchema.parse({ board_id: "b1", cursor: 3 }).cursor).toBe(3);
    const res = {
      events: [{ seq: 1, actor: "agent", op: { op: "delete", op_id: "o1", id: "e1" } }],
      cursor: 1,
    };
    expect(EventsResponseSchema.parse(res)).toEqual(res);
  });
});

describe("screenshot", () => {
  it("round-trips request and response", () => {
    expect(ScreenshotRequestSchema.parse({ board_id: "b1" })).toEqual({ board_id: "b1" });
    const res = { mime_type: "image/png", base64: "iVBORw0KGgo=" };
    expect(ScreenshotResponseSchema.parse(res)).toEqual(res);
  });
});
