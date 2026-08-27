import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ElementSchema, EventSchema, OpsSchema, WireSchema } from "@whtbrd/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BoardService } from "./service.js";

/**
 * The server-side corpus runner. It runs the *whole* shared corpus end-to-end
 * through {@link BoardService} — the executable proof that the reference server
 * folds the log into the projection the fixtures declare.
 *
 * - `accept/` + `reject/` (A2's validate cases): create a board with the
 *   fixture schema, `apply` the ops in one batch, assert the verdict (exact
 *   code on reject), and that a reject leaves the log empty (all-or-nothing).
 * - `project/` (A3's log→projection cases): run each batch through `apply`,
 *   assert every batch's verdict, then deep-equal `getState` against
 *   `expect.state` and `getEvents` against `expect.events`.
 *
 * A malformed or misplaced fixture throws at load time — it is never silently
 * skipped (mirrors `@whtbrd/core`'s runner). The Python twin (A6) runs this
 * same corpus against its own server.
 */

const FIXTURES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../spec/fixtures");

const ExpectSchema = z.union([z.literal("accept"), z.object({ reject: z.string() })]);

// A2 validate fixture: one batch of ops with a single verdict.
const ValidateFixtureSchema = z.object({
  schema: WireSchema,
  input: z.object({ ops: OpsSchema }),
  expect: ExpectSchema,
});

// A3 projection fixture: ordered attributed batches folding to a final state
// and the full emitted event log.
const ProjectFixtureSchema = z.object({
  schema: WireSchema,
  batches: z.array(z.object({ actor: z.string(), ops: OpsSchema, expect: ExpectSchema })),
  expect: z.object({
    state: z.record(z.string(), ElementSchema),
    events: z.array(EventSchema),
  }),
});

/**
 * Load every `.json` fixture in a corpus directory eagerly. Only `.gitkeep` is
 * exempt; a stray file, a misnamed fixture, a nested subdirectory, or any other
 * hidden dotfile/dotdir throws rather than being skipped (a silent skip lets a
 * fixture never run and pass falsely). A read or JSON error also throws.
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

/**
 * The fixture root's own layout is closed too: a stray root-level fixture or an
 * unexpected fourth directory would otherwise go silently untested (the loaders
 * only open the dirs named below). Anything not in `allowed` throws.
 */
function assertRootLayout(root: string, allowed: ReadonlySet<string>): void {
  for (const entry of readdirSync(root)) {
    if (!allowed.has(entry)) {
      throw new Error(`unexpected entry in fixture root: ${join(root, entry)}`);
    }
  }
}

const ROOT_LAYOUT = new Set([".gitkeep", "README.md", "accept", "reject", "project"]);
assertRootLayout(FIXTURES_ROOT, ROOT_LAYOUT);

const acceptFixtures = loadFixtures(join(FIXTURES_ROOT, "accept"));
const rejectFixtures = loadFixtures(join(FIXTURES_ROOT, "reject"));
const projectFixtures = loadFixtures(join(FIXTURES_ROOT, "project"));

describe("server corpus", () => {
  it("has fixtures to run", () => {
    expect(acceptFixtures.length).toBeGreaterThan(0);
    expect(rejectFixtures.length).toBeGreaterThan(0);
    expect(projectFixtures.length).toBeGreaterThan(0);
  });

  describe("accept/ applies cleanly through the service", () => {
    for (const { file, raw } of acceptFixtures) {
      it(`${file} accepts and appends`, async () => {
        const fx = ValidateFixtureSchema.parse(raw);
        expect(fx.expect).toBe("accept");
        const svc = new BoardService();
        const board = await svc.createBoard(fx.schema);
        expect(await svc.apply(board, fx.input.ops, "corpus")).toEqual({ ok: true });
      });
    }
  });

  describe("reject/ is rejected with its code and appends nothing", () => {
    for (const { file, raw } of rejectFixtures) {
      it(`${file} rejects and leaves the log empty`, async () => {
        const fx = ValidateFixtureSchema.parse(raw);
        if (fx.expect === "accept") throw new Error(`${file} is in reject/ but expects accept`);
        const svc = new BoardService();
        const board = await svc.createBoard(fx.schema);
        expect(await svc.apply(board, fx.input.ops, "corpus")).toEqual({
          ok: false,
          code: fx.expect.reject,
          message: expect.any(String),
        });
        expect((await svc.getEvents(board)).events).toEqual([]);
      });
    }
  });

  describe("project/ folds the log into the declared projection", () => {
    for (const { file, raw } of projectFixtures) {
      it(`${file} folds to its expected state and events`, async () => {
        const fx = ProjectFixtureSchema.parse(raw);
        const svc = new BoardService();
        const board = await svc.createBoard(fx.schema);

        for (const [i, batch] of fx.batches.entries()) {
          const result = await svc.apply(board, batch.ops, batch.actor);
          if (batch.expect === "accept") {
            expect(result, `batch ${i} of ${file}`).toEqual({ ok: true });
          } else {
            expect(result, `batch ${i} of ${file}`).toEqual({
              ok: false,
              code: batch.expect.reject,
              message: expect.any(String),
            });
          }
        }

        const state = Object.fromEntries(await svc.getState(board));
        expect(state).toEqual(fx.expect.state);
        expect((await svc.getEvents(board)).events).toEqual(fx.expect.events);
      });
    }
  });

  describe("loader rejects unexpected corpus entries", () => {
    it("fails on a stray non-json file", () => {
      const dir = mkdtempSync(join(tmpdir(), "server-corpus-stray-"));
      writeFileSync(join(dir, "notes.txt"), "not a fixture");
      expect(() => loadFixtures(dir)).toThrow(/unexpected non-fixture entry/);
    });

    it("fails on a nested fixture directory (no silent skip)", () => {
      const dir = mkdtempSync(join(tmpdir(), "server-corpus-nested-"));
      mkdirSync(join(dir, "nested"));
      writeFileSync(join(dir, "nested", "a.json"), "{}");
      expect(() => loadFixtures(dir)).toThrow(/unexpected non-fixture entry/);
    });

    it("exempts .gitkeep only", () => {
      const dir = mkdtempSync(join(tmpdir(), "server-corpus-gitkeep-"));
      writeFileSync(join(dir, ".gitkeep"), "");
      expect(loadFixtures(dir)).toEqual([]);
    });

    it("fails on a hidden entry that is not .gitkeep", () => {
      const dir = mkdtempSync(join(tmpdir(), "server-corpus-hidden-"));
      writeFileSync(join(dir, ".bad.json"), "{}");
      expect(() => loadFixtures(dir)).toThrow(/unexpected non-fixture entry/);
    });

    it("fails on an unexpected entry in the fixture root", () => {
      const dir = mkdtempSync(join(tmpdir(), "server-corpus-root-"));
      mkdirSync(join(dir, "accept"));
      mkdirSync(join(dir, "surprise"));
      expect(() => assertRootLayout(dir, ROOT_LAYOUT)).toThrow(/unexpected entry in fixture root/);
    });
  });
});
