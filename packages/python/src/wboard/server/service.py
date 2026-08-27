"""The embeddable reference board service — an in-process library over a
:class:`BoardStore`, no transport, no sessions, no auth. Truth is the store's
append-only attributed event log; state is the :func:`project` fold of it,
rebuilt per call.

``apply`` holds a per-board lock across the whole read/dedup/validate/append
window, so concurrent applies to the same board are serialized — the honest twin
of the TS per-board promise chain. Without it, two threads read the same log,
both dedup clean, both validate against the same projection, and both append (a
duplicate ``op_id`` lands twice). SPEC.md §Concurrency makes single-writer
serialization a MUST.

Unknown ``board_id`` raises a plain exception everywhere — the closed error enum
belongs to ``apply`` validation only.
"""

import threading
from collections.abc import Sequence
from uuid import uuid4

from ..core import (
    PROTOCOL_VERSION,
    ApplyAccepted,
    ApplyRejected,
    ApplyResponse,
    DescribeResponse,
    Element,
    EventsResponse,
    Op,
    WireSchema,
    validate,
)
from .project import project
from .store import AppendEntry, BoardStore, InMemoryBoardStore


class BoardService:
    def __init__(self, store: BoardStore | None = None) -> None:
        self._store: BoardStore = store if store is not None else InMemoryBoardStore()
        # Per-board apply lock; the registry itself is guarded so two threads
        # racing the first apply to a board share one lock.
        # ponytail: locks are never reclaimed — fine for the in-memory reference
        # (boards are few); a durable multi-board store would evict idle ones.
        self._board_locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    def _board_lock(self, board_id: str) -> threading.Lock:
        with self._locks_guard:
            return self._board_locks.setdefault(board_id, threading.Lock())

    def create_board(self, schema: WireSchema) -> str:
        """Mint a board id, store its declared schema, return the id."""
        board_id = str(uuid4())
        self._store.create_board(board_id, schema)
        return board_id

    def get_schema(self, board_id: str) -> WireSchema:
        """The board's declared schema. Raises if the board is unknown."""
        return self._require_schema(board_id)

    def describe(self, board_id: str) -> DescribeResponse:
        """Board metadata + the implemented protocol version. Raises if unknown."""
        self._require_schema(board_id)
        return DescribeResponse(board_id=board_id, protocol_version=PROTOCOL_VERSION)

    def get_events(self, board_id: str, cursor: int = 0) -> EventsResponse:
        """Events with ``seq > cursor`` (default 0), in order. The returned
        ``cursor`` is the last served event's seq, or the request's cursor when
        nothing is new. Raises if the board is unknown."""
        self._require_schema(board_id)
        events = self._store.get_events(board_id, cursor)
        last = events[-1].seq if events else cursor
        return EventsResponse(events=events, cursor=last)

    def get_state(self, board_id: str) -> dict[str, Element]:
        """The projected board state — a library API for embedders, not a wire
        tool. Raises if the board is unknown."""
        self._require_schema(board_id)
        log = self._store.get_events(board_id, 0)
        return project(log).elements

    def apply(self, board_id: str, ops: Sequence[Op], actor: str) -> ApplyResponse:
        """Apply a flat ordered ops list, all-or-nothing, attributing each
        accepted op to ``actor``. In order:

        1. **dedup** — drop any op whose ``op_id`` already appears in the log or
           earlier in this same batch (before validation). An all-duplicate
           batch returns accepted and appends nothing: replay is idempotent.
        2. **validate** — against the projection's id→kind map, all-or-nothing;
           a rejection is returned verbatim and appends nothing.
        3. **append** — one event per surviving op, atomically, actor recorded.

        Concurrent applies to the same board are serialized by a per-board lock
        held across read/dedup/validate/append, so the window cannot interleave.

        Raises if the board is unknown."""
        with self._board_lock(board_id):
            schema = self._require_schema(board_id)
            log = self._store.get_events(board_id, 0)

            seen = {event.op.op_id for event in log}
            survivors: list[Op] = []
            for op in ops:
                if op.op_id in seen:
                    continue
                seen.add(op.op_id)
                survivors.append(op)
            if not survivors:
                return ApplyAccepted(ok=True)

            result = validate(schema, survivors, project(log).kinds)
            if isinstance(result, ApplyRejected):
                return result

            self._store.append(board_id, [AppendEntry(actor=actor, op=op) for op in survivors])
            return ApplyAccepted(ok=True)

    def _require_schema(self, board_id: str) -> WireSchema:
        schema = self._store.get_schema(board_id)
        if schema is None:
            raise LookupError(f"unknown board: {board_id}")
        return schema
