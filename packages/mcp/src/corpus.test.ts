import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ElementSchema, type Event, EventSchema, OpsSchema, WireSchema } from "@wboard/core";
import { project } from "@wboard/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createWhiteboardMcpServer } from "./facade.js";

/**
 * The MCP-facade corpus runner: the *whole* shared corpus driven end-to-end
 * through a real MCP `Client` over `InMemoryTransport` — the executable proof
 * that the facade folds the log into the projection the fixtures declare, over
 * the wire the SDK exercises. Mirrors `@wboard/server`'s runner tool-for-tool.
 *
 * A malformed or misplaced fixture throws at load time — never silently skipped.
 */

const FIXTURES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../spec/fixtures");

const ExpectSchema = z.union([z.literal("accept"), z.object({ reject: z.string() })]);

const ValidateFixtureSchema = z.object({
  schema: WireSchema,
  input: z.object({ ops: OpsSchema }),
  expect: ExpectSchema,
});

const ProjectFixtureSchema = z.object({
  schema: WireSchema,
  batches: z.array(z.object({ actor: z.string(), ops: OpsSchema, expect: ExpectSchema })),
  expect: z.object({
    state: z.record(z.string(), ElementSchema),
    events: z.array(EventSchema),
  }),
});

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

/** A fresh MCP `Client` connected to a fresh facade over `InMemoryTransport`. */
async function connect(): Promise<Client> {
  const { server } = createWhiteboardMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "corpus", version: "0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

async function createBoard(client: Client, schema: unknown): Promise<string> {
  const res = await client.callTool({ name: "create_board", arguments: { schema } });
  return (res.structuredContent as { board_id: string }).board_id;
}

async function applyOps(client: Client, board: string, ops: unknown, actor?: string) {
  const res = await client.callTool({
    name: "apply_ops",
    arguments: actor ? { board_id: board, ops, actor } : { board_id: board, ops },
  });
  expect(res.isError, "apply_ops must never be a transport error for corpus input").toBeFalsy();
  return res.structuredContent;
}

async function getEvents(client: Client, board: string): Promise<Event[]> {
  const res = await client.callTool({ name: "get_events", arguments: { board_id: board } });
  return (res.structuredContent as { events: Event[] }).events;
}

describe("mcp corpus", () => {
  it("has fixtures to run", () => {
    expect(acceptFixtures.length).toBeGreaterThan(0);
    expect(rejectFixtures.length).toBeGreaterThan(0);
    expect(projectFixtures.length).toBeGreaterThan(0);
  });

  describe("accept/ applies cleanly through the facade", () => {
    for (const { file, raw } of acceptFixtures) {
      it(`${file} accepts and appends`, async () => {
        const fx = ValidateFixtureSchema.parse(raw);
        expect(fx.expect).toBe("accept");
        const client = await connect();
        const board = await createBoard(client, fx.schema);
        expect(await applyOps(client, board, fx.input.ops, "corpus")).toEqual({ ok: true });
        await client.close();
      });
    }
  });

  describe("reject/ is rejected with its code and appends nothing", () => {
    for (const { file, raw } of rejectFixtures) {
      it(`${file} rejects and leaves the log empty`, async () => {
        const fx = ValidateFixtureSchema.parse(raw);
        if (fx.expect === "accept") throw new Error(`${file} is in reject/ but expects accept`);
        const client = await connect();
        const board = await createBoard(client, fx.schema);
        expect(await applyOps(client, board, fx.input.ops, "corpus")).toEqual({
          ok: false,
          code: fx.expect.reject,
          message: expect.any(String),
        });
        expect(await getEvents(client, board)).toEqual([]);
        await client.close();
      });
    }
  });

  describe("project/ folds the log into the declared projection", () => {
    for (const { file, raw } of projectFixtures) {
      it(`${file} folds to its expected state and events`, async () => {
        const fx = ProjectFixtureSchema.parse(raw);
        const client = await connect();
        const board = await createBoard(client, fx.schema);

        for (const [i, batch] of fx.batches.entries()) {
          const result = await applyOps(client, board, batch.ops, batch.actor);
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

        const events = await getEvents(client, board);
        expect(events, `events of ${file}`).toEqual(fx.expect.events);
        // Wire clients fold events themselves — the same fold SPEC.md prescribes.
        const state = Object.fromEntries(project(events).elements);
        expect(state, `state of ${file}`).toEqual(fx.expect.state);
        await client.close();
      });
    }
  });

  describe("loader rejects unexpected corpus entries", () => {
    it("fails on a stray non-json file", () => {
      const dir = mkdtempSync(join(tmpdir(), "mcp-corpus-stray-"));
      writeFileSync(join(dir, "notes.txt"), "not a fixture");
      expect(() => loadFixtures(dir)).toThrow(/unexpected non-fixture entry/);
    });

    it("fails on a nested fixture directory (no silent skip)", () => {
      const dir = mkdtempSync(join(tmpdir(), "mcp-corpus-nested-"));
      mkdirSync(join(dir, "nested"));
      writeFileSync(join(dir, "nested", "a.json"), "{}");
      expect(() => loadFixtures(dir)).toThrow(/unexpected non-fixture entry/);
    });

    it("exempts .gitkeep only", () => {
      const dir = mkdtempSync(join(tmpdir(), "mcp-corpus-gitkeep-"));
      writeFileSync(join(dir, ".gitkeep"), "");
      expect(loadFixtures(dir)).toEqual([]);
    });

    it("fails on a hidden entry that is not .gitkeep", () => {
      const dir = mkdtempSync(join(tmpdir(), "mcp-corpus-hidden-"));
      writeFileSync(join(dir, ".bad.json"), "{}");
      expect(() => loadFixtures(dir)).toThrow(/unexpected non-fixture entry/);
    });

    it("fails on an unexpected entry in the fixture root", () => {
      const dir = mkdtempSync(join(tmpdir(), "mcp-corpus-root-"));
      mkdirSync(join(dir, "accept"));
      mkdirSync(join(dir, "surprise"));
      expect(() => assertRootLayout(dir, ROOT_LAYOUT)).toThrow(/unexpected entry in fixture root/);
    });
  });
});
