import { PROTOCOL_VERSION } from "@whtbrd/core";
import { describe, expect, it } from "vitest";
import { IMPLEMENTED_PROTOCOL_VERSION } from "./index.js";

describe("@whtbrd/server", () => {
  it("implements the protocol version declared by @whtbrd/core", () => {
    // Cross-package resolution proof: server consumes core's exported constant.
    expect(IMPLEMENTED_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION);
    expect(IMPLEMENTED_PROTOCOL_VERSION).toBe("0.1");
  });
});
