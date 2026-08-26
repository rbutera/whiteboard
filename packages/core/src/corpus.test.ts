import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

/**
 * Load every fixture file in a corpus directory eagerly at collection time. The
 * corpus is a flat set of `.json` files. Only `.gitkeep` is exempt; every other
 * entry — a stray file, a misnamed fixture, a nested subdirectory, or any other
 * hidden dotfile/dotdir (a `.bad.json`, a `.nested/`) — throws rather than being
 * silently skipped (a silent skip lets a fixture never run and pass falsely). A
 * read or JSON error also throws.
 */
function loadFixtures(dir: string): { file: string; raw: unknown }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === ".gitkeep") return [];
    const full = join(dir, entry.name);
    if (entry.name.startsWith(".") || entry.isDirectory() || !entry.name.endsWith(".json")) {
      throw new Error(`unexpected non-fixture entry in corpus: ${full}`);
    }
    return [{ file: entry.name, raw: JSON.parse(readFileSync(full, "utf8")) }];
  });
}

const acceptFixtures = loadFixtures(join(FIXTURES_ROOT, "accept"));
const rejectFixtures = loadFixtures(join(FIXTURES_ROOT, "reject"));

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
        expect(validate(fx.schema, fx.input.ops, new Map())).toEqual({ ok: true });
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
        const result = validate(fx.schema, fx.input.ops, new Map());
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe(code);
      });
    }
  });

  describe("loader rejects unexpected corpus entries", () => {
    it("fails on a stray non-json file", () => {
      const dir = mkdtempSync(join(tmpdir(), "corpus-stray-"));
      writeFileSync(join(dir, "notes.txt"), "not a fixture");
      expect(() => loadFixtures(dir)).toThrow(/unexpected non-fixture entry/);
    });

    it("fails on a nested fixture directory (no silent skip)", () => {
      const dir = mkdtempSync(join(tmpdir(), "corpus-nested-"));
      mkdirSync(join(dir, "nested"));
      writeFileSync(join(dir, "nested", "a.json"), "{}");
      expect(() => loadFixtures(dir)).toThrow(/unexpected non-fixture entry/);
    });

    it("exempts .gitkeep only", () => {
      const dir = mkdtempSync(join(tmpdir(), "corpus-gitkeep-"));
      writeFileSync(join(dir, ".gitkeep"), "");
      expect(loadFixtures(dir)).toEqual([]);
    });

    it("fails on a hidden entry that is not .gitkeep", () => {
      const dir = mkdtempSync(join(tmpdir(), "corpus-hidden-"));
      writeFileSync(join(dir, ".bad.json"), "{}");
      expect(() => loadFixtures(dir)).toThrow(/unexpected non-fixture entry/);
    });
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
