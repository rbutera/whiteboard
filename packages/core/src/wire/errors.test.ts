import { describe, expect, it } from "vitest";
import { ERROR_CODES, ErrorCodeSchema } from "./errors.js";

describe("error codes", () => {
  it("is the closed set of six codes", () => {
    expect([...ERROR_CODES]).toEqual([
      "unknown-kind",
      "missing-required",
      "wrong-type",
      "bad-ref",
      "unknown-element",
      "duplicate-id",
    ]);
  });

  it("parses each defined code", () => {
    for (const code of ERROR_CODES) {
      expect(ErrorCodeSchema.parse(code)).toBe(code);
    }
  });

  it("rejects an undefined code", () => {
    expect(ErrorCodeSchema.safeParse("boom").success).toBe(false);
  });
});
