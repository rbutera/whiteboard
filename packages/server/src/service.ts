import { randomUUID } from "node:crypto";
import {
  type ApplyResponse,
  type DescribeResponse,
  type Element,
  type EventsResponse,
  type Op,
  PROTOCOL_VERSION,
  type WireSchema,
  validate,
} from "@whtbrd/core";
import { project } from "./project.js";
import { type BoardStore, InMemoryBoardStore } from "./store.js";

/**
 * The embeddable reference board service — an in-process library over a
 * {@link BoardStore}, no transport, no sessions, no auth. Truth is the store's
 * append-only attributed event log; state is the {@link project} fold of it,
 * rebuilt per call (the lazy, cache-free implementation). A host embeds this
 * and supplies its own store; the default is a fresh {@link InMemoryBoardStore}.
 *
 * Unknown `board_id` throws a plain `Error` everywhere — the closed error enum
 * belongs to `apply` validation only.
 */
export class BoardService {
  readonly #store: BoardStore;

  constructor(store: BoardStore = new InMemoryBoardStore()) {
    this.#store = store;
  }

  /** Mint a board id, store its declared schema, return the id. */
  async createBoard(schema: WireSchema): Promise<string> {
    const boardId = randomUUID();
    await this.#store.createBoard(boardId, schema);
    return boardId;
  }

  /** The board's declared schema. Throws if the board is unknown. */
  async getSchema(boardId: string): Promise<WireSchema> {
    return this.#requireSchema(boardId);
  }

  /** Board metadata + the implemented protocol version. Throws if unknown. */
  async describe(boardId: string): Promise<DescribeResponse> {
    await this.#requireSchema(boardId);
    return { board_id: boardId, protocol_version: PROTOCOL_VERSION };
  }

  /**
   * Events with `seq > cursor` (default 0), in order. The returned `cursor` is
   * the last served event's seq, or the request's cursor when nothing is new.
   * Throws if the board is unknown.
   */
  async getEvents(boardId: string, cursor = 0): Promise<EventsResponse> {
    await this.#requireSchema(boardId);
    const events = await this.#store.getEvents(boardId, cursor);
    const last = events.at(-1)?.seq ?? cursor;
    return { events, cursor: last };
  }

  /**
   * The projected board state — a library API for embedders, not a wire tool.
   * Throws if the board is unknown.
   */
  async getState(boardId: string): Promise<ReadonlyMap<string, Element>> {
    await this.#requireSchema(boardId);
    const log = await this.#store.getEvents(boardId, 0);
    return project(log).elements;
  }

  /**
   * Apply a flat ordered ops list, all-or-nothing, attributing each accepted op
   * to `actor`. In order:
   *
   * 1. **dedup** — drop any op whose `op_id` already appears in the board's log
   *    or earlier in this same batch (before validation). An all-duplicate
   *    batch returns `{ ok: true }` and appends nothing: replay is idempotent.
   * 2. **validate** — core's `validate()` against the projection's id→kind map,
   *    all-or-nothing; a rejection is returned verbatim and appends nothing.
   * 3. **append** — one event per surviving op, atomically, actor recorded.
   *
   * Throws if the board is unknown.
   */
  async apply(boardId: string, ops: readonly Op[], actor: string): Promise<ApplyResponse> {
    const schema = await this.#requireSchema(boardId);
    const log = await this.#store.getEvents(boardId, 0);

    const seen = new Set(log.map((e) => e.op.op_id));
    const survivors: Op[] = [];
    for (const op of ops) {
      if (seen.has(op.op_id)) continue;
      seen.add(op.op_id);
      survivors.push(op);
    }
    if (survivors.length === 0) return { ok: true };

    const result = validate(schema, survivors, project(log).kinds);
    if (!result.ok) return { ok: false, code: result.code, message: result.message };

    await this.#store.append(
      boardId,
      survivors.map((op) => ({ actor, op })),
    );
    return { ok: true };
  }

  async #requireSchema(boardId: string): Promise<WireSchema> {
    const schema = await this.#store.getSchema(boardId);
    if (schema === undefined) throw new Error(`unknown board: ${boardId}`);
    return schema;
  }
}
