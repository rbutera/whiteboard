import type { Event, Op, WireSchema } from "@whtbrd/core";

/**
 * The pluggable persistence contract — log + schema only, the seam Rennet's B4
 * plugs its own storage into. State is never stored: it is always a projection
 * of the log (see `project.ts`), so there are no projection methods here.
 *
 * Everything is Promise-returning so a host can back it with async I/O. The
 * shipped {@link InMemoryBoardStore} is the reference implementation; a
 * conforming store need only honour this contract. Node stdlib + `@whtbrd/core`
 * types only — no database dependencies.
 *
 * **Ownership.** An implementation MUST NOT alias caller-supplied memory: the
 * `schema` and `op`s it is handed are copied on write, and every read (`getSchema`,
 * `getEvents`, `append`'s return) hands back a copy. So a caller mutating what it
 * passed in, or what it read back, can never reach into stored state — the log is
 * the single source of truth and only the store writes it.
 */
export interface BoardStore {
  /** Register a board under `boardId` with its declared wire schema. */
  createBoard(boardId: string, schema: WireSchema): Promise<void>;

  /** The board's declared schema, or `undefined` for an unknown board. */
  getSchema(boardId: string): Promise<WireSchema | undefined>;

  /**
   * Atomically append `entries` to the board's log, assigning each a
   * contiguous `seq` (the log starts at 1). A batch's events land contiguously
   * or not at all. Returns the appended events with their assigned seqs.
   */
  append(boardId: string, entries: readonly AppendEntry[]): Promise<Event[]>;

  /**
   * The board's events with `seq > afterSeq`, in seq order. An unknown board
   * yields an empty list — reads never throw on absence.
   */
  getEvents(boardId: string, afterSeq: number): Promise<Event[]>;
}

/** One log entry to append: an op attributed to an actor. The store assigns
 * the seq — the caller supplies only the op and who acted. */
export interface AppendEntry {
  actor: string;
  op: Op;
}

/**
 * The reference {@link BoardStore}: an in-process append-only log per board,
 * held in a Map. Single-threaded JS makes append trivially atomic — seqs are
 * assigned and pushed in one synchronous step, so a batch is contiguous or
 * absent. `structuredClone` at every boundary honours the interface's ownership
 * rule: stored schema and ops never alias caller memory, and reads hand back
 * deep copies (fixtures are plain JSON, so `structuredClone` is total here). No
 * persistence beyond the process; a host wanting durability supplies its own
 * {@link BoardStore}.
 */
export class InMemoryBoardStore implements BoardStore {
  readonly #boards = new Map<string, { schema: WireSchema; events: Event[] }>();

  createBoard(boardId: string, schema: WireSchema): Promise<void> {
    if (this.#boards.has(boardId)) {
      return Promise.reject(new Error(`board already exists: ${boardId}`));
    }
    this.#boards.set(boardId, { schema: structuredClone(schema), events: [] });
    return Promise.resolve();
  }

  getSchema(boardId: string): Promise<WireSchema | undefined> {
    const schema = this.#boards.get(boardId)?.schema;
    return Promise.resolve(schema === undefined ? undefined : structuredClone(schema));
  }

  append(boardId: string, entries: readonly AppendEntry[]): Promise<Event[]> {
    const board = this.#boards.get(boardId);
    if (!board) return Promise.reject(new Error(`unknown board: ${boardId}`));
    const base = board.events.length;
    const appended: Event[] = entries.map((entry, i) => ({
      seq: base + i + 1,
      actor: entry.actor,
      op: structuredClone(entry.op),
    }));
    board.events.push(...appended);
    return Promise.resolve(structuredClone(appended));
  }

  getEvents(boardId: string, afterSeq: number): Promise<Event[]> {
    const board = this.#boards.get(boardId);
    if (!board) return Promise.resolve([]);
    return Promise.resolve(structuredClone(board.events.filter((e) => e.seq > afterSeq)));
  }
}
