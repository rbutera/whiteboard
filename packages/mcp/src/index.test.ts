import { PROTOCOL_VERSION } from "@wboard/core";
import { describe, expect, it } from "vitest";
import { IMPLEMENTED_PROTOCOL_VERSION } from "./index.js";

describe("@wboard/mcp", () => {
  it("speaks the protocol version declared by @wboard/core", () => {
    expect(IMPLEMENTED_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION);
    expect(IMPLEMENTED_PROTOCOL_VERSION).toBe("0.1");
  });
});
