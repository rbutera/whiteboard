import { PROTOCOL_VERSION } from "@whiteboard/core";
import { describe, expect, it } from "vitest";
import { IMPLEMENTED_PROTOCOL_VERSION } from "./index.js";

describe("@whiteboard/server", () => {
  it("implements the protocol version declared by @whiteboard/core", () => {
    // Cross-package resolution proof: server consumes core's exported constant.
    expect(IMPLEMENTED_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION);
    expect(IMPLEMENTED_PROTOCOL_VERSION).toBe("0.1");
  });
});
