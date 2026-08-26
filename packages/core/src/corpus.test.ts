import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validate } from "./validate.js";
import { ERROR_CODES } from "./wire/errors.js";
import { OpsSchema } from "./wire/ops.js";
import { WireSchema } from "./wire/schema.js";

/**
 * The conformance corpus runner. Every fixture under `spec/fixtures/{accept,
 * reject}` is loaded, its `schema` parsed with the wire schema, its ops run
 * through `validate()`, and the verdict asserted against `expect` (exact code
 * on reject). Enum closure is enforced both ways: every code has ≥1 reject
 * fixture, and every fixture's reject code is in the enum. A malformed fixture
 * throws — it is never silently skipped.
 *
 * This is the executable twin of `spec/fixtures/README.md`; the Python twin
 * (A6) runs the identical corpus.
 */

const FIXTURES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../spec/fixtures");

// `reject` is a plain string at the envelope level (not the enum) so a
// bogus-code fixture parses here and is caught by the explicit closure
// assertion below, rather than failing opaquely at parse time.
const ExpectSchema = z.union([z.literal("accept"), z.object({ reject: z.string() })]);
const FixtureSchema = z.object({
  schema: WireSchema,
  input: z.object({ ops: OpsSchema }),
  expect: ExpectSchema,
});

/** Load every fixture file eagerly at collection time. A read or JSON error
 * throws here and fails the whole file — the corpus is never partially run. */
function loadFixtures(kind: "accept" | "reject"): { file: string; raw: unknown }[] {
  const dir = join(FIXTURES_ROOT, kind);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((file) => ({ file, raw: JSON.parse(readFileSync(join(dir, file), "utf8")) }));
}

const acceptFixtures = loadFixtures("accept");
const rejectFixtures = loadFixtures("reject");

describe("conformance corpus", () => {
  it("has fixtures to run", () => {
    expect(acceptFixtures.length).toBeGreaterThan(0);
    expect(rejectFixtures.length).toBeGreaterThan(0);
  });

  describe("accept/", () => {
    for (const { file, raw } of acceptFixtures) {
      it(`${file} accepts`, () => {
        const fx = FixtureSchema.parse(raw);
        expect(fx.expect).toBe("accept");
        expect(validate(fx.schema, fx.input.ops, new Set())).toEqual({ ok: true });
      });
    }
  });

  describe("reject/", () => {
    for (const { file, raw } of rejectFixtures) {
      it(`${file} rejects with its declared code`, () => {
        const fx = FixtureSchema.parse(raw);
        if (fx.expect === "accept") throw new Error(`${file} is in reject/ but expects accept`);
        const code = fx.expect.reject;
        // Closure, direction (b): every fixture's reject code is in the enum.
        expect(ERROR_CODES as readonly string[]).toContain(code);
        const result = validate(fx.schema, fx.input.ops, new Set());
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe(code);
      });
    }
  });

  it("closure: every enum code has at least one reject fixture", () => {
    const seen = new Set(
      rejectFixtures.map(({ raw }) => {
        const fx = FixtureSchema.parse(raw);
        if (fx.expect === "accept") return "";
        return fx.expect.reject;
      }),
    );
    for (const code of ERROR_CODES) expect(seen).toContain(code);
  });
});
