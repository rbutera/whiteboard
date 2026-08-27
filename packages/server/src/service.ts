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
} from "@wboard/core";
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
  /** Per-board apply serialization — the tail of each board's promise chain, so
   * concurrent `apply` calls to the same board run one at a time (read-log →
   * validate → append is not interleaved). Deleted when a board's chain drains.
   * ponytail: in-process serialization; a multi-process deployment needs
   * store-level CAS on append, not this. */
  readonly #applyChains = new Map<string, Promise<unknown>>();

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
   * Concurrent applies to the same board are **serialized** (a per-board promise
   * chain) so the read-log → validate → append window cannot interleave — the
   * service is the single writer in the embeddable model, so it does not need
   * store-level compare-and-set.
   *
   * Throws if the board is unknown.
   */
  apply(boardId: string, ops: readonly Op[], actor: string): Promise<ApplyResponse> {
    const prior = this.#applyChains.get(boardId) ?? Promise.resolve();
    const run = prior.then(() => this.#applyLocked(boardId, ops, actor));
    // The chain tail must never reject, or a failed apply would wedge the board.
    const tail = run.catch(() => {});
    this.#applyChains.set(boardId, tail);
    void tail.then(() => {
      if (this.#applyChains.get(boardId) === tail) this.#applyChains.delete(boardId);
    });
    return run;
  }

  async #applyLocked(boardId: string, ops: readonly Op[], actor: string): Promise<ApplyResponse> {
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
