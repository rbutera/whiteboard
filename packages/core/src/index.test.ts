import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "./index.js";

describe("@wboard/core", () => {
  it("declares the protocol version owned by SPEC.md", () => {
    expect(PROTOCOL_VERSION).toBe("0.1");
  });
});
