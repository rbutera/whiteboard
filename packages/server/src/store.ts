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
